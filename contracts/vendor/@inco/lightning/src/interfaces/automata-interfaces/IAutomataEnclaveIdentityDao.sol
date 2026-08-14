// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import {EnclaveIdentityJsonObj, IdentityObj} from "./Types.sol";

// only the functions we need have been included here
interface IEnclaveIdentityHelper {

    function parseIdentityString(string calldata identityStr)
        external
        pure
        returns (IdentityObj memory identity, string memory identityTcbString);

}

// only the functions we need have been included here
interface IAutomataEnclaveIdentityDao {

    function upsertEnclaveIdentity(uint256 id, uint256 version, EnclaveIdentityJsonObj calldata enclaveIdentityObj)
        external
        returns (bytes32 attestationId);

    // forge-lint: disable-next-line(mixed-case-function)
    function EnclaveIdentityLib() external view returns (IEnclaveIdentityHelper);

}
