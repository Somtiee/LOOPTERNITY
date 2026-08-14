// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {EOps, SenderNotAllowedForHandle} from "../../Types.sol";
import {IBaseAccessControlList} from "./interfaces/IBaseAccessControlList.sol";
import {EventCounter} from "../primitives/EventCounter.sol";
import {VerifierAddressGetter} from "../primitives/VerifierAddressGetter.sol";
import {AllowanceProof} from "../AccessControl/AdvancedAccessControl.types.sol";

/// @title AccessControlListStorage
/// @notice Storage layout for the Access Control List (ACL).
/// @dev Uses ERC-7201 namespaced storage pattern to avoid storage collisions.
contract AccessControlListStorage {

    /// @dev Storage struct for ACL state.
    struct AclStorage {
        /// @dev Maps (handle, account) pairs to persistent access permissions.
        mapping(bytes32 handle => mapping(address account => bool isAllowed)) persistedAllowedPairs;
        /// @dev Maps handles to whether they are revealed (publicly accessible).
        mapping(bytes32 handle => bool isAllowed) persistedAllowedForDecryption;
    }

    bytes32 private constant ACL_STORAGE_LOCATION = keccak256("inco.storage.ACL");

    /// @dev Returns a pointer to the ACL storage struct.
    function getAclStorage() internal pure returns (AclStorage storage $) {
        bytes32 loc = ACL_STORAGE_LOCATION;
        assembly {
            $.slot := loc
        }
    }

}

/// @title BaseAccessControlList
/// @notice Manages access permissions for encrypted handles.
/// @dev Implements a two-tier permission system:
/// - **Persistent permissions**: Stored permanently, survive across transactions.
/// - **Transient permissions**: Stored in transient storage (EIP-1153), cleared at end of transaction.
///
/// Access is granted if any of these conditions are true:
/// 1. Transient permission exists for (handle, account)
/// 2. Persistent permission exists for (handle, account)
/// 3. The handle has been revealed (public access)
abstract contract BaseAccessControlList is
    IBaseAccessControlList,
    AccessControlListStorage,
    VerifierAddressGetter,
    EventCounter
{

    /// @notice Thrown when proof verification fails during handle claiming.
    /// @param verifyingContract The contract that was supposed to verify.
    /// @param callFunction The function selector that was called.
    /// @param argData The argument data that failed verification.
    error ProofVerificationFailed(address verifyingContract, bytes4 callFunction, bytes argData);

    /// @notice Emitted when persistent access is granted to an account for a handle.
    /// @param handle The encrypted handle.
    /// @param account The account granted access.
    /// @param eventId The unique event ID.
    event Allow(bytes32 handle, address account, uint256 eventId);

    /// @notice Emitted when a handle is revealed for public access.
    /// @param handle The encrypted handle that was revealed.
    /// @param eventId The unique event ID.
    event Reveal(bytes32 handle, uint256 eventId);

    /// @notice Grants persistent access to an account for an encrypted handle.
    /// @dev Caller must already have access to the handle. This permission survives across transactions.
    /// @param handle The encrypted handle to grant access to.
    /// @param account The account to grant access to.
    function allow(bytes32 handle, address account) public {
        require(isAllowed(handle, msg.sender), SenderNotAllowedForHandle(handle, msg.sender));
        allowInternal(handle, account);
    }

    /// @notice Reveals a handle, granting permanent public access to anyone.
    /// @dev Once revealed, the encrypted value can be decrypted by anyone. This is irreversible.
    /// Caller must have access to the handle.
    /// @param handle The encrypted handle to reveal.
    function reveal(bytes32 handle) public {
        require(isAllowed(handle, msg.sender), SenderNotAllowedForHandle(handle, msg.sender));
        AclStorage storage $ = getAclStorage();
        $.persistedAllowedForDecryption[handle] = true;
        uint256 id = getNextEventId();
        emit Reveal(handle, id);
        setDigest(abi.encodePacked(EOps.Reveal, handle, id));
    }

    /// @dev Internal function to grant persistent access without ownership check.
    /// @param handle The encrypted handle to grant access to.
    /// @param account The account to grant access to.
    function allowInternal(bytes32 handle, address account) internal {
        AclStorage storage $ = getAclStorage();
        $.persistedAllowedPairs[handle][account] = true;
        uint256 id = getNextEventId();
        emit Allow(handle, account, id);
        setDigest(abi.encodePacked(EOps.Allow, handle, account, id));
    }

    /// @notice Grants transient access to an account for an encrypted handle.
    /// @dev Transient permissions are cleared at the end of the transaction (EIP-1153).
    /// Caller must have access to the handle.
    /// @param handle The encrypted handle to grant access to.
    /// @param account The account to grant access to.
    function allowTransient(bytes32 handle, address account) public {
        require(isAllowed(handle, msg.sender), SenderNotAllowedForHandle(handle, msg.sender));
        allowTransientInternal(handle, account);
    }

    /// @dev Internal function to grant transient access without ownership check.
    /// Uses assembly to store in transient storage and track keys for cleanup.
    /// @param handle The encrypted handle to grant access to.
    /// @param account The account to grant access to.
    function allowTransientInternal(bytes32 handle, address account) internal {
        bytes32 key = keccak256(abi.encodePacked(handle, account));
        assembly {
            tstore(key, 1)
            let length := tload(0)
            let lengthPlusOne := add(length, 1)
            tstore(lengthPlusOne, key)
            tstore(0, lengthPlusOne)
        }
    }

    /// @notice Checks if transient access exists for a handle-account pair.
    /// @param handle The encrypted handle to check.
    /// @param account The account to check access for.
    /// @return True if transient access is granted.
    function allowedTransient(bytes32 handle, address account) public view returns (bool) {
        bool isAllowedTransient;
        bytes32 key = keccak256(abi.encodePacked(handle, account));
        assembly {
            isAllowedTransient := tload(key)
        }
        return isAllowedTransient;
    }

    /// @notice Claims access to a handle using a signed allowance proof.
    /// @dev Verifies the proof via IncoVerifier and grants persistent access if valid.
    /// @param handle The encrypted handle to claim access to.
    /// @param proof The signed allowance proof from an authorized sharer.
    function claimHandle(bytes32 handle, AllowanceProof memory proof) public {
        require(
            incoVerifier.isAllowedWithProof(handle, msg.sender, proof),
            ProofVerificationFailed(
                proof.voucher.verifyingContract, proof.voucher.callFunction, proof.voucher.sharerArgData
            )
        );
        allowInternal(handle, msg.sender);
    }

    /// @notice Checks if persistent access exists for a handle-account pair.
    /// @param handle The encrypted handle to check.
    /// @param account The account to check access for.
    /// @return True if persistent access is granted.
    function persistAllowed(bytes32 handle, address account) public view returns (bool) {
        AclStorage storage $ = getAclStorage();
        return $.persistedAllowedPairs[handle][account];
    }

    /// @notice Checks if an account has access to an encrypted handle.
    /// @dev Returns true if any of: transient access, persistent access, or handle is revealed.
    ///      Returns false unconditionally when the contract is paused.
    /// @param handle The encrypted handle to check.
    /// @param account The account to check access for.
    /// @return True if the account has access to the handle.
    function isAllowed(bytes32 handle, address account) public view returns (bool) {
        if (paused()) {
            return false;
        }
        return allowedTransient(handle, account) || persistAllowed(handle, account) || isRevealed(handle);
    }

    /// @notice Checks if a handle has been revealed for public access.
    /// @dev Returns false unconditionally when the contract is paused.
    /// @param handle The encrypted handle to check.
    /// @return True if the handle has been revealed.
    function isRevealed(bytes32 handle) public view returns (bool) {
        if (paused()) {
            return false;
        }
        AclStorage storage $ = getAclStorage();
        return $.persistedAllowedForDecryption[handle];
    }

}
