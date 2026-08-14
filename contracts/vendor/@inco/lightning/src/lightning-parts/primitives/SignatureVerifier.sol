// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ISignatureVerifier} from "./interfaces/ISignatureVerifier.sol";

contract SignatureVerifierStorage {

    struct StorageForSigVerifier {
        address[] signers;
        mapping(address => bool) isSigner;
        uint256 threshold;
    }

    // State changelog:
    // 0.2.0: Shifting state location to support multiple signers
    bytes32 private constant SIGNATURE_VERIFIER_STORAGE_LOCATION = keccak256("inco.storage.SignatureVerifier.v0.2.0");

    function getSigVerifierStorage() internal pure returns (StorageForSigVerifier storage $) {
        bytes32 loc = SIGNATURE_VERIFIER_STORAGE_LOCATION;
        assembly {
            $.slot := loc
        }
    }

}

abstract contract SignatureVerifier is ISignatureVerifier, OwnableUpgradeable, SignatureVerifierStorage {

    // we use ECDSA as the signers are meant to be EOAs controlled by TEEs, and no smart contract wallet
    using ECDSA for bytes32;

    error SignerNotFound(address signerAddress);
    error SignerAlreadyAdded(address signerAddress);
    error InvalidThreshold(uint256 threshold, uint256 nbOfSigners);

    event AddedSignatureVerifier(address signerAddress);
    event RemovedSignatureVerifier(address signerAddress);
    event ThresholdChanged(uint256 oldThreshold, uint256 newThreshold);

    /// @dev internal sensible function, should be used only as part of an onlyOwner function / access controlled
    function addSigner(address signerAddress) internal {
        StorageForSigVerifier storage $ = getSigVerifierStorage();
        require(!isSigner(signerAddress), SignerAlreadyAdded(signerAddress));
        $.signers.push(signerAddress);
        $.isSigner[signerAddress] = true;
        emit AddedSignatureVerifier(signerAddress);
    }

    function removeSigner(address signerAddress) external onlyOwner {
        StorageForSigVerifier storage $ = getSigVerifierStorage();
        require(isSigner(signerAddress), SignerNotFound(signerAddress));
        require($.signers.length - 1 >= $.threshold, InvalidThreshold($.threshold, $.signers.length - 1));

        // Find and remove the signer from the array
        for (uint256 i = 0; i < $.signers.length; i++) {
            if ($.signers[i] == signerAddress) {
                // Move the last element to this position and pop
                $.signers[i] = $.signers[$.signers.length - 1];
                $.signers.pop();
                break;
            }
        }

        $.isSigner[signerAddress] = false;
        emit RemovedSignatureVerifier(signerAddress);
    }

    function setThreshold(uint256 newThreshold) external onlyOwner {
        StorageForSigVerifier storage $ = getSigVerifierStorage();
        require(newThreshold <= $.signers.length, InvalidThreshold(newThreshold, $.signers.length));
        require(newThreshold > 0, InvalidThreshold(newThreshold, $.signers.length));

        uint256 oldThreshold = $.threshold;
        $.threshold = newThreshold;
        emit ThresholdChanged(oldThreshold, newThreshold);
    }

    function getThreshold() public view returns (uint256) {
        return getSigVerifierStorage().threshold;
    }

    function isSigner(address signerAddress) public view returns (bool) {
        return getSigVerifierStorage().isSigner[signerAddress];
    }

    /// @dev each signer id is NOT fixed, it can change over time, be removed, readded, etc.
    function getSignerAtIndex(uint256 index) public view returns (address) {
        return getSigVerifierStorage().signers[index];
    }

    function getSignersCount() public view returns (uint256) {
        return getSigVerifierStorage().signers.length;
    }

    /// @notice Verifies that a digest has been signed by at least `threshold` authorized signers
    /// @dev Duplicate detection is optimized when signatures are sorted by signer address (ascending)
    /// @dev Behavior notes:
    ///      - Returns false if threshold is 0 (not yet configured)
    ///      - Returns false if fewer signatures provided than threshold
    ///      - Invalid/malformed signatures are skipped (not counted, don't cause failure)
    ///      - If all signatures are invalid/malformed, returns false (no valid signatures can reach the threshold)
    ///      - Duplicate signers cause immediate rejection (returns false)
    ///      - Valid signatures from non-authorized addresses are skipped
    ///      - Processing stops early once threshold is reached (remaining signatures ignored)
    /// @dev Gas considerations:
    ///      - O(n) when signatures are sorted by signer address (ascending) - recommended
    ///      - O(n²) worst case when signatures are in reverse order (fallback duplicate detection)
    ///      - Callers should provide signatures in ascending signer address order for optimal gas usage
    /// @param digest The message digest (hash) that was signed
    /// @param signatures Array of ECDSA signatures
    /// @return bool True if at least `threshold` unique authorized signers signed the digest
    function isValidSignature(bytes32 digest, bytes[] memory signatures) public view returns (bool) {
        StorageForSigVerifier storage $ = getSigVerifierStorage();
        uint256 threshold = $.threshold;
        uint256 signaturesLength = signatures.length;

        // if threshold is 0, we can't accept any signatures yet
        if (threshold == 0 || signaturesLength < threshold) {
            return false;
        }

        // Track recovered signers for duplicate detection (only need signaturesLength slots max)
        address[] memory recoveredSigners = new address[](signaturesLength);
        address lastSigner = address(0);
        uint256 correctSignaturesCount = 0;
        uint256 validCount = 0; // Track number of valid (non-malformed) signatures processed

        for (uint256 i = 0; i < signaturesLength && correctSignaturesCount < threshold; i++) {
            (address currentSigner, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signatures[i]);

            // Skip invalid signatures (malformed, wrong length, etc.)
            if (err != ECDSA.RecoverError.NoError) {
                continue;
            }

            // Optimistic duplicate detection (OZ pattern)
            if (currentSigner > lastSigner) {
                // Fast path: signer is in ascending order
                lastSigner = currentSigner;
            } else {
                // Fallback: check all previous valid signers for duplicates
                for (uint256 j = 0; j < validCount; ++j) {
                    if (currentSigner == recoveredSigners[j]) {
                        return false; // Duplicate signer found
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
