// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {ETypes, EOps} from "../../../Types.sol";

interface IHandleGeneration {

    function getTrivialEncryptHandle(bytes32 plaintextBytes, ETypes handleType)
        external
        view
        returns (bytes32 generatedHandle);

    function getOpResultHandle(EOps op, ETypes returnType, bytes memory packedInputs)
        external
        pure
        returns (bytes32 generatedHandle);

}
