// SPDX-License-Identifier: No License
pragma solidity ^0.8;

import {IPCCSRouter} from "./IPCCSRouter.sol";

/// @dev we declare this interface because the one exported from the automata-dcap-attestation package is missing some
///      external functions.
interface IPCCSRouterExtended is IPCCSRouter {

    function setAuthorized(address caller, bool authorized) external;

    function transferOwnership(address newOwner) external;

}
