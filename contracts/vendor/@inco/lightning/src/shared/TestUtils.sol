// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {Test} from "forge-std/Test.sol";

/// @title TestUtils
/// @notice WARNING: This contract contains TEST KEYS for LOCAL DEVELOPMENT ONLY.
/// @dev These keys are publicly known Anvil accounts and have NO security value.
///      NEVER use these keys on production networks - anyone can derive the private keys.
contract TestUtils is Test {

    // WARNING: Well-known Anvil account #0 - publicly known private key, DO NOT use in production
    address private constant ANVIL_ZEROTH_ADDRESS = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    uint256 private constant ANVIL_ZEROTH_PRIVATE_KEY =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    uint256 internal alicePrivKey;
    address internal immutable alice;
    uint256 internal bobPrivKey;
    address internal immutable bob;
    uint256 internal carolPrivKey;
    address internal immutable carol;
    uint256 internal davePrivKey;
    address internal immutable dave;
    uint256 internal evePrivKey;
    address internal immutable eve;

    // WARNING: These are well-known Anvil test keys with publicly known private keys.
    // They are convenient for e2e tests but have NO security value.
    // Deploy.s.sol has safeguards to prevent using these on non-test chains.
    address internal teeEOA = ANVIL_ZEROTH_ADDRESS;
    uint256 internal teePrivKey = ANVIL_ZEROTH_PRIVATE_KEY;

    constructor() {
        (alicePrivKey, alice) = getLabeledKeyPair("alice");
        (bobPrivKey, bob) = getLabeledKeyPair("bob");
        (carolPrivKey, carol) = getLabeledKeyPair("carol");
        (davePrivKey, dave) = getLabeledKeyPair("dave");
        (evePrivKey, eve) = getLabeledKeyPair("eve");
        vm.label(teeEOA, "tee");
    }

    function getLabeledAddress(string memory input) internal returns (address hashGenerated) {
        hashGenerated = address(uint160(uint256(keccak256(abi.encodePacked(input)))));
        vm.label(hashGenerated, input);
    }

    function getLabeledKeyPair(string memory input) internal returns (uint256 privKey, address accountAddress) {
        privKey = uint256(keccak256(abi.encodePacked(input)));
        accountAddress = vm.addr(privKey);
        vm.label(accountAddress, input);
    }

    function getSignatureForDigest(bytes32 digest, uint256 privKey) internal pure returns (bytes memory signature) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, digest);
        signature = bytes.concat(r, s, bytes1(v));
    }

}
