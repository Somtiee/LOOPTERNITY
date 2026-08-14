// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8.29;

import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    SESSION_VERIFIER_NAME,
    SESSION_VERIFIER_MAJOR_VERSION,
    SESSION_VERIFIER_MINOR_VERSION,
    SESSION_VERIFIER_PATCH_VERSION
} from "../version/SessionVerifierConfig.sol";
import {Version} from "../version/Version.sol";
import {ALLOWANCE_GRANTED_MAGIC_VALUE} from "../Types.sol";

/// @notice A Session grants temporary access to a decrypter for all data held by the sharer
/// @dev ABI encode this struct in the sharerArgData field of the voucher.
///      The session is valid only if:
///      1. The current block timestamp is before expiresAt
///      2. The requesting account matches the authorized decrypter
struct Session {
    /// @notice The address authorized to decrypt the sharer's data
    address decrypter;
    /// @notice Unix timestamp after which the session is no longer valid
    uint256 expiresAt;
}

/// @title SessionVerifier
/// @notice Inco access sharing verifier for browser dApp sessions
/// @dev Grants a single decrypter address temporary access to all of the sharer's
///      encrypted handles. The session is valid as long as block.timestamp < expiresAt
///      and the requesting account matches the authorized decrypter.
///
///      Usage:
///      1. User signs a voucher containing a Session struct with their chosen decrypter
///         and expiration time.
///      2. The voucher specifies canUseSession.selector as the callFunction.
///      3. When the decrypter requests access, this contract verifies the session is still
///         valid and the caller matches the authorized decrypter.
///
///      To use this verifier, set the voucher's callFunction to SessionVerifier.canUseSession.selector
contract SessionVerifier is UUPSUpgradeable, OwnableUpgradeable, Version {

    /// @notice Initializes the SessionVerifier with version information.
    /// @param _salt Unique salt used for deterministic deployment via CreateX
    constructor(bytes32 _salt)
        Version(
            SESSION_VERIFIER_MAJOR_VERSION,
            SESSION_VERIFIER_MINOR_VERSION,
            SESSION_VERIFIER_PATCH_VERSION,
            _salt,
            SESSION_VERIFIER_NAME
        )
    {}

    /// @notice Verifies if an account can use a session to access an encrypted handle.
    /// @dev This function is called by the ACL system when validating access permissions.
    ///      Access is granted if the session has not expired and the caller is the authorized decrypter.
    /// @param account The address requesting access (must match session.decrypter)
    /// @param sharerArgData ABI-encoded Session struct containing decrypter and expiration
    /// @return ALLOWANCE_GRANTED_MAGIC_VALUE if access is granted, bytes32(0) otherwise
    function canUseSession(
        bytes32, /* handle */
        address account,
        bytes memory sharerArgData,
        bytes memory /* requesterArgData */
    )
        external
        view
        returns (bytes32)
    {
        Session memory session = abi.decode(sharerArgData, (Session));

        if (session.expiresAt >= block.timestamp && session.decrypter == account) {
            return ALLOWANCE_GRANTED_MAGIC_VALUE;
        }

        return bytes32(0);
    }

    /// @notice Authorizes contract upgrades (restricted to owner only)
    /// @dev Required by UUPSUpgradeable. Only the contract owner can upgrade.
    function _authorizeUpgrade(address) internal view override {
        require(msg.sender == owner());
    }

    /// @notice Initializes the contract with an owner address
    /// @dev Must be called immediately after deployment via proxy. Can only be called once.
    /// @param owner The address that will own this contract and can authorize upgrades
    function initialize(address owner) public initializer {
        __Ownable_init(owner);
    }

    /// @notice Required for CreateX deterministic deployment
    /// @dev Empty fallback allows the contract to be deployed via CreateX's create2 mechanism
    fallback() external {}

}
