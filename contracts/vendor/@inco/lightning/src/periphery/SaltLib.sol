// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

/// @dev Flag controlling cross-chain deployment authorization.
///      Set to 0x00 to allow same contract at same address on all chains.
///      Set to 0x01 to restrict to single chain deployment.
bytes1 constant CROSS_CHAIN_DEPLOY_AUTHORIZED_FLAG = 0x00;

/// @title Salt
/// @notice Shared salt derivation for CREATE3 deployments of Inco Lightning contracts.
/// @dev    Layout of every salt produced by this library:
///         - bytes 0..19  : deployer address (CreateX `_guard` requires `salt[0..19] == msg.sender`,
///                          i.e. the entity calling CreateX must match the address encoded here —
///                          this is what binds the deterministic address to a specific deployer key
///                          or Safe).
///         - byte  20     : `CROSS_CHAIN_DEPLOY_AUTHORIZED_FLAG` (0x00 = cross-chain auth allowed).
///         - bytes 21..31 : keccak-based entropy derived from the contract identity (name +
///                          MAJOR version + pepper for proxy salts; proxy salt + "impl" +
///                          MINOR + PATCH for impl salts).
///
///         `getSalt` builds a proxy salt — one per (contract, MAJOR, deployer, pepper) tuple, so
///         the proxy address is stable across MINOR/PATCH upgrades. `getImplSalt` derives a fresh
///         salt for each new implementation by mixing in MINOR/PATCH, ensuring each version maps
///         to a distinct impl address and an `upgradeToAndCall` never targets an already-used slot.
library Salt {

    /// @notice Computes a deployment salt from contract metadata
    /// @dev The salt incorporates:
    ///      - Deployer address (first 20 bytes)
    ///      - Cross-chain flag (1 byte)
    ///      - Hash of name, version, and pepper (last 11 bytes)
    /// @param name The contract name (e.g., "IncoLightning")
    /// @param majorVersionNumber The major version number
    /// @param deployer The address that will deploy the contract
    /// @param pepper Additional entropy to avoid address collisions
    /// @return The 32-byte salt for CreateX deployment
    function getSalt(string memory name, uint8 majorVersionNumber, address deployer, string memory pepper)
        internal
        pure
        returns (bytes32)
    {
        return bytes32(
            abi.encodePacked(
                deployer,
                CROSS_CHAIN_DEPLOY_AUTHORIZED_FLAG,
                bytes11(keccak256(abi.encodePacked(name, majorVersionNumber, pepper)))
            )
        );
    }

    /// @notice Derives a salt for an implementation from its proxy salt + minor + patch version.
    /// @dev Each minor/patch version gets a distinct implementation address, preventing
    ///      collision when upgrading (CREATE3 reverts if target address already has code).
    ///      The deployer address and cross-chain flag are preserved from the proxy salt.
    function getImplSalt(bytes32 proxySalt, uint8 minor, uint8 patch) internal pure returns (bytes32) {
        address deployer = address(bytes20(proxySalt));
        bytes1 crossChainFlag = proxySalt[20];
        return bytes32(
            abi.encodePacked(
                deployer, crossChainFlag, bytes11(keccak256(abi.encodePacked(proxySalt, "impl", minor, patch)))
            )
        );
    }

}
