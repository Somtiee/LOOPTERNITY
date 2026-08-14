// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {IEventCounter} from "./interfaces/IEventCounter.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @title EventCounterStorage
/// @notice Diamond storage pattern for the event counter state
/// @dev Uses a unique storage slot to avoid conflicts with other contracts in the inheritance chain.
///      The event counter provides unique, sequential identifiers for encrypted operations within a transaction.
contract EventCounterStorage {

    /// @notice Storage struct containing the event counter state
    /// @dev eventCounter is incremented for each encrypted operation to ensure unique handle generation
    struct Storage {
        /// @notice Counter that increments for each event, or stores a digest for batch operations
        uint256 eventCounter; // TODO: change type to bytes32 when we rename away from "counter".
    }

    /// @notice Storage slot location using keccak256 of a unique namespace string
    bytes32 private constant EVENT_COUNTER_STORAGE_LOCATION = keccak256("lightning.storage.EventCounter");

    /// @notice Retrieves the storage struct from its dedicated slot
    /// @dev Uses assembly to directly access the storage slot for gas efficiency
    /// @return $ Reference to the Storage struct
    function getEventCounterStorage() internal pure returns (Storage storage $) {
        bytes32 loc = EVENT_COUNTER_STORAGE_LOCATION;
        assembly {
            $.slot := loc
        }
    }

}

/// @title EventCounter
/// @notice Manages unique event identifiers for encrypted operation handle generation
/// @dev Each encrypted operation requires a unique identifier to generate deterministic handles.
///      This contract provides two modes:
///      1. Sequential mode: getNewEventId() increments counter for each operation
///      2. Digest mode: setDigest() sets counter to hash of serialized operations (for batching)
///
///      The event ID is incorporated into handle generation to ensure uniqueness even when
///      the same operation is performed multiple times in the same transaction.
contract EventCounter is IEventCounter, EventCounterStorage, PausableUpgradeable {

    /// @notice Generates and returns a new unique event ID
    /// @dev Post-increments the counter, so the returned value is the ID before incrementing.
    ///      This ensures each call returns a unique ID within the contract's lifetime.
    /// @return newEventId The event ID to use for this operation
    function getNewEventId() internal returns (uint256 newEventId) {
        newEventId = getEventCounterStorage().eventCounter++;
    }

    /// @notice Sets the event counter to a digest value for batch operation tracking
    /// @dev Used when processing batched operations where a serialization hash
    ///      provides better uniqueness than sequential IDs. Reverts when the contract
    ///      is paused, which transitively blocks every event-emitting operation that
    ///      finalizes by calling this function (encrypted ops, list ops, trivial encryption,
    ///      input registration, allow/reveal).
    /// @param serialization The serialized batch data to hash
    function setDigest(bytes memory serialization) internal whenNotPaused {
        getEventCounterStorage().eventCounter = uint256(keccak256(serialization));
    }

    /// @notice Returns the next event ID that will be assigned
    /// @dev View function that does not modify state. Useful for predicting handles
    ///      or verifying the current state of the counter.
    /// @return The next event ID value
    function getNextEventId() public view returns (uint256) {
        return getEventCounterStorage().eventCounter;
    }

    /// @notice Returns the current value of the event counter
    /// @dev Deprecated: Use getNextEventId() instead. Kept for backwards compatibility.
    /// @return The current event counter value
    function getEventCounter() public view returns (uint256) {
        return getNextEventId();
    }

}
