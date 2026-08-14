// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

/// @title LightningAddressGetter
/// @notice Provides immutable access to the IncoLightning contract address
/// @dev Abstract contract that stores the main IncoLightning address at deployment time.
///      Used by peripheral contracts (like AdvancedAccessControl, SessionVerifier) that need
///      to call back to the main IncoLightning contract for ACL lookups or other operations.
///      The address is immutable to prevent redirection attacks.
abstract contract LightningAddressGetter {

    /// @notice The main IncoLightning contract address
    /// @dev Set immutably at deployment. Used for delegating calls and ACL lookups.
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    address internal immutable incoLightningAddress;

    /// @notice Initializes the contract with the IncoLightning address
    /// @param _incoLightningAddress The address of the deployed IncoLightning contract
    constructor(address _incoLightningAddress) {
        incoLightningAddress = _incoLightningAddress;
    }

}
