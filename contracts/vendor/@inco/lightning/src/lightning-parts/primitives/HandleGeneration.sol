// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {
    ETypes,
    EOps,
    EVM_HOST_CHAIN_PREFIX,
    HANDLE_INDEX,
    HANDLE_VERSION,
    SEP_INPUT_HANDLE,
    SEP_OP_RESULT
} from "../../Types.sol";
import {HandleMetadata} from "./HandleMetadata.sol";
import {IHandleGeneration} from "./interfaces/IHandleGeneration.sol";

/// @title HandleGeneration
/// @notice Generates deterministic handles for encrypted values.
/// @dev Handles are unique identifiers for encrypted ciphertexts. They are computed deterministically
/// from the operation type and inputs, ensuring the same encrypted operation always produces the same
/// handle. This enables consistent state across chains and allows the covalidator to map handles to
/// their corresponding ciphertexts. Handles embed type and version metadata in their lower bytes.
contract HandleGeneration is IHandleGeneration, HandleMetadata {

    /// @notice Generates a handle for a trivially encrypted value.
    /// @dev Trivial encryption creates a handle from a known plaintext. The handle is deterministic
    /// based on the plaintext value, allowing the same plaintext to always produce the same handle.
    /// @param plaintextBytes The plaintext value as bytes32.
    /// @param handleType The type of encrypted value (euint256, ebool, etc.).
    /// @return generatedHandle The deterministic handle for this trivial encryption.
    function getTrivialEncryptHandle(bytes32 plaintextBytes, ETypes handleType)
        public
        pure
        returns (bytes32 generatedHandle)
    {
        // Trivial encrypt shares the op-result domain — uniqueness within the family is guaranteed
        // by EOps.TrivialEncrypt's unique op byte, and the DS prefix prevents cross-family collisions.
        // HANDLE_VERSION and handleType are folded into the preimage so the full handle is bound to
        // its claimed metadata, not just stamped onto bytes 30/31 after the fact.
        generatedHandle =
            keccak256(abi.encodePacked(SEP_OP_RESULT, HANDLE_VERSION, handleType, EOps.TrivialEncrypt, plaintextBytes));
        generatedHandle = embedTypeVersion(generatedHandle, handleType);
    }

    /// @notice Generates a handle for a client-encrypted input.
    /// @dev Internal version that uses the current contract as the executor address.
    /// The handle is computed from the ciphertext and context (chain, executor, user, contract).
    /// @param ciphertext The encrypted input data.
    /// @param user The user address that encrypted the value.
    /// @param contractAddress The contract submitting the input.
    /// @param version The version of the handle format.
    /// @param inputType The type of encrypted value.
    /// @return generatedHandle The deterministic handle for this input.
    function getInputHandle(
        bytes memory ciphertext,
        address user,
        address contractAddress,
        uint16 version,
        ETypes inputType
    ) internal view returns (bytes32 generatedHandle) {
        return getInputHandle(ciphertext, address(this), user, contractAddress, version, inputType);
    }

    /// @notice Generates a handle for a client-encrypted input with explicit executor.
    /// @dev The handle incorporates the full context (chain ID, executor, user, contract) to ensure
    /// uniqueness across different chains and deployments. This prevents replay attacks.
    /// @param ciphertext The encrypted input data.
    /// @param executorAddress The executor contract address.
    /// @param user The user address that encrypted the value.
    /// @param contractAddress The contract submitting the input.
    /// @param inputType The type of encrypted value.
    /// @return generatedHandle The deterministic handle for this input.
    function getInputHandle(
        bytes memory ciphertext,
        address executorAddress,
        address user,
        address contractAddress,
        uint16 version,
        ETypes inputType
    ) internal view returns (bytes32 generatedHandle) {
        // We must also propagate the handle metadata to the final handle
        generatedHandle = embedIndexTypeVersion(
            keccak256(
                abi.encodePacked(
                    SEP_INPUT_HANDLE,
                    HANDLE_VERSION,
                    inputType,
                    uint32(ciphertext.length),
                    ciphertext,
                    HANDLE_INDEX,
                    EVM_HOST_CHAIN_PREFIX,
                    block.chainid, // todo cache this
                    executorAddress,
                    user,
                    contractAddress,
                    version
                )
            ),
            inputType
        );
    }

    /// @notice Generates a handle for the result of an encrypted operation.
    /// @dev The handle is deterministic based on the operation type and input handles.
    /// This ensures that the same operation on the same inputs always produces the same result handle.
    /// @param op The operation type (eAdd, eSub, etc.).
    /// @param returnType The type of the result value.
    /// @param packedInputs The packed input handles.
    /// @return generatedHandle The deterministic handle for this operation result.
    function getOpResultHandle(EOps op, ETypes returnType, bytes memory packedInputs)
        public
        pure
        returns (bytes32 generatedHandle)
    {
        generatedHandle = embedTypeVersion(
            keccak256(abi.encodePacked(SEP_OP_RESULT, HANDLE_VERSION, returnType, op, packedInputs)), returnType
        );
    }

}
