// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

// OpenZeppelin doesn't export any interfaces for ownable so we define our own

interface IOwnable {

    function owner() external view returns (address);
    function transferOwnership(address newOwner) external;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

}
