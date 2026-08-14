// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {
    euint256,
    ebool,
    EOps,
    SenderNotAllowedForHandle,
    ETypes,
    UnexpectedType,
    UnsupportedType,
    isTypeSupported,
    canCastTo,
    typeToBitMask
} from "../Types.sol";
import {BaseAccessControlList} from "./AccessControl/BaseAccessControlList.sol";
import {HandleGeneration} from "./primitives/HandleGeneration.sol";
import {IEncryptedOperations} from "./interfaces/IEncryptedOperations.sol";
import {Fee} from "./Fee.sol";

/// @title EncryptedOperations
/// @notice Provides operations on encrypted values.
/// @dev All operations require the caller to have access to the input handles. Results are granted
/// transient access to the caller. Each operation emits an event that is processed by the covalidator
/// to perform the actual computation off-chain. The result handle is deterministically derived
/// from the operation and inputs, enabling consistent state across chains.
abstract contract EncryptedOperations is IEncryptedOperations, BaseAccessControlList, HandleGeneration, Fee {

    /// @notice Thrown when a cast is attempted to the same type.
    /// @param t The type that was both source and target.
    error SameTypeCast(ETypes t);

    uint256 internal randCounter;
    uint256 internal constant ONE = 1;

    bytes32 constant EBOOL = bytes32(ONE << uint256(ETypes.Bool));
    bytes32 constant EUINT160 = bytes32(ONE << uint256(ETypes.AddressOrUint160OrBytes20));
    bytes32 constant EUINT256 = bytes32(ONE << uint256(ETypes.Uint256));

    bytes32 constant SUPPORTED_TYPES_MASK = EBOOL | EUINT160 | EUINT256;

    event EAdd(euint256 indexed lhs, euint256 indexed rhs, euint256 indexed result, uint256 eventId);
    event ESub(euint256 indexed lhs, euint256 indexed rhs, euint256 indexed result, uint256 eventId);
    event EMul(euint256 indexed lhs, euint256 indexed rhs, euint256 indexed result, uint256 eventId);
    event EDiv(euint256 indexed lhs, euint256 indexed rhs, euint256 indexed result, uint256 eventId);
    event ERem(euint256 indexed lhs, euint256 indexed rhs, euint256 indexed result, uint256 eventId);
    event EBitAnd(bytes32 indexed lhs, bytes32 indexed rhs, bytes32 indexed result, uint256 eventId);
    event EBitOr(bytes32 indexed lhs, bytes32 indexed rhs, bytes32 indexed result, uint256 eventId);
    event EBitXor(bytes32 indexed lhs, bytes32 indexed rhs, bytes32 indexed result, uint256 eventId);
    event EShl(euint256 indexed lhs, euint256 indexed rhs, euint256 indexed result, uint256 eventId);
    event EShr(euint256 indexed lhs, euint256 indexed rhs, euint256 indexed result, uint256 eventId);
    event ERotl(euint256 indexed lhs, euint256 indexed rhs, euint256 indexed result, uint256 eventId);
    event ERotr(euint256 indexed lhs, euint256 indexed rhs, euint256 indexed result, uint256 eventId);
    event EEq(bytes32 indexed lhs, bytes32 indexed rhs, ebool indexed result, uint256 eventId);
    event ENe(bytes32 indexed lhs, bytes32 indexed rhs, ebool indexed result, uint256 eventId);
    event EGe(euint256 indexed lhs, euint256 indexed rhs, ebool indexed result, uint256 eventId);
    event EGt(euint256 indexed lhs, euint256 indexed rhs, ebool indexed result, uint256 eventId);
    event ELe(euint256 indexed lhs, euint256 indexed rhs, ebool indexed result, uint256 eventId);
    event ELt(euint256 indexed lhs, euint256 indexed rhs, ebool indexed result, uint256 eventId);
    event EMin(euint256 indexed lhs, euint256 indexed rhs, euint256 indexed result, uint256 eventId);
    event EMax(euint256 indexed lhs, euint256 indexed rhs, euint256 indexed result, uint256 eventId);
    event ERandBounded(
        uint256 indexed counter, ETypes randType, bytes32 indexed upperBound, bytes32 indexed result, uint256 eventId
    );
    event EIfThenElse( // can't index >3 fields
        ebool control,
        bytes32 indexed ifTrue,
        bytes32 indexed ifFalse,
        bytes32 indexed result,
        uint256 eventId
    );
    event ENot(ebool indexed operand, ebool indexed result, uint256 eventId);
    event ECast(bytes32 indexed ct, uint8 indexed toType, bytes32 indexed result, uint256 eventId);

    /// @dev Validates that both inputs are euint256 and the caller has access to them.
    modifier checked(euint256 lhs, euint256 rhs) {
        checkInput(euint256.unwrap(lhs), typeToBitMask(ETypes.Uint256));
        checkInput(euint256.unwrap(rhs), typeToBitMask(ETypes.Uint256));
        _;
    }

    /// @dev Validates that the caller has access to the input handle and that its type matches the required types.
    /// @param input The handle to validate.
    /// @param requiredTypes A bitmask of acceptable types for this input.
    function checkInput(bytes32 input, bytes32 requiredTypes) internal view {
        require(isAllowed(input, msg.sender), SenderNotAllowedForHandle(input, msg.sender));
        require(requiredTypes & typeToBitMask(typeOf(input)) != 0, UnexpectedType(typeOf(input), requiredTypes));
    }

    /// @dev Creates a result handle for an operation and grants transient access to the caller.
    /// @param op The operation type.
    /// @param returnType The type of the result handle.
    /// @param packedInputs The packed input handles.
    /// @return result The generated result handle.
    function createResultHandle(EOps op, ETypes returnType, bytes memory packedInputs)
        internal
        returns (bytes32 result)
    {
        result = getOpResultHandle(op, returnType, packedInputs);
        allowTransientInternal(result, msg.sender);
    }

    /// @notice Adds two encrypted uint256 values.
    /// @param lhs The left-hand side encrypted operand.
    /// @param rhs The right-hand side encrypted operand.
    /// @return result The encrypted sum (lhs + rhs).
    function eAdd(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (euint256 result) {
        result = euint256.wrap(
            createResultHandle(EOps.Add, ETypes.Uint256, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit EAdd(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Subtracts one encrypted uint256 from another.
    /// @param lhs The left-hand side encrypted operand.
    /// @param rhs The right-hand side encrypted operand.
    /// @return result The encrypted difference (lhs - rhs).
    function eSub(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (euint256 result) {
        result = euint256.wrap(
            createResultHandle(EOps.Sub, ETypes.Uint256, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit ESub(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Multiplies two encrypted uint256 values.
    /// @param lhs The left-hand side encrypted operand.
    /// @param rhs The right-hand side encrypted operand.
    /// @return result The encrypted product (lhs * rhs).
    function eMul(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (euint256 result) {
        result = euint256.wrap(
            createResultHandle(EOps.Mul, ETypes.Uint256, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit EMul(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Divides one encrypted uint256 by another.
    /// @dev Division by zero returns encrypted type(uint256).max.
    /// @param lhs The dividend (encrypted).
    /// @param rhs The divisor (encrypted).
    /// @return result The encrypted quotient (lhs / rhs).
    function eDiv(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (euint256 result) {
        result = euint256.wrap(
            createResultHandle(EOps.Div, ETypes.Uint256, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit EDiv(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Computes the remainder of dividing one encrypted uint256 by another.
    /// @dev Remainder by zero returns the encrypted dividend (lhs).
    /// @param lhs The dividend (encrypted).
    /// @param rhs The divisor (encrypted).
    /// @return result The encrypted remainder (lhs % rhs).
    function eRem(euint256 lhs, euint256 rhs) external virtual checked(lhs, rhs) returns (euint256 result) {
        result = euint256.wrap(
            createResultHandle(EOps.Rem, ETypes.Uint256, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit ERem(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Performs bitwise AND on two encrypted values of the same type.
    /// @param lhs The left-hand side encrypted operand.
    /// @param rhs The right-hand side encrypted operand (must be same type as lhs).
    /// @return result The encrypted bitwise AND result.
    function eBitAnd(bytes32 lhs, bytes32 rhs) external returns (bytes32 result) {
        checkInput(lhs, SUPPORTED_TYPES_MASK);
        checkInput(rhs, SUPPORTED_TYPES_MASK);
        ETypes lhsType = typeOf(lhs);
        ETypes rhsType = typeOf(rhs);
        require(lhsType == rhsType, UnexpectedType(rhsType, typeToBitMask(lhsType)));
        uint256 id = getNextEventId();
        result = createResultHandle(EOps.BitAnd, lhsType, abi.encodePacked(lhs, rhs));
        emit EBitAnd(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Performs bitwise OR on two encrypted values of the same type.
    /// @param lhs The left-hand side encrypted operand.
    /// @param rhs The right-hand side encrypted operand (must be same type as lhs).
    /// @return result The encrypted bitwise OR result.
    function eBitOr(bytes32 lhs, bytes32 rhs) external returns (bytes32 result) {
        checkInput(lhs, SUPPORTED_TYPES_MASK);
        checkInput(rhs, SUPPORTED_TYPES_MASK);
        ETypes lhsType = typeOf(lhs);
        ETypes rhsType = typeOf(rhs);
        require(lhsType == rhsType, UnexpectedType(rhsType, typeToBitMask(lhsType)));
        uint256 id = getNextEventId();
        result = createResultHandle(EOps.BitOr, lhsType, abi.encodePacked(lhs, rhs));
        emit EBitOr(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Performs bitwise XOR on two encrypted values of the same type.
    /// @param lhs The left-hand side encrypted operand.
    /// @param rhs The right-hand side encrypted operand (must be same type as lhs).
    /// @return result The encrypted bitwise XOR result.
    function eBitXor(bytes32 lhs, bytes32 rhs) external returns (bytes32 result) {
        checkInput(lhs, SUPPORTED_TYPES_MASK);
        checkInput(rhs, SUPPORTED_TYPES_MASK);
        ETypes lhsType = typeOf(lhs);
        ETypes rhsType = typeOf(rhs);
        require(lhsType == rhsType, UnexpectedType(rhsType, typeToBitMask(lhsType)));
        uint256 id = getNextEventId();
        result = createResultHandle(EOps.BitXor, lhsType, abi.encodePacked(lhs, rhs));
        emit EBitXor(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Shifts an encrypted uint256 left by an encrypted number of bits.
    /// @param lhs The value to shift (encrypted).
    /// @param rhs The number of bits to shift by (encrypted).
    /// @return result The encrypted left-shifted result.
    function eShl(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (euint256 result) {
        result = euint256.wrap(
            createResultHandle(EOps.Shl, ETypes.Uint256, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit EShl(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Shifts an encrypted uint256 right by an encrypted number of bits.
    /// @param lhs The value to shift (encrypted).
    /// @param rhs The number of bits to shift by (encrypted).
    /// @return result The encrypted right-shifted result.
    function eShr(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (euint256 result) {
        result = euint256.wrap(
            createResultHandle(EOps.Shr, ETypes.Uint256, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit EShr(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Rotates an encrypted uint256 left by an encrypted number of bits.
    /// @param lhs The value to rotate (encrypted).
    /// @param rhs The number of bits to rotate by (encrypted).
    /// @return result The encrypted left-rotated result.
    function eRotl(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (euint256 result) {
        result = euint256.wrap(
            createResultHandle(EOps.Rotl, ETypes.Uint256, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit ERotl(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Rotates an encrypted uint256 right by an encrypted number of bits.
    /// @param lhs The value to rotate (encrypted).
    /// @param rhs The number of bits to rotate by (encrypted).
    /// @return result The encrypted right-rotated result.
    function eRotr(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (euint256 result) {
        result = euint256.wrap(
            createResultHandle(EOps.Rotr, ETypes.Uint256, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit ERotr(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Checks if two encrypted values are equal.
    /// @dev Supports euint256, ebool, and eaddress types.
    /// @param lhs The left-hand side encrypted operand.
    /// @param rhs The right-hand side encrypted operand.
    /// @return result An encrypted boolean (true if lhs == rhs).
    function eEq(bytes32 lhs, bytes32 rhs) external returns (ebool result) {
        checkInput(lhs, SUPPORTED_TYPES_MASK);
        checkInput(rhs, SUPPORTED_TYPES_MASK);
        ETypes lhsType = typeOf(lhs);
        ETypes rhsType = typeOf(rhs);
        require(lhsType == rhsType, UnexpectedType(rhsType, typeToBitMask(lhsType)));

        result = ebool.wrap(createResultHandle(EOps.Eq, ETypes.Bool, abi.encodePacked(lhs, rhs)));
        uint256 id = getNextEventId();
        emit EEq(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Checks if two encrypted values are not equal.
    /// @dev Supports euint256, ebool, and eaddress types.
    /// @param lhs The left-hand side encrypted operand.
    /// @param rhs The right-hand side encrypted operand.
    /// @return result An encrypted boolean (true if lhs != rhs).
    function eNe(bytes32 lhs, bytes32 rhs) external returns (ebool result) {
        checkInput(lhs, SUPPORTED_TYPES_MASK);
        checkInput(rhs, SUPPORTED_TYPES_MASK);
        ETypes lhsType = typeOf(lhs);
        ETypes rhsType = typeOf(rhs);
        require(lhsType == rhsType, UnexpectedType(rhsType, typeToBitMask(lhsType)));

        result = ebool.wrap(createResultHandle(EOps.Ne, ETypes.Bool, abi.encodePacked(lhs, rhs)));
        uint256 id = getNextEventId();
        emit ENe(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Checks if lhs is greater than or equal to rhs.
    /// @param lhs The left-hand side encrypted operand.
    /// @param rhs The right-hand side encrypted operand.
    /// @return result An encrypted boolean (true if lhs >= rhs).
    function eGe(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (ebool result) {
        result = ebool.wrap(
            createResultHandle(EOps.Ge, ETypes.Bool, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit EGe(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Checks if lhs is greater than rhs.
    /// @param lhs The left-hand side encrypted operand.
    /// @param rhs The right-hand side encrypted operand.
    /// @return result An encrypted boolean (true if lhs > rhs).
    function eGt(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (ebool result) {
        result = ebool.wrap(
            createResultHandle(EOps.Gt, ETypes.Bool, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit EGt(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Checks if lhs is less than or equal to rhs.
    /// @param lhs The left-hand side encrypted operand.
    /// @param rhs The right-hand side encrypted operand.
    /// @return result An encrypted boolean (true if lhs <= rhs).
    function eLe(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (ebool result) {
        result = ebool.wrap(
            createResultHandle(EOps.Le, ETypes.Bool, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit ELe(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Checks if lhs is less than rhs.
    /// @param lhs The left-hand side encrypted operand.
    /// @param rhs The right-hand side encrypted operand.
    /// @return result An encrypted boolean (true if lhs < rhs).
    function eLt(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (ebool result) {
        result = ebool.wrap(
            createResultHandle(EOps.Lt, ETypes.Bool, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit ELt(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Returns the minimum of two encrypted uint256 values.
    /// @param lhs The first encrypted value.
    /// @param rhs The second encrypted value.
    /// @return result The encrypted minimum value.
    function eMin(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (euint256 result) {
        result = euint256.wrap(
            createResultHandle(EOps.Min, ETypes.Uint256, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit EMin(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Returns the maximum of two encrypted uint256 values.
    /// @param lhs The first encrypted value.
    /// @param rhs The second encrypted value.
    /// @return result The encrypted maximum value.
    function eMax(euint256 lhs, euint256 rhs) external checked(lhs, rhs) returns (euint256 result) {
        result = euint256.wrap(
            createResultHandle(EOps.Max, ETypes.Uint256, abi.encodePacked(euint256.unwrap(lhs), euint256.unwrap(rhs)))
        );
        uint256 id = getNextEventId();
        emit EMax(lhs, rhs, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Performs logical NOT on an encrypted boolean.
    /// @param operand The encrypted boolean to negate.
    /// @return result The negated encrypted boolean.
    function eNot(ebool operand) external returns (ebool result) {
        checkInput(ebool.unwrap(operand), typeToBitMask(ETypes.Bool));
        result = ebool.wrap(createResultHandle(EOps.Not, ETypes.Bool, abi.encodePacked(ebool.unwrap(operand))));
        uint256 id = getNextEventId();
        emit ENot(operand, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Casts an encrypted value to a different encrypted type. Same-type casting is not allowed.
    /// @dev Supports casting to euint256 and eaddress. Casting to ebool is not supported, only from ebool to a larger type.
    ///      Reverts with SameTypeCast if the source type matches the target type.
    /// @param ct The encrypted value to cast.
    /// @param toType The target type to cast to.
    /// @return result The casted encrypted value.
    function eCast(bytes32 ct, ETypes toType) external returns (bytes32 result) {
        checkInput(ct, SUPPORTED_TYPES_MASK);
        require(canCastTo(toType), UnsupportedType(toType));
        require(typeOf(ct) != toType, SameTypeCast(toType));
        result = createResultHandle(EOps.Cast, toType, abi.encodePacked(ct));
        uint256 id = getNextEventId();
        emit ECast(ct, uint8(toType), result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Generates an encrypted random value bounded by an upper limit.
    /// @dev This is a paid operation. The result is in the range [0, upperBound).
    /// @param upperBound The encrypted upper bound (exclusive). If the upper bound is e(0), the whole bit width of randType is sampled.
    /// @param randType The type of random value to generate. If upperBound is larger than the maximum value of randType, the function will revert.
    /// @return result An encrypted random value less than upperBound.
    function eRandBounded(bytes32 upperBound, ETypes randType) external payable paying returns (bytes32 result) {
        require(isTypeSupported(randType), UnsupportedType(randType));
        require(typeOf(upperBound) <= randType, UnexpectedType(typeOf(upperBound), typeToBitMask(randType)));
        checkInput(upperBound, SUPPORTED_TYPES_MASK);
        randCounter++;
        result = createResultHandle(EOps.RandBounded, randType, abi.encodePacked(bytes32(randCounter), upperBound));
        uint256 id = getNextEventId();
        emit ERandBounded(randCounter, randType, upperBound, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @notice Selects between two encrypted values based on an encrypted condition.
    /// @dev Returns ifTrue if control is true, otherwise returns ifFalse.
    /// Both ifTrue and ifFalse must be the same type.
    /// @param control The encrypted boolean condition.
    /// @param ifTrue The value to return if control is true.
    /// @param ifFalse The value to return if control is false.
    /// @return result The selected encrypted value.
    function eIfThenElse(ebool control, bytes32 ifTrue, bytes32 ifFalse) external returns (bytes32 result) {
        ETypes returnType = checkEIfThenElseInputs(control, ifTrue, ifFalse);
        result =
            createResultHandle(EOps.IfThenElse, returnType, abi.encodePacked(ebool.unwrap(control), ifTrue, ifFalse));
        uint256 id = getNextEventId();
        emit EIfThenElse(control, ifTrue, ifFalse, result, id);
        setDigest(abi.encodePacked(result, id));
    }

    /// @dev Validates inputs for eIfThenElse operation.
    /// @param control The encrypted boolean condition (must be ebool).
    /// @param ifTrue The value to return if control is true.
    /// @param ifFalse The value to return if control is false (must match ifTrue type).
    /// @return ifTrueType The type of the ifTrue/ifFalse values.
    function checkEIfThenElseInputs(ebool control, bytes32 ifTrue, bytes32 ifFalse)
        internal
        view
        returns (ETypes ifTrueType)
    {
        checkInput(ebool.unwrap(control), typeToBitMask(ETypes.Bool));
        ifTrueType = typeOf(ifTrue);
        require(
            ifTrueType == ETypes.Uint256 || ifTrueType == ETypes.Bool || ifTrueType == ETypes.AddressOrUint160OrBytes20,
            UnsupportedType(ifTrueType)
        );
        require(isAllowed(ifTrue, msg.sender), SenderNotAllowedForHandle(ifTrue, msg.sender));
        checkInput(ifFalse, typeToBitMask(ifTrueType));
    }

}
