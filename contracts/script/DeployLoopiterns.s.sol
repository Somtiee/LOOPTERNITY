// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {Loopiterns} from "../src/Loopiterns.sol";

/// @notice Deploy LOOPITERNS on Robinhood Chain (4663).
/// Env: PRIVATE_KEY, MINT_PRICE_WEI. Optional BASE_URI (defaults empty).
///
///   forge script script/DeployLoopiterns.s.sol:DeployLoopiterns \
///     --rpc-url robinhood --chain 4663 --broadcast --slow
contract DeployLoopiterns is Script {
    function run() external returns (Loopiterns nft) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 price = vm.envUint("MINT_PRICE_WEI");
        address owner_ = vm.addr(pk);
        string memory baseURI = "";

        vm.startBroadcast(pk);
        nft = new Loopiterns(price, baseURI, owner_);
        vm.stopBroadcast();
    }
}
