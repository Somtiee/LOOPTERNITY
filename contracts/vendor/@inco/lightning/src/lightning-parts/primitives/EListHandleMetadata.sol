// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {ETypes} from "../../Types.sol";
import {IEListHandleMetadata} from "./interfaces/IEListHandleMetadata.sol";

/// @title EListHandleMetadata
/// @notice Utilities for embedding and extracting metadata from encrypted list handles
/// @dev Encrypted lists have additional metadata compared to scalar handles:
///      Handle structure (32 bytes / 256 bits):
///      - Bytes 0-26: Handle-specific data (hash, counters, etc.)
///      - Bytes 27-28: List length (uint16, max 65535 elements)
///      - Byte 29: Element type (ETypes enum value for individual elements)
///      - Byte 30: List type marker (identifies this as a list handle)
///      - Byte 31: Handle version
///
///      This allows efficient extraction of list metadata without external calls.
contract EListHandleMetadata is IEListHandleMetadata {

    /// @notice Thrown when a handle contains an element type value outside the valid ETypes enum range.
    /// @param raw The raw uint8 value extracted from the handle.
    error InvalidListTypeValue(uint8 raw);

    /// @notice Embeds the list length into a list handle
    /// @dev Sets bytes 27-28 of the handle to the list length.
    ///      Clears existing length bits before setting new value.
    /// @param handle The 32-byte handle before length embedding
    /// @param len The number of elements in the list (max 65535)
    /// @return result The handle with embedded list length
    function embedListLength(bytes32 handle, uint16 len) internal pure returns (bytes32 result) {
        // 27 and 28 bits are used for the list length
        result = handle & 0xffffffffffffffffffffffffffffffffffffffffffffffffffffff0000ffffff;
        result = bytes32(uint256(result) | (uint256(len) << 24)); // append length
    }

    /// @notice Extracts the list length from a list handle
    /// @dev Reads bytes 27-28 of the handle as a uint16
    /// @param handle The encrypted list handle to inspect
    /// @return The number of elements in the list
    function lengthOf(bytes32 handle) public pure returns (uint16) {
        return uint16(uint256(handle) >> 24);
    }

    /// @notice Embeds the element type into a list handle
    /// @dev Sets byte 29 of the handle to the element type.
    ///      This indicates the encrypted type of individual elements (euint8, euint64, etc.).
    /// @param handle The 32-byte handle before type embedding
    /// @param listType The encrypted type of list elements
    /// @return result The handle with embedded element type
    function embedListType(bytes32 handle, ETypes listType) internal pure returns (bytes32 result) {
        result = handle & 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ffff;
        result = bytes32(uint256(result) | (uint256(listType) << 16)); // append element type
    }

    /// @notice Extracts the element type from a list handle
    /// @dev Reads byte 29 of the handle and casts to ETypes enum.
    ///      This is the type of individual elements, not the list container type.
    ///      Reverts with InvalidListTypeValue if the raw byte exceeds the valid ETypes range.
    /// @param handle The encrypted list handle to inspect
    /// @return The encrypted type of list elements (ebool, euint160, euint256, etc.)
    function listTypeOf(bytes32 handle) internal pure returns (ETypes) {
        uint8 raw = uint8(uint256(handle) >> 16);
        require(raw <= uint8(type(ETypes).max), InvalidListTypeValue(raw));
        return ETypes(raw);
    }

}
