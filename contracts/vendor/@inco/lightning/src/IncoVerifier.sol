// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8.29;

import {AdvancedAccessControl} from "./lightning-parts/AccessControl/AdvancedAccessControl.sol";
import {DecryptionAttester} from "./lightning-parts/DecryptionAttester.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {IQuoteVerifier} from "./interfaces/automata-interfaces/IQuoteVerifier.sol";
import {TEELifecycle} from "./lightning-parts/TEELifecycle.sol";
import {IIncoVerifier} from "./interfaces/IIncoVerifier.sol";
import {LightningAddressGetter} from "./lightning-parts/primitives/LightningAddressGetter.sol";

/// @title IncoVerifier
/// @notice Verifier contract for Inco Lightning TEE attestation and decryption authorization
/// @dev NEVER deploy this contract on its own, always deploy as a joint process with IncoLightning
contract IncoVerifier is IIncoVerifier, AdvancedAccessControl, DecryptionAttester, TEELifecycle, UUPSUpgradeable {

    /// @notice Initializes the IncoVerifier contract with the IncoLightning address
    /// @dev This constructor is called once during proxy implementation deployment.
    /// @param _incoLightningAddress The address of the IncoLightning contract for attestation validation
    constructor(address _incoLightningAddress) LightningAddressGetter(_incoLightningAddress) {}

    /// @notice Authorizes contract upgrades (restricted to owner only)
    /// @dev Required by UUPSUpgradeable. Only the contract owner can authorize upgrades.
    function _authorizeUpgrade(address) internal view override onlyOwner {}

    /// @notice Initializes the proxy with an owner address and EIP712 parameters
    /// @dev Must be called immediately after proxy deployment. Can only be called once.
    ///      This sets up the Ownable state for the proxy instance and initializes EIP712 and TEE lifecycle.
    /// @param owner The address that will own this contract and can authorize upgrades
    /// @param name The EIP712 domain name
    /// @param version The EIP712 domain version
    /// @param quoteVerifier The quote verifier contract for TEE attestation validation
    function initialize(address owner, string memory name, string memory version, IQuoteVerifier quoteVerifier)
        public
        initializer
    {
        __Ownable_init(owner);
        __EIP712_init(name, version);
        __TeeLifecycle_init(quoteVerifier);
        __Pausable_init();
    }

    /// @notice Pauses attestation verification and voucher-based access checks.
    /// @dev While paused, `isAllowedWithProof` and the `isValid*Attestation` family return false,
    ///      causing dependent flows (e.g. `claimHandle`) to reject. Owner-only.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resumes attestation verification and voucher-based access checks.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Returns the EIP712 domain name
    /// @dev Used in signing and verifying structured data
    // forge-lint: disable-next-line(mixed-case-function)
    function getEIP712Name() external view returns (string memory) {
        return _EIP712Name();
    }

    /// @notice Returns the EIP712 domain version
    /// @dev Used in signing and verifying structured data
    // forge-lint: disable-next-line(mixed-case-function)
    function getEIP712Version() external view returns (string memory) {
        return _EIP712Version();
    }

}
