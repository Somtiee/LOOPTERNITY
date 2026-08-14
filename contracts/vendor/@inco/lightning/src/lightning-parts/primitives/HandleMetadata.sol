// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {HANDLE_VERSION, HANDLE_INDEX, ETypes} from "../../Types.sol";

/// @title HandleMetadata
/// @notice Utilities for embedding and extracting metadata from encrypted value handles
/// @dev Handle structure (32 bytes / 256 bits):
///      - Bytes 0-28: Handle-specific data (hash, counters, etc.)
///      - Byte 29: Handle index (distinguishes input vs operation handles)
///      - Byte 30: Encrypted type (ETypes enum value)
///      - Byte 31: Handle version
contract HandleMetadata {

    /// @notice Thrown when a handle contains a type value outside the valid ETypes enum range.
    /// @param raw The raw uint8 value extracted from the handle.
    error InvalidTypeValue(uint8 raw);

    /// @notice Embeds the handle index, encrypted type, and protocol version into a handle
    /// @dev Used for input handles where the index distinguishes the source.
    ///      Clears bytes 29-31 of the handle, then sets:
    ///      - Byte 29: HANDLE_INDEX constant
    ///      - Byte 30: inputType enum value
    ///      - Byte 31: HANDLE_VERSION constant
    /// @param handle The 32-byte hash before metadata embedding
    /// @param inputType The encrypted type to embed (ebool, euint8, etc.)
    /// @return result The complete handle with embedded metadata
    function embedIndexTypeVersion(bytes32 handle, ETypes inputType) internal pure returns (bytes32 result) {
        // Create a mask to clear the last three bytes
        bytes32 mask = bytes32(uint256(0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00FFFF));
        // Clear the last three bytes of the original value
        bytes32 clearedOriginal = handle & mask;
        // Combine the cleared original value with the new last three bytes
        result = clearedOriginal | bytes32((uint256(HANDLE_INDEX) << 16));
        result = embedTypeVersion(result, inputType);
    }

    /// @notice Embeds the encrypted type and protocol version into a handle
    /// @dev Used for operation result handles and trivial encryptions.
    ///      Clears bytes 30-31 of the handle, then sets:
    ///      - Byte 30: handleType enum value
    ///      - Byte 31: HANDLE_VERSION constant
    /// @param handle The 32-byte hash before metadata embedding
    /// @param handleType The encrypted type to embed (ebool, euint8, etc.)
    /// @return result The handle with type and version embedded
    function embedTypeVersion(bytes32 handle, ETypes handleType) internal pure returns (bytes32 result) {
        result = handle & 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000;
        result = bytes32(uint256(result) | (uint256(handleType) << 8)); // append type
        result = bytes32(uint256(result) | HANDLE_VERSION);
    }

    /// @notice Extracts the encrypted type from a handle
    /// @dev Reads byte 30 of the handle and casts to ETypes enum.
    ///      Reverts with InvalidTypeValue if the raw byte exceeds the valid ETypes range.
    /// @param handle The encrypted value handle to inspect
    /// @return The encrypted type (ebool, euint160, euint256, etc.)
    function typeOf(bytes32 handle) internal pure returns (ETypes) {
        uint8 raw = uint8(uint256(handle) >> 8);
        require(raw <= uint8(type(ETypes).max), InvalidTypeValue(raw));
        return ETypes(raw);
    }

}
