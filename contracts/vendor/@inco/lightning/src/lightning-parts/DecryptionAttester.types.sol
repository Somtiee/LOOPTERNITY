// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

struct DecryptionAttestation {
    bytes32 handle;
    bytes32 value; // encoded bool or uint256 // todo switch this to bytes
}

/**
 * @notice Represents a decrypted elist value that can be either a pre-computed hash or a commitment-value pair
 * @param pairHash Pre-computed keccak256(abi.encodePacked(commitment, value)). If non-zero, this is used directly
 * @param commitment Commitment value. Only used if pairHash is zero
 * @param value Decrypted value (encoded as bytes32 in Solidity). Only used if pairHash is zero
 * @dev If pairHash is provided (non-zero), commitment and value are ignored. Otherwise, hash is computed as
 *      keccak256(abi.encodePacked(commitment, value)) using Solidity's packed ABI encoding
 */
struct ElementAttestationWithProof {
    bytes32 pairHash;
    bytes32 commitment;
    bytes32 value;
}

struct ReencryptionAttestation {
    bytes32 handle;
    bytes userCiphertext;
    bytes encryptedSignature;
}
