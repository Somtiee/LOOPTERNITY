// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {ETypes, typeBitSize} from "../Types.sol";

/// @dev The current fee required for paid encryption operations.
///      This constant may be modified through contract upgrades.
///      Developers should call getFee() rather than hardcoding this value.
uint256 constant FEE = 0.000001 ether;

uint256 constant BIT_FEE = FEE / 256;

/// @title Fee
/// @notice Fee management utilities for encryption operations that require payment
/// @dev Certain operations (encrypted inputs, randomness) require a fee to cover covalidator costs.
///      The fee is paid via msg.value and accumulates in the contract balance.
///      The contract owner can withdraw accumulated fees via withdrawFees() in IncoLightning.
///
///      Important: The fee amount may change through contract upgrades. Always use getFee()
///      to determine the current fee rather than hardcoding values.
abstract contract Fee {

    /// @notice Thrown when the exact required fee is not paid
    error FeeNotPaid();

    /// @notice Thrown when the ETH transfer during fee withdrawal fails
    error FeeWithdrawalFailed();

    /// @notice Thrown when attempting to withdraw with zero balance
    error NoFeesToWithdraw();

    /// @notice Returns the fee required for paid operations
    /// @dev The fee may change through contract upgrades. Always query this function
    ///      to get the current fee rather than caching the value.
    /// @return The fee amount in wei
    function getFee() public pure returns (uint256) {
        return FEE;
    }

    /// @notice Modifier that requires the exact fee to be paid via msg.value
    /// @dev Use this modifier on functions that require a single fee payment (e.g., single input)
    modifier paying() {
        require(msg.value == FEE, FeeNotPaid());
        _;
    }

    /// @notice Modifier that requires multiple fees to be paid via msg.value
    /// @dev Use this modifier on functions that require payment for multiple operations (e.g., batch inputs)
    /// @param nbOfFees The number of fee units required (total cost = FEE * nbOfFees)
    modifier payingMultiple(uint256 nbOfFees) {
        require(msg.value == FEE * nbOfFees, FeeNotPaid());
        _;
    }

    /// @notice Modifier that requires payment proportional to elist bit size
    /// @dev Fee = totalBits * BIT_FEE. totalBits is the sum of bit sizes across all elist inputs and outputs.
    /// @param totalBits The total elist bit count for the operation
    modifier payingElistFee(uint256 totalBits) {
        require(msg.value == totalBits * BIT_FEE, FeeNotPaid());
        _;
    }

    /// @notice Returns the per-bit fee for elist operations
    /// @dev The fee may change through contract upgrades. Always query this function
    ///      to get the current fee rather than caching the value.
    /// @return The per-bit fee amount in wei
    function getBitFee() public pure returns (uint256) {
        return BIT_FEE;
    }

    /// @notice Returns the fee for an elist operation given element count and type
    /// @dev Fee = BIT_FEE * nOfElements * typeBitSize(elType)
    /// @param nOfElements The number of elements in the resulting list
    /// @param elType The element type of the list
    /// @return The fee amount in wei
    function getEListFee(uint16 nOfElements, ETypes elType) public pure returns (uint256) {
        return BIT_FEE * uint256(nOfElements) * typeBitSize(elType);
    }

    /// @notice Withdraws all accumulated fees to the specified recipient
    /// @dev Internal function called by IncoLightning.withdrawFees(). Transfers the entire
    ///      contract balance to the recipient.
    /// @param recipient The address to send the accumulated fees to
    function _withdrawFeesTo(address recipient) internal {
        uint256 fees = address(this).balance;
        require(fees > 0, NoFeesToWithdraw());
        (bool success,) = payable(recipient).call{value: fees}("");
        require(success, FeeWithdrawalFailed());
    }

}
