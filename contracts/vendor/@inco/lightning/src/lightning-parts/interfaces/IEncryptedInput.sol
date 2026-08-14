// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {euint256, ebool, eaddress} from "../../Types.sol";
import {IBaseAccessControlList} from "../AccessControl/interfaces/IBaseAccessControlList.sol";
import {IHandleGeneration} from "../primitives/interfaces/IHandleGeneration.sol";

interface IEncryptedInput is IBaseAccessControlList, IHandleGeneration {

    error InvalidInputVersion(uint16 version);
    error InputLengthTooShort(uint256 length);

    event VersionAccepted(uint16 indexed version);
    event VersionRemoved(uint16 indexed version);

    function newEuint256(bytes calldata ciphertext, address user) external payable returns (euint256 newValue);
    function newEbool(bytes calldata ciphertext, address user) external payable returns (ebool newValue);
    function newEaddress(bytes calldata ciphertext, address user) external payable returns (eaddress newValue);

}
