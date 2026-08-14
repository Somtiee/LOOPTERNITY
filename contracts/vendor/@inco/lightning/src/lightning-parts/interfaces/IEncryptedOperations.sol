// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {euint256, ebool, ETypes} from "../../Types.sol";
import {IBaseAccessControlList} from "../AccessControl/interfaces/IBaseAccessControlList.sol";
import {IHandleGeneration} from "../primitives/interfaces/IHandleGeneration.sol";

interface IEncryptedOperations is IBaseAccessControlList, IHandleGeneration {

    function eAdd(euint256 lhs, euint256 rhs) external returns (euint256 result);
    function eSub(euint256 lhs, euint256 rhs) external returns (euint256 result);
    function eMul(euint256 lhs, euint256 rhs) external returns (euint256 result);
    function eDiv(euint256 lhs, euint256 rhs) external returns (euint256 result);
    function eRem(euint256 lhs, euint256 rhs) external returns (euint256 result);
    function eBitAnd(bytes32 lhs, bytes32 rhs) external returns (bytes32 result);
    function eBitOr(bytes32 lhs, bytes32 rhs) external returns (bytes32 result);
    function eBitXor(bytes32 lhs, bytes32 rhs) external returns (bytes32 result);
    function eShl(euint256 lhs, euint256 rhs) external returns (euint256 result);
    function eShr(euint256 lhs, euint256 rhs) external returns (euint256 result);
    function eRotl(euint256 lhs, euint256 rhs) external returns (euint256 result);
    function eRotr(euint256 lhs, euint256 rhs) external returns (euint256 result);
    function eEq(bytes32 lhs, bytes32 rhs) external returns (ebool result);
    function eNe(bytes32 lhs, bytes32 rhs) external returns (ebool result);
    function eGe(euint256 lhs, euint256 rhs) external returns (ebool result);
    function eGt(euint256 lhs, euint256 rhs) external returns (ebool result);
    function eLe(euint256 lhs, euint256 rhs) external returns (ebool result);
    function eLt(euint256 lhs, euint256 rhs) external returns (ebool result);
    function eMin(euint256 lhs, euint256 rhs) external returns (euint256 result);
    function eMax(euint256 lhs, euint256 rhs) external returns (euint256 result);
    function eNot(ebool operand) external returns (ebool result);
    function eCast(bytes32 ct, ETypes toType) external returns (bytes32 result);
    function eRandBounded(bytes32 upperBound, ETypes randType) external payable returns (bytes32 result);
    function eIfThenElse(ebool condition, bytes32 ifTrue, bytes32 ifFalse) external returns (bytes32 result);

}
