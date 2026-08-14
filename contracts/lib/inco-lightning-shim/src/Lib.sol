// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/**
 * Test / local shim of `@inco/lightning/src/Lib.sol`.
 * Production: remap `@inco/lightning/` to the official npm package.
 *
 * Client ciphertexts come from `@inco/lightning-js` (`handleTypes.euint256`).
 * Each `newEuint256` consumes `inco.getFee()` from `msg.value` (transient tally).
 */

type euint256 is bytes32;
type ebool is bytes32;

library inco {
    uint256 internal constant FEE = 0.0001 ether;

    function getFee() internal pure returns (uint256) {
        return FEE;
    }
}

library e {
    bytes32 private constant _FEE_TALLY = keccak256("loopternity.inco.fee.tally");

    function newEuint256(bytes memory ciphertext, address account) internal returns (euint256) {
        uint256 tally;
        bytes32 slot = _FEE_TALLY;
        assembly {
            tally := tload(slot)
        }
        tally += inco.getFee();
        require(msg.value >= tally, "Fee not paid");
        assembly {
            tstore(slot, tally)
        }

        if (ciphertext.length < 96) {
            return euint256.wrap(bytes32(0));
        }
        (uint256 value, address creator, address dapp) =
            abi.decode(ciphertext, (uint256, address, address));
        if (creator != account || dapp != address(this)) {
            return euint256.wrap(bytes32(0));
        }
        return euint256.wrap(bytes32(value));
    }

    function asEuint256(uint256 value) internal pure returns (euint256) {
        return euint256.wrap(bytes32(value));
    }

    function allow(euint256, address) internal pure {}

    function allowThis(euint256) internal view {}

    function mul(euint256 a, euint256 b) internal pure returns (euint256) {
        return euint256.wrap(
            bytes32(uint256(euint256.unwrap(a)) * uint256(euint256.unwrap(b)))
        );
    }

    function div(euint256 a, euint256 b) internal pure returns (euint256) {
        uint256 den = uint256(euint256.unwrap(b));
        if (den == 0) return euint256.wrap(bytes32(0));
        return euint256.wrap(bytes32(uint256(euint256.unwrap(a)) / den));
    }

    function gt(euint256 a, euint256 b) internal pure returns (ebool) {
        bool ok = uint256(euint256.unwrap(a)) > uint256(euint256.unwrap(b));
        return ebool.wrap(bytes32(uint256(ok ? 1 : 0)));
    }

    function select(ebool cond, euint256 ifTrue, euint256 ifFalse) internal pure returns (euint256) {
        return uint256(ebool.unwrap(cond)) == 0 ? ifFalse : ifTrue;
    }
}
