// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {euint256} from "@inco/lightning/src/Lib.sol";

/// @dev Foundry test base matching Inco Lightning cheatcode names.
abstract contract IncoTest is Test {
    address internal alice;
    address internal bob;
    address internal carol;

    function setUp() public virtual {
        alice = vm.addr(0xA11CE);
        bob = vm.addr(0xB0B);
        carol = vm.addr(0xCA201);
    }

    function processAllOperations() internal pure {}

    function fakePrepareEuint256Ciphertext(
        uint256 value,
        address account,
        address dapp
    ) internal pure returns (bytes memory) {
        return abi.encode(value, account, dapp);
    }

    function getUint256Value(euint256 handle) internal pure returns (uint256) {
        return uint256(euint256.unwrap(handle));
    }
}
