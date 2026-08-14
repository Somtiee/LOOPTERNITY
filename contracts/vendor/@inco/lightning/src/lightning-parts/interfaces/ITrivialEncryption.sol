// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {euint256, ebool, eaddress} from "../../Types.sol";
import {IBaseAccessControlList} from "../AccessControl/interfaces/IBaseAccessControlList.sol";
import {IHandleGeneration} from "../primitives/interfaces/IHandleGeneration.sol";

interface ITrivialEncryption is IBaseAccessControlList, IHandleGeneration {

    function asEuint256(uint256 value) external returns (euint256 newEuint256);
    function asEbool(bool value) external returns (ebool newEbool);
    function asEaddress(address value) external returns (eaddress newEaddress);

}
