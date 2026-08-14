// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

interface Vm {
    function warp(uint256) external;
    function roll(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function deal(address, uint256) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function expectEmit(bool, bool, bool, bool) external;
    function addr(uint256 privateKey) external returns (address);
}

contract Test {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(bytes32 a, bytes32 b) internal pure {
        require(a == b, "assertEq(bytes32)");
    }

    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "assertEq(uint)");
    }

    function assertEq(address a, address b) internal pure {
        require(a == b, "assertEq(addr)");
    }

    function assertTrue(bool v) internal pure {
        require(v, "assertTrue");
    }

    function assertFalse(bool v) internal pure {
        require(!v, "assertFalse");
    }
}
