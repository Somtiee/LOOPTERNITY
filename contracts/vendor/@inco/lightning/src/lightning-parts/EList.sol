// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {
    ETypes,
    EOps,
    typeToBitMask,
    typeBitSize,
    isTypeSupported,
    IndexOutOfRange,
    InvalidRange,
    ListRangeExceedsType,
    ListTypeMismatch,
    ListTooLong,
    UnsupportedType,
    elist
} from "../Types.sol";
import {EncryptedOperations} from "./EncryptedOperations.sol";
import {EncryptedInput} from "./EncryptedInput.sol";
import {EListHandleGeneration} from "./primitives/EListHandleGeneration.sol";
import {IEList} from "./interfaces/IEList.sol";

/// @dev Maximum number of elements allowed in an encrypted list.
uint16 constant MAX_LIST_LENGTH = type(uint16).max;

/// @title EList
/// @notice Provides operations for encrypted lists (elist) - ordered collections of encrypted values.
/// @dev Encrypted lists are immutable; all operations return new list handles rather than modifying in place.
/// Lists are homogeneous - all elements must be of the same encrypted type. Operations are processed
/// by the covalidator off-chain.
abstract contract EList is IEList, EncryptedOperations, EncryptedInput, EListHandleGeneration {

    event NewEList(bytes32 indexed result, ETypes listType, bytes32[] handles, uint256 eventId);
    event EListAppend(elist indexed list, bytes32 indexed value, elist indexed result, uint256 eventId);
    event EListGet(elist indexed list, uint16 indexed index, bytes32 indexed result, uint256 eventId);
    event EListGetOr(
        elist indexed list, bytes32 index, bytes32 indexed defaultValue, bytes32 indexed result, uint256 eventId
    );
    event EListSet(elist list, bytes32 indexed index, bytes32 indexed value, elist indexed result, uint256 eventId);
    event EListInsert(elist list, bytes32 indexed index, bytes32 indexed value, elist indexed result, uint256 eventId);
    event EListConcat(elist indexed list1, elist indexed list2, elist indexed result, uint256 eventId);
    event EListSlice(
        elist list,
        bytes32 indexed start,
        uint16 length,
        bytes32 indexed defaultValue,
        elist indexed result,
        uint256 eventId
    );
    event EListRange(
        uint256 indexed start, uint256 indexed end, ETypes listType, elist indexed result, uint256 eventId
    );
    event EListShuffle(elist indexed list, uint256 indexed counter, elist indexed result, uint256 eventId);
    event EListReverse(elist indexed list, elist indexed result, uint256 eventId);

    /// @dev Returns the total bit size of an elist: length * typeBitSize(elementType).
    function _elistBits(bytes32 handle) internal pure returns (uint256) {
        return uint256(lengthOf(handle)) * typeBitSize(listTypeOf(handle));
    }

    /// @notice Creates a new encrypted list from client-encrypted inputs.
    /// @dev Internal function that processes multiple encrypted inputs without individual payment.
    /// Payment should be handled by the caller for the batch.
    /// @param inputs Array of encrypted inputs with prepended handles.
    /// @param listType The type of elements in the list.
    /// @param user The user address that encrypted the values.
    /// @return newList The new encrypted list handle.
    function newEListFromInputs(bytes[] calldata inputs, ETypes listType, address user)
        internal
        returns (elist newList)
    {
        require(inputs.length <= MAX_LIST_LENGTH, ListTooLong(uint32(inputs.length), MAX_LIST_LENGTH));
        require(isTypeSupported(listType), UnsupportedType(listType));

        // TODO: Add a new event to create new elist from inputs, can be done as an upgrade to optimize for gas and castore.
        bytes32[] memory handles = new bytes32[](inputs.length);
        for (uint256 i = 0; i < inputs.length; i++) {
            // we check payment for multiple inputs ahead of this func
            handles[i] = newInputNotPayingNotEmitting(inputs[i], user, listType);
        }
        return newEListFromHandles(handles, listType);
    }

    /// @notice Creates a new encrypted list from existing encrypted handles.
    /// @dev Validates that all handles are of the expected type and caller has access.
    /// @param handles Array of encrypted value handles to include in the list.
    /// @param listType The type of elements in the list (must match handle types).
    /// @return newList The new encrypted list handle.
    function newEListFromHandles(bytes32[] memory handles, ETypes listType) internal returns (elist newList) {
        require(handles.length <= MAX_LIST_LENGTH, ListTooLong(uint32(handles.length), MAX_LIST_LENGTH));
        require(isTypeSupported(listType), UnsupportedType(listType));
        for (uint256 i = 0; i < handles.length; i++) {
            checkInput(handles[i], typeToBitMask(listType));
        }

        bytes32 newHandle = createListInputHandle(handles, listType);

        allowTransientInternal(newHandle, msg.sender);
        uint256 id = getNextEventId();
        setDigest(abi.encodePacked(newHandle, id));
        emit NewEList(newHandle, listType, handles, id);
        return elist.wrap(newHandle);
    }

    /// @notice Creates a new encrypted list from existing encrypted handles.
    /// @dev External wrapper for newEListFromHandles.
    /// @param handles Array of encrypted value handles to include in the list.
    /// @param listType The type of elements in the list.
    /// @return newList The new encrypted list handle.
    function newEList(bytes32[] memory handles, ETypes listType)
        external
        payable
        payingElistFee(uint256(handles.length) * typeBitSize(listType))
        returns (elist newList)
    {
        return newEListFromHandles(handles, listType);
    }

    /// @notice Creates a new encrypted list from client-encrypted inputs.
    /// @dev This is a paid operation. Payment scales with the number of inputs.
    /// @param inputs Array of encrypted inputs with prepended handles.
    /// @param listType The type of elements in the list.
    /// @param user The user address that encrypted the values.
    /// @return newList The new encrypted list handle.
    function newEList(bytes[] calldata inputs, ETypes listType, address user)
        external
        payable
        payingElistFee(uint256(inputs.length) * typeBitSize(listType))
        returns (elist newList)
    {
        return newEListFromInputs(inputs, listType, user);
    }

    /// @notice Appends an encrypted value to the end of an encrypted list.
    /// @dev Returns a new list with the value appended; original list is unchanged.
    /// @param list The encrypted list to append to.
    /// @param value The encrypted value to append (must match list element type).
    /// @return result A new encrypted list with the value appended.
    function listAppend(elist list, bytes32 value)
        external
        payable
        payingElistFee(_elistBits(elist.unwrap(list)) + typeBitSize(listTypeOf(elist.unwrap(list))))
        returns (elist result)
    {
        checkInput(elist.unwrap(list), typeToBitMask(ETypes.List));
        checkInput(value, typeToBitMask(listTypeOf(elist.unwrap(list))));

        result = elist.wrap(
            createListResultHandle(
                EOps.EListAppend,
                listTypeOf(elist.unwrap(list)),
                lengthOf(elist.unwrap(list)) + 1,
                abi.encodePacked(elist.unwrap(list), value)
            )
        );
        uint256 id = getNextEventId();
        allowTransientInternal(elist.unwrap(result), msg.sender);
        setDigest(abi.encodePacked(elist.unwrap(result), id));
        emit EListAppend(list, value, result, id);
    }

    /// @notice Retrieves an encrypted element at a specific index.
    /// @dev Reverts if the index is out of range. For safe access with a default, use listGetOr.
    /// @param list The encrypted list to access.
    /// @param i The index to retrieve (0-based).
    /// @return result The encrypted element at the specified index.
    function listGet(elist list, uint16 i) external returns (bytes32 result) {
        require(i < lengthOf(elist.unwrap(list)), IndexOutOfRange(i, lengthOf(elist.unwrap(list))));
        checkInput(elist.unwrap(list), typeToBitMask(ETypes.List));

        result =
            createResultHandle(EOps.EListGet, listTypeOf(elist.unwrap(list)), abi.encodePacked(elist.unwrap(list), i));
        uint256 id = getNextEventId();
        setDigest(abi.encodePacked(result, id));
        emit EListGet(list, i, result, id);
    }

    /// @notice Retrieves an encrypted element at an encrypted index, with a default value for out-of-range access.
    /// @dev Returns the default value if the index is out of range. Index must be euint256.
    /// @param list The encrypted list to access.
    /// @param index The encrypted index to retrieve.
    /// @param defaultValue The encrypted value to return if index is out of range.
    /// @return result The encrypted element at the index, or defaultValue if out of range.
    function listGetOr(elist list, bytes32 index, bytes32 defaultValue) external returns (bytes32 result) {
        checkInput(elist.unwrap(list), typeToBitMask(ETypes.List));
        checkInput(defaultValue, typeToBitMask(listTypeOf(elist.unwrap(list))));
        checkInput(index, typeToBitMask(ETypes.Uint256)); //Currently we only support euint256 for index

        result = createResultHandle(
            EOps.EListGetOr, listTypeOf(elist.unwrap(list)), abi.encodePacked(elist.unwrap(list), index, defaultValue)
        );
        uint256 id = getNextEventId();
        setDigest(abi.encodePacked(result, id));
        emit EListGetOr(list, index, defaultValue, result, id);
    }

    /// @notice Sets an encrypted element at an encrypted index.
    /// @dev Returns a new list with the element replaced; original list is unchanged.
    /// Index must be euint256. If the encrypted index is out of bounds, the operation
    /// is silently ignored by the covalidator and the returned list is identical to the input.
    /// This is by design: because the index is encrypted, reverting would leak information
    /// about whether the index was valid.
    /// @param list The encrypted list to modify.
    /// @param index The encrypted index to set.
    /// @param value The new encrypted value (must match list element type).
    /// @return result A new encrypted list with the element replaced, or unchanged if index is out of bounds.
    function listSet(elist list, bytes32 index, bytes32 value)
        external
        payable
        payingElistFee(_elistBits(elist.unwrap(list)))
        returns (elist result)
    {
        checkInput(elist.unwrap(list), typeToBitMask(ETypes.List));
        checkInput(index, typeToBitMask(ETypes.Uint256)); //Currently we only support euint256 for index
        checkInput(value, typeToBitMask(listTypeOf(elist.unwrap(list))));

        result = elist.wrap(
            createListResultHandle(
                EOps.EListSet,
                listTypeOf(elist.unwrap(list)),
                lengthOf(elist.unwrap(list)),
                abi.encodePacked(elist.unwrap(list), index, value)
            )
        );
        allowTransientInternal(elist.unwrap(result), msg.sender);
        uint256 id = getNextEventId();
        setDigest(abi.encodePacked(elist.unwrap(result), id));
        emit EListSet(list, index, value, result, id);
    }

    /// @notice Inserts an encrypted element at an encrypted index, shifting subsequent elements.
    /// @dev Returns a new list with one additional element. Index must be euint256.
    /// @param list The encrypted list to modify.
    /// @param index The encrypted index at which to insert.
    /// @param value The encrypted value to insert (must match list element type).
    /// @return result A new encrypted list with the element inserted.
    function listInsert(elist list, bytes32 index, bytes32 value)
        external
        payable
        payingElistFee(_elistBits(elist.unwrap(list)) + typeBitSize(listTypeOf(elist.unwrap(list))))
        returns (elist result)
    {
        checkInput(elist.unwrap(list), typeToBitMask(ETypes.List));
        checkInput(index, typeToBitMask(ETypes.Uint256)); //Currently we only support euint256 for index
        checkInput(value, typeToBitMask(listTypeOf(elist.unwrap(list))));

        result = elist.wrap(
            createListResultHandle(
                EOps.EListInsert,
                listTypeOf(elist.unwrap(list)),
                lengthOf(elist.unwrap(list)) + 1,
                abi.encodePacked(elist.unwrap(list), index, value)
            )
        );
        allowTransientInternal(elist.unwrap(result), msg.sender);
        uint256 id = getNextEventId();
        setDigest(abi.encodePacked(elist.unwrap(result), id));
        emit EListInsert(list, index, value, result, id);
    }

    /// @notice Concatenates two encrypted lists into a new list.
    /// @dev Both lists must have the same element type. Returns a new list with all elements.
    /// @param lhs The first encrypted list.
    /// @param rhs The second encrypted list (must have same element type as lhs).
    /// @return result A new encrypted list containing all elements from both lists.
    function listConcat(elist lhs, elist rhs)
        external
        payable
        payingElistFee(_elistBits(elist.unwrap(lhs)) + _elistBits(elist.unwrap(rhs)))
        returns (elist result)
    {
        checkInput(elist.unwrap(lhs), typeToBitMask(ETypes.List));
        checkInput(elist.unwrap(rhs), typeToBitMask(ETypes.List));
        ETypes lhsType = listTypeOf(elist.unwrap(lhs));
        ETypes rhsType = listTypeOf(elist.unwrap(rhs));
        require(lhsType == rhsType, ListTypeMismatch(lhsType, rhsType));

        result = elist.wrap(
            createListResultHandle(
                EOps.EListConcat,
                listTypeOf(elist.unwrap(lhs)),
                lengthOf(elist.unwrap(lhs)) + lengthOf(elist.unwrap(rhs)),
                abi.encodePacked(elist.unwrap(lhs), elist.unwrap(rhs))
            )
        );
        allowTransientInternal(elist.unwrap(result), msg.sender);
        uint256 id = getNextEventId();
        setDigest(abi.encodePacked(elist.unwrap(result), id));
        emit EListConcat(lhs, rhs, result, id);
    }

    /// @notice Extracts a slice from an encrypted list starting at an encrypted index.
    /// @dev Returns a new list of the specified length. Uses defaultValue for out-of-range positions.
    /// @param list The encrypted list to slice.
    /// @param start The encrypted starting index.
    /// @param len The number of elements to include in the slice.
    /// @param defaultValue The encrypted value to use for out-of-range positions.
    /// @return result A new encrypted list containing the slice.
    function listSlice(elist list, bytes32 start, uint16 len, bytes32 defaultValue)
        external
        payable
        payingElistFee(uint256(len) * typeBitSize(listTypeOf(elist.unwrap(list))))
        returns (elist result)
    {
        checkInput(elist.unwrap(list), typeToBitMask(ETypes.List));
        checkInput(defaultValue, typeToBitMask(listTypeOf(elist.unwrap(list))));
        checkInput(start, typeToBitMask(ETypes.Uint256));

        result = elist.wrap(
            createListResultHandle(
                EOps.EListSlice,
                listTypeOf(elist.unwrap(list)),
                len,
                abi.encodePacked(elist.unwrap(list), start, defaultValue)
            )
        );
        allowTransientInternal(elist.unwrap(result), msg.sender);
        uint256 id = getNextEventId();
        setDigest(abi.encodePacked(elist.unwrap(result), id));
        emit EListSlice(list, start, len, defaultValue, result, id);
    }

    /// @notice Creates an encrypted list containing a range of encrypted integers.
    /// @dev Creates a list of euint256 values from start (inclusive) to end (exclusive).
    /// @param start The starting value (inclusive).
    /// @param end The ending value (exclusive). Must be >= start.
    /// @param listType The type of elements in the list.
    /// @return result A new encrypted list containing the range [start, end).
    function listRange(uint16 start, uint16 end, ETypes listType)
        external
        payable
        payingElistFee(uint256(end - start) * typeBitSize(listType))
        returns (elist result)
    {
        require(start <= end, InvalidRange(start, end));
        // Range values [start, end) must fit within listType's bit width.
        uint256 bitWidth = typeBitSize(listType);
        if (bitWidth < 16) {
            require(uint256(end) <= (uint256(1) << bitWidth), ListRangeExceedsType(end, listType));
        }

        result =
            elist.wrap(createListResultHandle(EOps.EListRange, listType, end - start, abi.encodePacked(start, end)));
        allowTransientInternal(elist.unwrap(result), msg.sender);
        uint256 id = getNextEventId();
        setDigest(abi.encodePacked(elist.unwrap(result), id));
        emit EListRange(start, end, listType, result, id);
    }

    /// @notice Randomly shuffles the elements of an encrypted list.
    /// @dev This is a paid operation. Returns a new list with elements in random order.
    /// The shuffle is cryptographically secure, computed by the covalidator.
    /// @param list The encrypted list to shuffle.
    /// @return result A new encrypted list with elements in random order.
    function listShuffle(elist list)
        external
        payable
        payingElistFee(_elistBits(elist.unwrap(list)))
        returns (elist result)
    {
        checkInput(elist.unwrap(list), typeToBitMask(ETypes.List));
        randCounter++;
        result = elist.wrap(
            createListResultHandle(
                EOps.EListShuffle,
                listTypeOf(elist.unwrap(list)),
                lengthOf(elist.unwrap(list)),
                abi.encodePacked(elist.unwrap(list), bytes32(randCounter))
            )
        );
        allowTransientInternal(elist.unwrap(result), msg.sender);
        uint256 id = getNextEventId();
        setDigest(abi.encodePacked(elist.unwrap(result), id));
        emit EListShuffle(list, randCounter, result, id);
    }

    /// @notice Reverses the order of elements in an encrypted list.
    /// @dev Returns a new list with elements in reverse order; original list is unchanged.
    /// @param list The encrypted list to reverse.
    /// @return result A new encrypted list with elements in reverse order.
    function listReverse(elist list)
        external
        payable
        payingElistFee(_elistBits(elist.unwrap(list)))
        returns (elist result)
    {
        checkInput(elist.unwrap(list), typeToBitMask(ETypes.List));

        result = elist.wrap(
            createListResultHandle(
                EOps.EListReverse,
                listTypeOf(elist.unwrap(list)),
                lengthOf(elist.unwrap(list)),
                abi.encodePacked(elist.unwrap(list))
            )
        );
        allowTransientInternal(elist.unwrap(result), msg.sender);
        uint256 id = getNextEventId();
        setDigest(abi.encodePacked(elist.unwrap(result), id));
        emit EListReverse(list, result, id);
    }

}
