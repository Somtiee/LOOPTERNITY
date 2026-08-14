// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {IAdvancedAccessControl} from "../lightning-parts/AccessControl/interfaces/IAdvancedAccessControl.sol";
import {IDecryptionAttester} from "../lightning-parts/interfaces/IDecryptionAttester.sol";
import {ITEELifecycle} from "../lightning-parts/interfaces/ITEELifecycle.sol";
import {IQuoteVerifier} from "./automata-interfaces/IQuoteVerifier.sol";
import {ISignatureVerifier} from "../lightning-parts/primitives/interfaces/ISignatureVerifier.sol";

interface IIncoVerifier is IAdvancedAccessControl, IDecryptionAttester, ITEELifecycle, ISignatureVerifier {

    function initialize(address owner, string memory name, string memory version, IQuoteVerifier quoteVerifier) external;
    // forge-lint: disable-next-line(mixed-case-function)
    function getEIP712Name() external view returns (string memory);
    // forge-lint: disable-next-line(mixed-case-function)
    function getEIP712Version() external view returns (string memory);

}
