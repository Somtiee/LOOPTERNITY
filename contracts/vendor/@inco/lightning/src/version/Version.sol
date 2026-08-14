// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ShortStrings, ShortString} from "@openzeppelin/contracts/utils/ShortStrings.sol";
import {IVersion} from "./interfaces/IVersion.sol";

contract Version is IVersion {

    using ShortStrings for ShortString;
    using ShortStrings for string;

    uint8 internal immutable VERSION_MAJOR;
    uint8 internal immutable VERSION_MINOR;
    uint8 internal immutable VERSION_PATCH;
    bytes32 internal immutable SALT;
    ShortString internal immutable NAME;

    constructor(uint8 _majorVersion, uint8 _minorVersion, uint8 _patchVersion, bytes32 _salt, string memory _name) {
        VERSION_MAJOR = _majorVersion;
        VERSION_MINOR = _minorVersion;
        VERSION_PATCH = _patchVersion;
        SALT = _salt;
        NAME = _name.toShortString();
    }

    function getVersionedName() public view virtual returns (string memory) {
        uint256 shortSalt = uint256(SALT) % 10e8;
        return string(
            abi.encodePacked(
                getName(),
                "_",
                getVersion(),
                "__",
                // avoids name collision for deployments of the same version
                Strings.toString(shortSalt)
            )
        );
    }

    function getVersion() public view virtual returns (string memory) {
        return versionString(VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH);
    }

    function versionString(uint8 major, uint8 minor, uint8 patch) internal pure returns (string memory) {
        return
            string(
                abi.encodePacked(Strings.toString(major), "_", Strings.toString(minor), "_", Strings.toString(patch))
            );
    }

    function getName() public view virtual returns (string memory) {
        return NAME.toString();
    }

    function getMajorVersion() public view virtual returns (string memory) {
        return Strings.toString(VERSION_MAJOR);
    }

    function majorVersion() public view returns (uint8) {
        return VERSION_MAJOR;
    }

    function minorVersion() public view returns (uint8) {
        return VERSION_MINOR;
    }

    function patchVersion() public view returns (uint8) {
        return VERSION_PATCH;
    }

    function salt() public view returns (bytes32) {
        return SALT;
    }

}
