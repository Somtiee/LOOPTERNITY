// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {LoopternityVault} from "../src/LoopternityVault.sol";

/// @notice Broadcasts LoopternityVault. Load PRIVATE_KEY, ENTRY_FEE_WEI, TREASURY_ADDRESS from contracts/.env
///
/// Sepolia:
///   forge script script/DeployLoopternityVault.s.sol:DeployLoopternityVault --profile deploy --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --slow
///
/// Mainnet (after checklist):
///   forge script script/DeployLoopternityVault.s.sol:DeployLoopternityVault --profile deploy --rpc-url $BASE_MAINNET_RPC_URL --broadcast --slow
contract DeployLoopternityVault is Script {
    function run() external returns (LoopternityVault vault) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 fee = vm.envUint("ENTRY_FEE_WEI");
        address deployer = vm.addr(pk);
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        if (treasury == address(0)) treasury = deployer;

        vm.startBroadcast(pk);
        vault = new LoopternityVault(fee, treasury);
        vm.stopBroadcast();
    }
}
