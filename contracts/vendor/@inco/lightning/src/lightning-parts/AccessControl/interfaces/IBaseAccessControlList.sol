// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {IVerifierAddressGetter} from "../../primitives/interfaces/IVerifierAddressGetter.sol";
import {IEventCounter} from "../../primitives/interfaces/IEventCounter.sol";
import {AllowanceProof} from "../AdvancedAccessControl.types.sol";

interface IBaseAccessControlList is IVerifierAddressGetter, IEventCounter {

    function allow(bytes32 handle, address account) external;
    function reveal(bytes32 handle) external;
    function allowTransient(bytes32 handle, address account) external;
    function allowedTransient(bytes32 handle, address account) external view returns (bool);
    function persistAllowed(bytes32 handle, address account) external view returns (bool);
    function isAllowed(bytes32 handle, address account) external view returns (bool);
    function claimHandle(bytes32 handle, AllowanceProof memory proof) external;

}
