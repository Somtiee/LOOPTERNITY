// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {ETypes, EOps, HANDLE_VERSION, SEP_ELIST_OP_RESULT} from "../../Types.sol";
import {HandleGeneration} from "./HandleGeneration.sol";
import {EListHandleMetadata} from "./EListHandleMetadata.sol";

/// @title EListHandleGeneration
/// @notice Generates deterministic handles for encrypted list operations
/// @dev Extends the base HandleGeneration with list-specific handle creation.
///      List handles incorporate additional metadata:
///      - List length (number of elements)
///      - Element type (encrypted type of individual elements)
///      - List marker (ETypes.List to identify as a list)
///
///      The handle is derived from:
///      - The operation type (EOps.NewEList for list creation)
///      - The packed input handles (for lists created from existing handles)
contract EListHandleGeneration is HandleGeneration, EListHandleMetadata {

    /// @notice Creates a handle for a list operation result
    /// @dev Generates a deterministic handle by hashing the operation and inputs,
    ///      then embedding list metadata (length, element type, list marker, version).
    /// @param op The operation that produced this list (e.g., NewEList, Slice)
    /// @param listType The encrypted type of individual list elements (euint8, euint64, etc.)
    /// @param len The number of elements in the resulting list
    /// @param packedInputs ABI-packed representation of the input handles
    /// @return result The deterministic handle for this list
    function createListResultHandle(EOps op, ETypes listType, uint16 len, bytes memory packedInputs)
        internal
        pure
        returns (bytes32 result)
    {
        // Bind HANDLE_VERSION, listType (element type) and len into the preimage so the elist
        // metadata stamped into bytes 27-29 is cryptographically committed, not just appended.
        bytes32 baseHandle =
            keccak256(abi.encodePacked(SEP_ELIST_OP_RESULT, HANDLE_VERSION, listType, len, op, packedInputs));
        baseHandle = embedListLength(baseHandle, len);
        baseHandle = embedListType(baseHandle, listType);
        result = embedTypeVersion(baseHandle, ETypes.List);
    }

    /// @notice Creates a handle for a new list composed from individual encrypted handles
    /// @dev This is the primary entry point for creating lists from existing encrypted values.
    ///      The handle is deterministically derived from the input handles, ensuring the same
    ///      inputs always produce the same list handle.
    /// @param handles Array of encrypted value handles to combine into a list
    /// @param listType The encrypted type of all elements (must be uniform)
    /// @return newHandle The deterministic handle for the new list
    function createListInputHandle(bytes32[] memory handles, ETypes listType)
        internal
        pure
        returns (bytes32 newHandle)
    {
        newHandle = createListResultHandle(
            EOps.NewEList,
            listType,
            uint16(handles.length),
            abi.encodePacked(
                //Since we're only dealing with handles, it should be sufficient to treat this operation as an operand on handles.
                handles
            )
        );
    }

}
