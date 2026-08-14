// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {elist, ETypes} from "../../Types.sol";
import {IEListHandleMetadata} from "../primitives/interfaces/IEListHandleMetadata.sol";
import {IEncryptedOperations} from "./IEncryptedOperations.sol";
import {IEncryptedInput} from "./IEncryptedInput.sol";

interface IEList is IEncryptedOperations, IEncryptedInput, IEListHandleMetadata {

    function newEList(bytes32[] memory handles, ETypes listType) external payable returns (elist newList);

    function newEList(bytes[] calldata inputs, ETypes listType, address user) external payable returns (elist newList);

    function listAppend(elist list, bytes32 value) external payable returns (elist result);

    function listGet(elist list, uint16 i) external returns (bytes32 result);

    function listGetOr(elist list, bytes32 i, bytes32 defaultValue) external returns (bytes32 result);

    function listSet(elist list, bytes32 i, bytes32 value) external payable returns (elist result);

    function listInsert(elist list, bytes32 i, bytes32 value) external payable returns (elist result);

    function listConcat(elist lhs, elist rhs) external payable returns (elist result);

    function listSlice(elist list, bytes32 start, uint16 len, bytes32 defaultValue)
        external
        payable
        returns (elist result);

    function listRange(uint16 start, uint16 end, ETypes listType) external payable returns (elist result);

    function listShuffle(elist list) external payable returns (elist result);

    function listReverse(elist list) external payable returns (elist result);

}
