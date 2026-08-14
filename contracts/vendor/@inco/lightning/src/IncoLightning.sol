// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8.29;

import {IIncoLightning} from "./interfaces/IIncoLightning.sol";
import {CONTRACT_NAME, MAJOR_VERSION, MINOR_VERSION, PATCH_VERSION} from "./version/IncoLightningConfig.sol";
import {TrivialEncryption} from "./lightning-parts/TrivialEncryption.sol";
import {EList} from "./lightning-parts/EList.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Version} from "./version/Version.sol";
import {IIncoVerifier} from "./interfaces/IIncoVerifier.sol";
import {VerifierAddressGetter} from "./lightning-parts/primitives/VerifierAddressGetter.sol";

/// @title IncoLightning
/// @notice Onchain singleton for Inco Lightning, TEE-based encrypted data and operations over shared state
/// @dev This is the main entry point contract for the Inco Lightning protocol. It combines:
///      - EncryptedOperations: Encrypted operations (eAdd, eSub, eMul, etc.)
///      - TrivialEncryption: Creating encrypted handles from plaintext values
///      - EncryptedInput: Processing client-encrypted inputs
///      - BaseAccessControlList: Managing access permissions (via inheritance)
///
///      The contract is deployed as a UUPS upgradeable proxy and uses CreateX for deterministic deployment.
///      All encrypted values are represented as bytes32 handles that reference ciphertexts stored off-chain.
contract IncoLightning is IIncoLightning, TrivialEncryption, EList, UUPSUpgradeable, OwnableUpgradeable, Version {

    /// @notice Initializes the IncoLightning contract with deployment configuration
    /// @dev The salt embeds the deployer address, contract name, version, and pepper for deterministic deployment.
    ///      This constructor is called once during proxy implementation deployment.
    /// @param _salt Unique salt used for deterministic deployment via CreateX
    /// @param _incoVerifier The verifier contract address for attestation validation
    constructor(bytes32 _salt, IIncoVerifier _incoVerifier)
        Version(MAJOR_VERSION, MINOR_VERSION, PATCH_VERSION, _salt, CONTRACT_NAME)
        VerifierAddressGetter(address(_incoVerifier))
    {}

    /// @notice Authorizes contract upgrades (restricted to owner only)
    /// @dev Required by UUPSUpgradeable. Only the contract owner can authorize upgrades.
    function _authorizeUpgrade(address) internal view override onlyOwner {}

    /// @notice Initializes the proxy with an owner address
    /// @dev Must be called immediately after proxy deployment. Can only be called once.
    ///      This sets up the Ownable state for the proxy instance.
    /// @param _owner The address that will own this contract and can authorize upgrades
    function initialize(address _owner) public initializer {
        __Ownable_init(_owner);
        __Pausable_init();
        _setAcceptedVersion(2, true);
    }

    /// @notice Pauses ACL checks and all event-emitting encrypted operations.
    /// @dev While paused, `isAllowed` returns false unconditionally and every external
    ///      operation guarded by `whenNotPaused` reverts with `EnforcedPause`. Owner-only.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resumes ACL checks and encrypted operations.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Withdraws accumulated protocol fees to the owner
    /// @dev Only callable by the contract owner. Transfers all accumulated fees
    ///      from encrypted operations to the owner address.
    function withdrawFees() external onlyOwner {
        _withdrawFeesTo(owner());
    }

    /// @notice Adds a version to the accepted input versions whitelist.
    /// @param version The version number to accept (must be non-negative).
    function addAcceptedVersion(uint16 version) external onlyOwner {
        _setAcceptedVersion(version, true);
    }

    /// @notice Removes a version from the accepted input versions whitelist.
    /// @param version The version number to remove.
    function removeAcceptedVersion(uint16 version) external onlyOwner {
        _setAcceptedVersion(version, false);
    }

    /// @notice Required for CreateX deterministic deployment
    /// @dev Empty fallback allows the contract to be deployed via CreateX's create2 mechanism
    fallback() external {}

    /// @dev Reject any incoming ETH transfers, as the contract is not designed to handle ETH and does not have a payable fallback.
    receive() external payable {
        revert EthInboundTransferUnsupported();
    }

}
