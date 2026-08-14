// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {
    DecryptionAttestation,
    ElementAttestationWithProof,
    ReencryptionAttestation
} from "./DecryptionAttester.types.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureVerifier} from "./primitives/SignatureVerifier.sol";
import {IDecryptionAttester} from "./interfaces/IDecryptionAttester.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @title DecryptionAttester
/// @notice Verifies decryption attestations signed by covalidators.
/// @dev When a user requests decryption of an encrypted handle, the covalidator decrypts
/// the value and signs an attestation. This contract verifies that attestation using EIP-712
/// typed data signatures. The attestation binds a handle to its decrypted value, allowing
/// on-chain verification that a decryption was performed correctly by authorized covalidators.
abstract contract DecryptionAttester is IDecryptionAttester, SignatureVerifier, EIP712Upgradeable, PausableUpgradeable {

    using ECDSA for bytes32;

    /// @dev Thrown when attestations and signatures arrays have different lengths.
    error AttestationsSignaturesLengthMismatch(uint256 attestationsLength, uint256 signaturesLength);

    /// @dev EIP-712 type hash for DecryptionAttestation struct.
    bytes32 constant DECRYPTION_ATTESTATION_STRUCT_HASH =
        keccak256("DecryptionAttestation(bytes32 handle,bytes32 value)");

    /// @dev EIP-712 type hash for Reencryption struct.
    /// Matches the Go-side definition in eip712.go: Reencryption(bytes user_ciphertext,bytes32 handle,bytes signature)
    bytes32 constant REENCRYPTION_ATTESTATION_STRUCT_HASH =
        keccak256("Reencryption(bytes user_ciphertext,bytes32 handle,bytes signature)");

    /// @notice Computes the EIP-712 digest for a decryption attestation.
    /// @dev Used to verify signatures from covalidators attesting to a decryption result.
    /// @param decryption The decryption attestation containing the handle and decrypted value.
    /// @return The EIP-712 typed data hash that should be signed by covalidators.
    function decryptionAttestationDigest(DecryptionAttestation memory decryption) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(DECRYPTION_ATTESTATION_STRUCT_HASH, decryption.handle, decryption.value))
        );
    }

    /// @notice Computes the EIP-712 digest for a reencryption attestation.
    /// @param attestation The reencryption attestation containing handle, userCiphertext, and encryptedSignature.
    /// @return The EIP-712 typed data hash.
    function reencryptionAttestationDigest(ReencryptionAttestation memory attestation) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    REENCRYPTION_ATTESTATION_STRUCT_HASH,
                    keccak256(attestation.userCiphertext),
                    attestation.handle,
                    keccak256(attestation.encryptedSignature)
                )
            )
        );
    }

    /// @notice Validates a decryption attestation against covalidator signatures.
    /// @dev Verifies that the attestation was signed by the required threshold of covalidators.
    ///      Returns false unconditionally when this contract is paused.
    /// @param decryption The decryption attestation to validate.
    /// @param signatures Array of signatures from covalidators.
    /// @return True if the attestation has valid signatures from the required covalidators.
    function isValidDecryptionAttestation(DecryptionAttestation memory decryption, bytes[] calldata signatures)
        public
        view
        virtual
        returns (bool)
    {
        if (paused()) {
            return false;
        }
        return isValidSignature(decryptionAttestationDigest(decryption), signatures);
    }

    /// @notice Validates an elist decryption attestation with commitment proof against covalidator signatures.
    /// @dev Verifies that the attestation was signed by the required threshold of covalidators and validates the proof construction.
    ///      Each element can be either a pre-computed hash or a commitment-value pair.
    /// @param elistHandle The elist handle that was decrypted
    /// @param proofElements Array of proved values. Each can provide either pairHash directly, or commitment+value to compute the pairHash
    /// @param proof The expected proof that should match keccak256 of all concatenated pair hashes
    /// @param signatures Array of signatures from covalidators
    /// @return bool True if the attestation has valid signatures and proof verification succeeds
    function isValidEListDecryptionAttestation(
        bytes32 elistHandle,
        ElementAttestationWithProof[] calldata proofElements,
        bytes32 proof,
        bytes[] calldata signatures
    ) public view virtual override returns (bool) {
        if (paused()) {
            return false;
        }
        DecryptionAttestation memory attestation = DecryptionAttestation({handle: elistHandle, value: proof});

        // Verify the provided proof by reconstructing it from the provided value-commitment pairs and/or hashes.
        bytes32[] memory elementHashes = new bytes32[](proofElements.length);
        for (uint256 i = 0; i < proofElements.length; i++) {
            // Use pre-computed hash if provided, otherwise compute from commitment and value
            if (proofElements[i].pairHash != bytes32(0)) {
                elementHashes[i] = proofElements[i].pairHash;
            } else {
                elementHashes[i] = keccak256(abi.encodePacked(proofElements[i].commitment, proofElements[i].value));
            }
        }

        // Single allocation: encode all hashes at once
        bytes32 computedProof = keccak256(abi.encodePacked(elementHashes));
        if (computedProof != proof) {
            return false;
        }

        return isValidDecryptionAttestation(attestation, signatures);
    }

    /// @notice Validates reencryption attestations from multiple covalidators against the threshold.
    /// @dev Each covalidator produces a different ciphertext (X-Wing encryption is randomized),
    ///      so each attestation has a unique digest. Each is verified individually and the function
    ///      checks that at least `threshold` unique authorized signers attested.
    /// @param attestations Array of reencryption attestations, one per covalidator.
    /// @param signatures Array of envelope signatures, one per attestation (same order).
    /// @return True if at least `threshold` unique authorized covalidators signed valid attestations.
    function isValidReencryptionAttestation(
        ReencryptionAttestation[] calldata attestations,
        bytes[] calldata signatures
    ) public view virtual returns (bool) {
        if (paused()) {
            return false;
        }
        if (attestations.length != signatures.length) {
            revert AttestationsSignaturesLengthMismatch(attestations.length, signatures.length);
        }

        uint256 threshold = getThreshold();
        if (threshold == 0 || attestations.length < threshold) {
            return false;
        }

        address[] memory recoveredSigners = new address[](attestations.length);
        address lastSigner = address(0);
        uint256 correctSignaturesCount = 0;
        uint256 validCount = 0;

        for (uint256 i = 0; i < attestations.length && correctSignaturesCount < threshold; i++) {
            bytes32 digest = reencryptionAttestationDigest(attestations[i]);
            (address currentSigner, ECDSA.RecoverError err,) = digest.tryRecover(signatures[i]);

            if (err != ECDSA.RecoverError.NoError) {
                continue;
            }

            // Duplicate detection (same pattern as SignatureVerifier.isValidSignature)
            if (currentSigner > lastSigner) {
                lastSigner = currentSigner;
            } else {
                for (uint256 j = 0; j < validCount; ++j) {
                    if (currentSigner == recoveredSigners[j]) {
                        return false;
                    }
                }
            }

            recoveredSigners[validCount] = currentSigner;
            validCount++;

            if (isSigner(currentSigner)) {
                correctSignaturesCount++;
            }
        }

        return correctSignaturesCount >= threshold;
    }

}
