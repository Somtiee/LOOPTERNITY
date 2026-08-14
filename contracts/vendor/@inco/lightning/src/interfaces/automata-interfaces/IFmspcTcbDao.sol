// SPDX-License-Identifier: No License
pragma solidity ^0.8;

import {TcbInfoJsonObj} from "./Types.sol";

interface IFmspcTcbDao {

    function upsertFmspcTcb(TcbInfoJsonObj calldata tcbInfoObj) external returns (bytes32 attestationId);

}
