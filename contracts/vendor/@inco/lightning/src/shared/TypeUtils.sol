// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

function asBool(bytes32 encodedBool) pure returns (bool) {
    return encodedBool != bytes32(0);
}

function asBytes32(bool value) pure returns (bytes32) {
    return value ? bytes32(uint256(1)) : bytes32(uint256(0));
}

uint256 constant GWEI = 1e9;
