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
} from "../DecryptionAttester.types.sol";

interface IDecryptionAttester {

    function decryptionAttestationDigest(DecryptionAttestation memory decryption) external view returns (bytes32);
    function isValidDecryptionAttestation(DecryptionAttestation memory decryption, bytes[] memory signatures)
        external
        view
        returns (bool);
    function isValidEListDecryptionAttestation(
        bytes32 elistHandle,
        ElementAttestationWithProof[] memory proofElements,
        bytes32 proof,
        bytes[] memory signatures
    ) external view returns (bool);
    function reencryptionAttestationDigest(ReencryptionAttestation memory attestation) external view returns (bytes32);
    function isValidReencryptionAttestation(
        ReencryptionAttestation[] calldata attestations,
        bytes[] calldata signatures
    ) external view returns (bool);

}
