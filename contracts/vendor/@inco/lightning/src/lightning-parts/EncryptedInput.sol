// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {BaseAccessControlList} from "./AccessControl/BaseAccessControlList.sol";
import {HandleGeneration} from "./primitives/HandleGeneration.sol";
import {euint256, ebool, eaddress, ETypes} from "../Types.sol";
import {IEncryptedInput} from "./interfaces/IEncryptedInput.sol";
import {HandleAlreadyExists} from "../Errors.sol";
import {Fee} from "./Fee.sol";

/// @notice Thrown when the handle computed on-chain doesn't match the handle prepended to the input.
/// @dev This typically indicates a mismatch between client-side encryption context and on-chain context.
/// @param externalHandle The handle prepended to the input by the client.
/// @param computedHandle The handle computed on-chain from the ciphertext and context.
/// @param chainId The chain ID used in handle computation.
/// @param aclAddress The ACL contract address used in handle computation.
/// @param userAddress The user address used in handle computation.
/// @param contractAddress The contract address used in handle computation.
error ExternalHandleDoesNotMatchComputedHandle(
    bytes32 externalHandle,
    bytes32 computedHandle,
    // These values are provided to help the caller debug a mismatch, they are the inputs to the context of computedHandle
    uint256 chainId,
    address aclAddress,
    address userAddress,
    address contractAddress,
    uint16 version
);

/// @title EncryptedInputStorage
/// @notice Storage for EncryptedInput contract using ERC-7201 namespaced storage pattern
/// @dev Stores a whitelist of accepted versions for encrypted inputs.
abstract contract EncryptedInputStorage {

    /// @notice Storage for version whitelist, using ERC-7201 namespaced storage.
    struct StorageForEncryptedInput {
        /// @notice Mapping of accepted version numbers for encrypted inputs.
        /// @dev Only versions in this mapping are accepted for new inputs.
        mapping(uint16 => bool) acceptedVersions;
    }

    /// @notice Storage slot location using keccak256 of a unique namespace string
    bytes32 private constant ENCRYPTED_INPUT_STORAGE_LOCATION = keccak256("inco.storage.EncryptedInput");

    /// @notice Retrieves the storage struct from its dedicated slot
    /// @dev Uses assembly to directly access the storage slot for gas efficiency
    /// @return $ Reference to the StorageForEncryptedInput struct
    function _getEncryptedInputStorage() internal pure returns (StorageForEncryptedInput storage $) {
        bytes32 loc = ENCRYPTED_INPUT_STORAGE_LOCATION;
        assembly {
            $.slot := loc
        }
    }

}

/// @title EncryptedInput
/// @notice Handles the submission of client-encrypted values to create on-chain encrypted handles.
/// @dev Users encrypt values client-side and submit them with a prepended handle as a checksum.
/// The contract verifies the handle matches the on-chain computation to ensure context consistency.
/// This is a paid operation - users must send ETH to cover processing costs.
abstract contract EncryptedInput is
    IEncryptedInput,
    EncryptedInputStorage,
    BaseAccessControlList,
    HandleGeneration,
    Fee
{

    /// @notice Sets whether a version is accepted.
    /// @param version The version number (must be non-negative).
    /// @param accepted Whether the version should be accepted.
    function _setAcceptedVersion(uint16 version, bool accepted) internal {
        _getEncryptedInputStorage().acceptedVersions[version] = accepted;
        if (accepted) {
            emit VersionAccepted(version);
        } else {
            emit VersionRemoved(version);
        }
    }

    /// @notice Checks whether a version is accepted.
    /// @param version The version number to check.
    /// @return True if the version is in the whitelist.
    function isAcceptedVersion(uint16 version) public view returns (bool) {
        return _getEncryptedInputStorage().acceptedVersions[version];
    }

    /// @notice Emitted when a new encrypted input is submitted.
    /// @param result The generated handle for the encrypted value.
    /// @param contractAddress The contract that submitted the input.
    /// @param user The user who encrypted the value.
    /// @param ciphertext The encrypted data (without the prepended handle).
    /// @param eventId The unique event ID for ordering.
    event NewInput(
        bytes32 indexed result,
        address indexed contractAddress,
        address indexed user,
        uint16 version,
        bytes ciphertext,
        uint256 eventId
    );

    /// @notice Submits a client-encrypted uint256 value to create an encrypted handle.
    /// @dev This is a paid operation. The input must contain a prepended handle for verification.
    /// @param input The encrypted input with prepended handle checksum.
    /// @param user The user address that encrypted the value.
    /// @return newValue The encrypted uint256 handle.
    function newEuint256(bytes calldata input, address user) external payable returns (euint256 newValue) {
        return euint256.wrap(newInput(input, user, ETypes.Uint256));
    }

    /// @notice Submits a client-encrypted boolean value to create an encrypted handle.
    /// @dev This is a paid operation. The input must contain a prepended handle for verification.
    /// @param input The encrypted input with prepended handle checksum.
    /// @param user The user address that encrypted the value.
    /// @return newValue The encrypted boolean handle.
    function newEbool(bytes calldata input, address user) external payable returns (ebool newValue) {
        return ebool.wrap(newInput(input, user, ETypes.Bool));
    }

    /// @notice Submits a client-encrypted address value to create an encrypted handle.
    /// @dev This is a paid operation. The input must contain a prepended handle for verification.
    /// @param input The encrypted input with prepended handle checksum.
    /// @param user The user address that encrypted the value.
    /// @return newValue The encrypted address handle.
    function newEaddress(bytes calldata input, address user) external payable returns (eaddress newValue) {
        return eaddress.wrap(newInput(input, user, ETypes.AddressOrUint160OrBytes20));
    }

    /// @dev Internal function to process encrypted input with fee payment.
    /// @param user The user address that encrypted the value.
    /// @param inputType The type of encrypted value.
    /// @return newHandle The generated handle.
    function newInput(bytes calldata input, address user, ETypes inputType)
        internal
        paying
        returns (bytes32 newHandle)
    {
        newHandle = _newInput(input, user, inputType);
        // We allow to user since this is harmless and it is convenient to use the allow mapping to track inputs.
        // NOTE: the allow must come after emitting the new input event, since allow emits its own event.
        allowInternal(newHandle, user);
    }

    /// @dev Internal function to process encrypted input without fee payment.
    /// Used for internal operations that don't require user payment.
    /// @param user The user address that encrypted the value.
    /// @param inputType The type of encrypted value.
    /// @return newHandle The generated handle.
    function newInputNotPaying(bytes calldata input, address user, ETypes inputType)
        internal
        returns (bytes32 newHandle)
    {
        newHandle = _newInput(input, user, inputType);
        // We allow to user since this is harmless and it is convenient to use the allow mapping to track inputs.
        // NOTE: the allow must come after emitting the new input event, since allow emits its own event.
        allowInternal(newHandle, user);
    }

    /// @dev Internal function to process encrypted input without fee payment and without emitting events.
    /// Used by EList for importing multiple inputs without emitting individual events for each input.
    /// @param user The user address that encrypted the value.
    /// @param inputType The type of encrypted value.
    /// @return newHandle The generated handle.
    function newInputNotPayingNotEmitting(bytes calldata input, address user, ETypes inputType)
        internal
        returns (bytes32 newHandle)
    {
        newHandle = _newInput(input, user, inputType);
    }

    /// @notice Creates a new input with a prepended handle as a checksum.
    /// @dev Verifies the external handle matches the computed handle, ensures the handle
    /// doesn't already exist, emits the NewInput event, and grants access to the user
    /// and calling contract.
    /// @param input The input that contains the handle prepended to the ciphertext.
    /// @param user The user address associated with the input.
    /// @param inputType The type of encrypted value being created.
    /// @return handle The generated handle for the encrypted value.
    function _newInput(bytes calldata input, address user, ETypes inputType) private returns (bytes32 handle) {
        // Since there is no sensible way to handle abi.decode errors (https://github.com/argotorg/solidity/issues/10381)
        // at least fail early on a conservative minimum length
        require(input.length >= 68, InputLengthTooShort(input.length));
        // Parse the version from the first 4 bytes.
        bytes4 prefix = bytes4(input[:4]);
        uint16 version = uint16(uint32(prefix));

        // Reject versions not in the whitelist
        require(isAcceptedVersion(version), InvalidInputVersion(version));
        // Remove external handle prepended to input as a checksum
        (bytes32 externalHandle, bytes memory ciphertext) = abi.decode(input[4:], (bytes32, bytes));
        handle = getInputHandle(ciphertext, user, msg.sender, version, inputType);
        require(
            handle == externalHandle,
            ExternalHandleDoesNotMatchComputedHandle({
                externalHandle: externalHandle,
                computedHandle: handle,
                chainId: block.chainid,
                aclAddress: address(this),
                userAddress: user,
                contractAddress: msg.sender,
                version: version
            })
        );
        // We assume that providing the same handle (which via HADU implies same plaintext, same context, and same
        // instance of encryption)
        require(!isAllowed(handle, user), HandleAlreadyExists(handle));
        uint256 id = getNextEventId();
        emit NewInput({
            result: handle,
            contractAddress: msg.sender,
            user: user,
            version: version,
            ciphertext: ciphertext,
            eventId: id
        });
        setDigest(abi.encodePacked(handle, id));
        allowTransientInternal(handle, msg.sender);
    }

}
