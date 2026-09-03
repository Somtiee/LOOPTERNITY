// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {Loopiterns} from "../src/Loopiterns.sol";

/// @notice Deploy LOOPITERNS v2 (voucher mint) on Robinhood Chain (4663).
/// Env: PRIVATE_KEY, MINT_PRICE_WEI, MINT_SIGNER_ADDRESS. Optional BASE_URI
/// (defaults empty). MINT_SIGNER_ADDRESS is the public address of the
/// server's VOUCHER_SIGNER_PRIVATE_KEY — never a private key.
///
///   forge script script/DeployLoopiterns.s.sol:DeployLoopiterns \
///     --rpc-url robinhood --chain 4663 --broadcast --slow
contract DeployLoopiterns is Script {
    function run() external returns (Loopiterns nft) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 price = vm.envUint("MINT_PRICE_WEI");
        address mintSigner = vm.envAddress("MINT_SIGNER_ADDRESS");
        address owner_ = vm.addr(pk);
        string memory baseURI = "";

        vm.startBroadcast(pk);
        nft = new Loopiterns(price, baseURI, owner_, mintSigner);
        vm.stopBroadcast();
    }
}
