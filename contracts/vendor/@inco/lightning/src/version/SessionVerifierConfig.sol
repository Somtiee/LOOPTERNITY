// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

string constant SESSION_VERIFIER_NAME = "sessionVerifier";
uint8 constant SESSION_VERIFIER_MAJOR_VERSION = 0;
uint8 constant SESSION_VERIFIER_MINOR_VERSION = 1;
uint8 constant SESSION_VERIFIER_PATCH_VERSION = 2;
bytes32 constant SESSION_VERIFIER_PEPPER = keccak256("");
