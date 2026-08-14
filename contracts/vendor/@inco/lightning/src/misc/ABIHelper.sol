// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {Session} from "@inco/lightning/src/periphery/SessionVerifier.sol";

// @dev this contract is not used on-chain, it is only used to generate the
// ABI of some symbols that are not exposed directly by the IncoLightning or
// periphery contracts, but are needed for the JS SDK.
contract ABIHelper {

    function getSession() public pure returns (Session memory) {
        revert("This function exists only to include Session struct in ABI");
    }

}
