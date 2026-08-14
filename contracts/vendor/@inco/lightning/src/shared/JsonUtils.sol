// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {Script} from "forge-std/Script.sol";

contract JsonUtils is Script {

    function writeAddressToJson(address toWrite, string memory addressName, string memory destFile) public {
        string memory jsonObj = "";
        jsonObj = vm.serializeAddress(jsonObj, addressName, toWrite);
        vm.writeJson(jsonObj, destFile);
    }

}
