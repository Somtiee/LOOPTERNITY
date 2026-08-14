// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {AllowanceProof, AllowanceVoucher} from "../AdvancedAccessControl.types.sol";

interface IVoucherEip712Checker {

    function allowanceVoucherDigest(AllowanceVoucher memory voucher) external view returns (bytes32);

}

interface IAdvancedAccessControl is IVoucherEip712Checker {

    function isAllowedWithProof(bytes32 handle, address account, AllowanceProof memory proof) external returns (bool);
    function getActiveVouchersSessionNonce(address account) external view returns (bytes32);
    function updateActiveVouchersSessionNonce(bytes32 salt) external;

}
