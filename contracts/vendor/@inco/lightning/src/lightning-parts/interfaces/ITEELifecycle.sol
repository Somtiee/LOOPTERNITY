// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {BootstrapResult, UpgradeResult, AddNodeResult} from "../TEELifecycle.types.sol";
import {IQuoteVerifier} from "../../interfaces/automata-interfaces/IQuoteVerifier.sol";
import {Td10ReportBody} from "../../interfaces/automata-interfaces/Types.sol";

interface ITEELifecycle {

    function verifyBootstrapResult(
        BootstrapResult calldata bootstrapResult,
        bytes calldata quote,
        bytes calldata signature
    ) external;
    function verifyUpgradeResult(
        bytes32 newMrAggregated,
        UpgradeResult calldata upgradeResult,
        bytes calldata quote,
        bytes calldata signature
    ) external;
    function verifyAddNodeResult(
        bytes32 newMrAggregated,
        AddNodeResult calldata addNodeResult,
        bytes calldata quote,
        bytes calldata signature
    ) external;
    function approveNewTeeVersion(bytes32 newMrAggregated) external;
    function parseTd10ReportBody(bytes calldata rawQuote) external pure returns (Td10ReportBody memory report);
    function parseReport(Td10ReportBody memory tdReport) external pure returns (address, bytes32);
    function bootstrapResultDigest(BootstrapResult memory bootstrapResult) external view returns (bytes32);
    function quoteVerifier() external view returns (IQuoteVerifier);

}
