// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {CA} from "./Types.sol";

interface IPcsDao {

    function upsertPcsCertificates(CA ca, bytes calldata cert) external returns (bytes32 attestationId);
    function upsertPckCrl(CA ca, bytes calldata crl) external returns (bytes32 attestationId);
    // forge-lint: disable-next-line(mixed-case-function)
    function upsertRootCACrl(bytes calldata rootcacrl) external returns (bytes32 attestationId);

}
