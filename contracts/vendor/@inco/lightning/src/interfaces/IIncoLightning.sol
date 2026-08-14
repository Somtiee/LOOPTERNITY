// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {ITrivialEncryption} from "../lightning-parts/interfaces/ITrivialEncryption.sol";
import {IEList} from "../lightning-parts/interfaces/IEList.sol";
import {IVersion} from "../version/interfaces/IVersion.sol";

interface IIncoLightning is ITrivialEncryption, IEList, IVersion {

    error EthInboundTransferUnsupported();

    function initialize(address owner) external;

    function withdrawFees() external;

    function addAcceptedVersion(uint16 version) external;

    function removeAcceptedVersion(uint16 version) external;

}
