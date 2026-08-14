// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

interface ISignatureVerifier {

    function removeSigner(address signerAddress) external;
    function isSigner(address signerAddress) external view returns (bool);
    function isValidSignature(bytes32 hash, bytes[] memory signatures) external view returns (bool);
    function setThreshold(uint256 newThreshold) external;

}
