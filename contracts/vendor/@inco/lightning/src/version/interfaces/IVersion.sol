// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

interface IVersion {

    function getVersionedName() external view returns (string memory);
    function getVersion() external view returns (string memory);
    function getName() external view returns (string memory);
    function getMajorVersion() external view returns (string memory);
    function majorVersion() external view returns (uint8);
    function minorVersion() external view returns (uint8);
    function patchVersion() external view returns (uint8);
    function salt() external view returns (bytes32);

}
