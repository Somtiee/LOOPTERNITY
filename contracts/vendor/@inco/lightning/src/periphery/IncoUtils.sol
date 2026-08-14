// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {StorageSlot} from "@openzeppelin/contracts/utils/StorageSlot.sol";

// Re-export FEE constant for convenience - consumers can import both IncoUtils and FEE from this file
// forge-lint: disable-next-line(unused-import)
import {FEE, BIT_FEE} from "../lightning-parts/Fee.sol";

contract IncoUtils {

    error RefundFailed();
    error ReentrantCall();

    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    bytes32 private constant REENTRANCY_GUARD_SLOT = keccak256("inco.storage.IncoUtils.reentrancyGuard");

    /// @notice Refund the difference between msg.value and what was actually spent
    /// @dev Assumes all outflows and inflows to the contract are due to the user; refund is capped at msg.value
    /// @dev Includes built-in reentrancy protection using OZ StorageSlot pattern (modifiers cannot use other modifiers)
    modifier refundUnspent() {
        StorageSlot.Uint256Slot storage status = StorageSlot.getUint256Slot(REENTRANCY_GUARD_SLOT);

        require(status.value != ENTERED, ReentrantCall());
        status.value = ENTERED;

        uint256 balanceBefore = address(this).balance;
        _;
        uint256 balanceAfter = address(this).balance;
        uint256 spent = balanceBefore > balanceAfter ? balanceBefore - balanceAfter : 0;
        uint256 refund = msg.value > spent ? msg.value - spent : 0;

        if (refund > 0) {
            (bool success,) = msg.sender.call{value: refund}("");
            require(success, RefundFailed());
        }

        status.value = NOT_ENTERED;
    }

}
