// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {CreateX} from "./pasted-dependencies/CreateX.sol";

// See: https://github.com/pcaversaccio/createx/issues/140 apparently this is as good as it gets if you fully compute
// the address from a salt since the internal _guard function is an essential part of the derivation
contract CreateXHelper is CreateX {

    address internal constant _CREATEX = 0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed;

    function computeCreate3DeployAddress(bytes32 salt) public view returns (address computedAddress) {
        return CreateX(_CREATEX).computeCreate3Address({salt: _guard(salt)});
    }

}
