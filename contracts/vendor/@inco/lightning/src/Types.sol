// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

enum EOps {
    Add, // 0
    Sub, // 1
    Mul, // 2
    Div, // 3
    Rem, // 4
    BitAnd, // 5
    BitOr, // 6
    BitXor, // 7
    Shl, // 8
    Shr, // 9
    Rotl, // 10
    Rotr, // 11
    Eq, // 12
    Ne, // 13
    Ge, // 14
    Gt, // 15
    Le, // 16
    Lt, // 17
    Min, // 18
    Max, // 19
    NegUNSUPPORTED, // 20
    Not, // 21
    NewInput, // 22
    Cast, // 23
    TrivialEncrypt, // 24
    IfThenElse, // 25
    Rand, // 26
    RandBounded, // 27
    // These are pseudo-ops part of the decryption/callback system but we need to generate code for them so I am including them
    DecryptionRequested, // 28
    RequestFulfilled, // 29
    EOP30,
    EOP31,
    EOP32,
    EOP33,
    EOP34,
    EOP35,
    EOP36,
    EOP37,
    EOP38,
    EOP39,
    // Pseudo-operation for an ACL (persistent) allow
    Allow, // 40
    Reveal, // 41
    EOP42,
    EOP43,
    EOP44,
    EOP45,
    EOP46,
    EOP47,
    EOP48,
    EOP49,
    EOP50,
    EOP51,
    EOP52,
    EOP53,
    EOP54,
    EOP55,
    EOP56,
    EOP57,
    EOP58,
    EOP59,
    EOP60,
    EOP61,
    EOP62,
    EOP63,
    EOP64,
    EOP65,
    EOP66,
    EOP67,
    EOP68,
    EOP69,
    EOP70,
    EOP71,
    EOP72,
    EOP73,
    EOP74,
    EOP75,
    EOP76,
    EOP77,
    EOP78,
    EOP79,
    EOP80,
    EOP81,
    EOP82,
    EOP83,
    EOP84,
    EOP85,
    EOP86,
    EOP87,
    EOP88,
    EOP89,
    EOP90,
    EOP91,
    EOP92,
    EOP93,
    EOP94,
    EOP95,
    EOP96,
    EOP97,
    EOP98,
    EOP99,
    NewEList, // 100
    EListGet, // 101
    EListGetOr, // 102
    EListSet, // 103
    EListInsert, // 104
    EListAppend, // 105
    EListConcat, // 106
    EListSlice, // 107
    EListRange, // 108
    EListShuffle, // 109
    EListReverse // 110
}

type ebool is bytes32;

type euint256 is bytes32;

type eaddress is bytes32;

type elist is bytes32;

enum ETypes {
    Bool,
    Uint4UNSUPPORTED,
    Uint8UNSUPPORTED,
    Uint16UNSUPPORTED,
    Uint32UNSUPPORTED,
    Uint64UNSUPPORTED,
    Uint128UNSUPPORTED,
    AddressOrUint160OrBytes20,
    Uint256,
    Bytes64UNSUPPORTED,
    Bytes128UNSUPPORTED,
    Bytes256UNSUPPORTED,
    EmptyType12, // 12
    EmptyType13, // 13
    EmptyType14, // 14
    EmptyType15, // 15
    EmptyType16, // 16
    EmptyType17, // 17
    EmptyType18, // 18
    EmptyType19, // 19
    EmptyType20,
    EmptyType21,
    EmptyType22,
    EmptyType23,
    EmptyType24,
    EmptyType25,
    EmptyType26,
    EmptyType27,
    EmptyType28,
    EmptyType29,
    EmptyType30,
    EmptyType31,
    EmptyType32,
    EmptyType33,
    EmptyType34,
    EmptyType35,
    EmptyType36,
    EmptyType37,
    EmptyType38,
    EmptyType39,
    EmptyType40,
    EmptyType41,
    EmptyType42,
    EmptyType43,
    EmptyType44,
    EmptyType45,
    EmptyType46,
    EmptyType47,
    EmptyType48,
    EmptyType49,
    EmptyType50,
    EmptyType51,
    EmptyType52,
    EmptyType53,
    EmptyType54,
    EmptyType55,
    EmptyType56,
    EmptyType57,
    EmptyType58,
    EmptyType59,
    EmptyType60,
    EmptyType61,
    EmptyType62,
    EmptyType63,
    EmptyType64,
    EmptyType65,
    EmptyType66,
    EmptyType67,
    EmptyType68,
    EmptyType69,
    EmptyType70,
    EmptyType71,
    EmptyType72,
    EmptyType73,
    EmptyType74,
    EmptyType75,
    EmptyType76,
    EmptyType77,
    EmptyType78,
    EmptyType79,
    EmptyType80,
    EmptyType81,
    EmptyType82,
    EmptyType83,
    EmptyType84,
    EmptyType85,
    EmptyType86,
    EmptyType87,
    EmptyType88,
    EmptyType89,
    EmptyType90,
    EmptyType91,
    EmptyType92,
    EmptyType93,
    EmptyType94,
    EmptyType95,
    EmptyType96,
    EmptyType97,
    EmptyType98,
    EmptyType99,
    List // 100
}

// check correctness of compute
// revert acl

function isEList(ETypes t) pure returns (bool) {
    return t == ETypes.List;
}

/// Checks whether the given type is a valid numeric type or a boolean.
/// @param t the type to check
function isTypeSupported(ETypes t) pure returns (bool) {
    return t == ETypes.Uint256 || t == ETypes.Bool || t == ETypes.AddressOrUint160OrBytes20;
}

/// Checks whether we can cast to the given type
/// @param t the type to check
/// @dev Casting to ebool is not supported in order to not confuse developers coming from other languages where anything above 0 becomes true.
function canCastTo(ETypes t) pure returns (bool) {
    return t == ETypes.Uint256 || t == ETypes.AddressOrUint160OrBytes20;
}

error SenderNotAllowedForHandle(bytes32 handle, address sender);
error SharerNotAllowedForHandle(bytes32 handle, address sharer);
error IndexOutOfRange(uint16 i, uint16 len);
error SliceOutOfRange(uint16 start, uint16 end, uint16 len);
error ZeroLength();
error ListTooLong(uint32 provided, uint16 max);
error InvalidRange(uint16 start, uint16 end);
error ListRangeExceedsType(uint16 end, ETypes listType);
error ListTypeMismatch(ETypes lhs, ETypes rhs);
error UnsupportedListType(ETypes listType);
error UnsupportedType(ETypes actual);
error UnexpectedType(ETypes actual, bytes32 expectedTypes);
error HandleMismatch();
error InvalidTEEAttestation();
error UnexpectedDecryptedValue();

string constant EVM_HOST_CHAIN_PREFIX = "evm/";
uint8 constant HANDLE_VERSION = 0;

// used to make sure a verifier contract is checking allowance access on purpose, using a bytes4 or bool return type
// can lead to forging allowance vouchers using contract calls meant for an unrelated purpose, which lead to access
// theft. Its a common pattern, notably used in EIP1271 (Signature Validation Procedure for Contracts)
bytes32 constant ALLOWANCE_GRANTED_MAGIC_VALUE = keccak256("Inco Read Access on Provided Handle is Granted");

// IncoLightning only supports single-valued ciphertexts so this is always 0
// NOTE: this must be a uint8 to get hash agreement!
uint8 constant HANDLE_INDEX = 0;

// Domain separators for handle derivation. Prefixing every keccak256 preimage with a unique
// constant string makes cross-path collision resistance structural rather than incidental:
// preimages from different derivation paths can never align byte-for-byte regardless of length.
// These must be kept in sync with the Go (pkg/hostchain) and TS (js/src/handle.ts) implementations.
string constant SEP_INPUT_HANDLE = "inco/handle/input-handle";
string constant SEP_INPUT_CONTEXT = "inco/handle/input-context";
string constant SEP_OP_RESULT = "inco/handle/op-result";
string constant SEP_ELIST_OP_RESULT = "inco/handle/elist-result";

/// Returns the bit size of a supported element type.
/// @param t the type to get the bit size for
function typeBitSize(ETypes t) pure returns (uint256) {
    if (t == ETypes.Bool) return 1;
    if (t == ETypes.AddressOrUint160OrBytes20) return 160;
    if (t == ETypes.Uint256) return 256;
    revert UnsupportedType(t);
}

/// Util function to convert an ETypes to a bit mask
/// @param t the type to convert to a bit mask
function typeToBitMask(ETypes t) pure returns (bytes32) {
    uint256 one = 1;
    return bytes32(one << uint256(t));
}
