// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {euint256, ebool, eaddress, ETypes} from "../Types.sol";
import {BaseAccessControlList} from "./AccessControl/BaseAccessControlList.sol";
import {HandleGeneration} from "./primitives/HandleGeneration.sol";
import {ITrivialEncryption} from "./interfaces/ITrivialEncryption.sol";

/// @title TrivialEncryption
/// @notice Provides functions to create encrypted handles from plaintext values.
/// @dev Trivial encryption wraps plaintext values as encrypted handles. The plaintext is visible
/// on-chain (emitted in events), so this should only be used for values that are already public.
/// Common use cases include initializing encrypted state with known values or creating encrypted
/// constants. The resulting handles are granted transient access to the caller.
abstract contract TrivialEncryption is ITrivialEncryption, BaseAccessControlList, HandleGeneration {

    /// @notice Emitted when a trivial encryption is performed.
    /// @param result The handle representing the encrypted value.
    /// @param plainTextBytes The plaintext value that was encrypted (visible on-chain).
    /// @param handleType The type of the encrypted value.
    /// @param eventId The unique event ID for ordering and verification.
    event TrivialEncrypt(bytes32 indexed result, bytes32 plainTextBytes, ETypes handleType, uint256 eventId);

    /// @notice Creates an encrypted uint256 handle from a plaintext value.
    /// @dev The plaintext value is visible on-chain. Use this for public values only.
    /// @param value The plaintext uint256 value to encrypt.
    /// @return newEuint256 The encrypted handle representing the value.
    function asEuint256(uint256 value) external returns (euint256 newEuint256) {
        return euint256.wrap(newTrivialEncrypt(bytes32(value), ETypes.Uint256));
    }

    /// @notice Creates an encrypted boolean handle from a plaintext value.
    /// @dev The plaintext value is visible on-chain. Use this for public values only.
    /// @param value The plaintext boolean value to encrypt.
    /// @return newEbool The encrypted handle representing the value.
    function asEbool(bool value) external returns (ebool newEbool) {
        bytes32 castedValue = bytes32(uint256(value ? 1 : 0));
        return ebool.wrap(newTrivialEncrypt(castedValue, ETypes.Bool));
    }

    /// @notice Creates an encrypted address handle from a plaintext value.
    /// @dev The plaintext value is visible on-chain. Use this for public values only.
    /// @param value The plaintext address value to encrypt.
    /// @return newEaddress The encrypted handle representing the value.
    function asEaddress(address value) external returns (eaddress newEaddress) {
        bytes32 castedValue = bytes32(uint256(uint160(value)));
        return eaddress.wrap(newTrivialEncrypt(castedValue, ETypes.AddressOrUint160OrBytes20));
    }

    /// @notice Internal function that performs the trivial encryption.
    /// @dev Generates a deterministic handle, grants transient access to the caller,
    /// emits the TrivialEncrypt event, and updates the digest for verification.
    /// @param plainTextBytes The plaintext value as bytes32.
    /// @param handleType The type of encrypted value being created.
    /// @return newHandle The generated handle for the encrypted value.
    function newTrivialEncrypt(bytes32 plainTextBytes, ETypes handleType) internal returns (bytes32 newHandle) {
        newHandle = getTrivialEncryptHandle(plainTextBytes, handleType);
        allowTransientInternal(newHandle, msg.sender);
        uint256 id = getNextEventId();
        emit TrivialEncrypt(newHandle, plainTextBytes, handleType, id);
        setDigest(abi.encodePacked(newHandle, id));
    }

}
