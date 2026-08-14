// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {IIncoVerifier} from "../../interfaces/IIncoVerifier.sol";
import {IVerifierAddressGetter} from "./interfaces/IVerifierAddressGetter.sol";

/// @title VerifierAddressGetter
/// @notice Provides immutable access to the IncoVerifier contract address
/// @dev Abstract contract that stores the IncoVerifier address at deployment time.
///      The IncoVerifier is responsible for validating decryption attestations from covalidators.
///      This pattern ensures the verifier address is set once and cannot be changed,
///      which is critical for security as the verifier is trusted for attestation validation.
abstract contract VerifierAddressGetter is IVerifierAddressGetter {

    /// @notice The IncoVerifier contract used for attestation validation
    /// @dev Set immutably at deployment. Used to verify decryption proofs from covalidators.
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    IIncoVerifier public immutable incoVerifier;

    /// @notice Initializes the contract with the IncoVerifier address
    /// @param _incoVerifier The address of the deployed IncoVerifier contract
    constructor(address _incoVerifier) {
        incoVerifier = IIncoVerifier(_incoVerifier);
    }

}
