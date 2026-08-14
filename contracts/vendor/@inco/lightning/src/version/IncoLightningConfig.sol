// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

// Change these constants for new contracts
// Since this file only contains these constants, it could be generated reacting to cli inputs

// UPDATE the CHANGELOG on new versions

string constant CONTRACT_NAME = "incoLightning";
uint8 constant MAJOR_VERSION = 12;
uint8 constant MINOR_VERSION = 0;
// whenever a new version is deployed, we need to pump this up
// otherwise make test_upgrade will fail
// consequently, when we do a patch release, we don't need to pump it as it's already pumped
// when the previous release was done
uint8 constant PATCH_VERSION = 4;

string constant VERIFIER_NAME = "incoVerifier";
