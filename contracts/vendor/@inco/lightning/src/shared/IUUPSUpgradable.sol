// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

// OpenZeppelin doesn't export any interfaces for uupsUpgradeable so we define our own

interface IUUPSUpgradable {

    // forge-lint: disable-next-line(mixed-case-function)
    function proxiableUUID() external view returns (bytes32);
    // forge-lint: disable-next-line(mixed-case-function)
    function UPGRADE_INTERFACE_VERSION() external view returns (string memory);
    function upgradeToAndCall(address newImplementation, bytes memory data) external payable;

}
