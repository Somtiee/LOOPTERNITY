// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {IncoLightning} from "./IncoLightning.sol";
import {Script} from "forge-std/Script.sol";
import {IIncoLightning} from "./interfaces/IIncoLightning.sol";
import {CreateX, CREATE_X_ADDRESS, CREATE_X_DEPLOYER} from "./pasted-dependencies/CreateX.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {
    CONTRACT_NAME,
    MAJOR_VERSION,
    MINOR_VERSION,
    PATCH_VERSION,
    VERIFIER_NAME
} from "./version/IncoLightningConfig.sol";
import {IncoVerifier} from "./IncoVerifier.sol";
import {IIncoVerifier} from "./interfaces/IIncoVerifier.sol";
import {console} from "forge-std/console.sol";
import {CreateXHelper} from "./CreateXHelper.sol";
import {IQuoteVerifier} from "./interfaces/automata-interfaces/IQuoteVerifier.sol";
import {Salt} from "./periphery/SaltLib.sol";

// GLOSSARY
// Pepper: a deployment-time string mixed into the salt hash function, used to avoid address collision on deploying
//      the same contract twice with the same deployer address, name and version
// Salt: a hash of the contract name, version, deployer address, and pepper.
//      in the context of deployment using create3 with createX, the salt determines the address of the contract, and
//      using the CROSS_CHAIN_DEPLOY_AUTHORIZED_FLAG, it prevents the contract from being deployed by someone other than
//      the deployer at the expected address

/// @title DeployUtils
/// @notice Deployment utilities for IncoLightning and IncoVerifier contracts
/// @dev Provides deterministic cross-chain deployment using CreateX (CREATE3 pattern).
///      This contract is meant to be inherited by deployment scripts and test helpers.
///
///      Deployment uses CREATE3 via CreateX to achieve:
///      - Deterministic addresses across all EVM chains
///      - Same address regardless of deployer nonce
///      - Address computed only from salt (derived from name, version, deployer, pepper)
///
///      Typical deployment sequence:
///      1. Compute salts from deployer address and pepper
///      2. Deploy IncoLightning implementation and proxy
///      3. Deploy IncoVerifier implementation and proxy
///      4. Both contracts reference each other via computed addresses
contract DeployUtils is Script {

    /// @notice Deploys CreateX contract for testing environments
    /// @dev CreateX is pre-deployed on most production chains. Use this only in test environments
    ///      where CreateX is not available. Pranks as the CreateX deployer to get expected address.
    /// @return createX The deployed CreateX instance at the canonical address
    function deployCreateX() public returns (CreateX createX) {
        vm.prank(CREATE_X_DEPLOYER);
        createX = new CreateX();
        require(CREATE_X_ADDRESS == address(createX));
        return createX;
    }

    /// @notice Computes the address a contract will be deployed to using CreateX
    /// @dev Uses CREATE3 address derivation. The address is deterministic based only on salt.
    /// @param salt The salt value that will be passed to CreateX
    /// @return The address where the contract will be deployed
    function computeAddressFromSalt(bytes32 salt) public returns (address) {
        CreateXHelper createX = new CreateXHelper();
        return createX.computeCreate3DeployAddress({salt: salt});
    }

    /// @notice Full EOA-broadcast deployment of IncoLightning and IncoVerifier.
    /// @dev Computes salts from deployer and pepper, then deploys both contracts via CreateX.
    ///      Should be wrapped in prank (testing) or broadcast (production). For the Gnosis Safe
    ///      path, callers should invoke `SafeDeployUtils.proposeAll(...)` directly instead.
    /// @param deployer The deployer address used in salt for CreateX permissioned deploy protection
    /// @param owner The address that will own both deployed proxies (can be a multisig)
    /// @param pepper Entropy string to avoid address collision with previous deployments
    /// @param quoteVerifier The Automata quote verifier for TEE attestation validation
    /// @return lightningProxy The deployed IncoLightning proxy
    /// @return verifierProxy The deployed IncoVerifier proxy
    function deployIncoLightningUsingConfig(
        address deployer,
        address owner,
        string memory pepper,
        IQuoteVerifier quoteVerifier
    ) internal returns (IIncoLightning lightningProxy, IIncoVerifier verifierProxy) {
        (bytes32 lightningSalt, bytes32 verifierSalt) = getIncoSalts(deployer, pepper);
        lightningProxy = deployLightning(lightningSalt, verifierSalt, owner);
        verifierProxy = deployVerifier(verifierSalt, lightningProxy, owner, quoteVerifier);

        console.log(
            "Deploying Inco with executor: %s, owner: %s, lightning salt: %s",
            vm.toString(address(lightningProxy)),
            vm.toString(owner),
            vm.toString(lightningSalt)
        );
    }

    /// @notice Computes the standard salts for IncoLightning and IncoVerifier
    /// @dev Uses the contract names and major version from IncoLightningConfig
    /// @param deployer The deployer address mixed into the salt for CreateX permissioned deploy protection
    /// @param pepper The pepper string for salt generation
    /// @return lightningSalt Salt for IncoLightning deployment
    /// @return verifierSalt Salt for IncoVerifier deployment
    function getIncoSalts(address deployer, string memory pepper)
        internal
        pure
        returns (bytes32 lightningSalt, bytes32 verifierSalt)
    {
        lightningSalt = Salt.getSalt(CONTRACT_NAME, MAJOR_VERSION, deployer, pepper);
        verifierSalt = Salt.getSalt(VERIFIER_NAME, MAJOR_VERSION, deployer, pepper);
    }

    /// @notice Deploys the IncoLightning contract with proxy
    /// @dev Creates both implementation and proxy contracts. The verifier address is
    ///      computed from salt since it may not be deployed yet.
    /// @param lightningSalt The salt for CreateX deployment
    /// @param verifierSalt The salt used to compute the verifier address
    /// @param owner The address that will own the proxy
    /// @return lightningProxy The deployed proxy cast to IIncoLightning
    function deployLightning(bytes32 lightningSalt, bytes32 verifierSalt, address owner)
        internal
        returns (IIncoLightning lightningProxy)
    {
        address verifierAddress = computeAddressFromSalt(verifierSalt);
        bytes32 implSalt = Salt.getImplSalt(lightningSalt, MINOR_VERSION, PATCH_VERSION);
        address lightningImplem = CreateX(CREATE_X_ADDRESS)
            .deployCreate3(
                implSalt,
                abi.encodePacked(
                    type(IncoLightning).creationCode, abi.encode(lightningSalt, IIncoVerifier(verifierAddress))
                )
            );
        lightningProxy = IIncoLightning(
            deployProxy({
                salt: lightningSalt,
                implem: lightningImplem,
                initCall: abi.encodeWithSelector(IIncoLightning.initialize.selector, owner)
            })
        );
    }

    /// @notice Deploys the IncoVerifier contract with proxy
    /// @dev Creates both implementation and proxy. Lightning must already be deployed
    ///      so it can be referenced in the verifier.
    /// @param verifierSalt The salt for CreateX deployment
    /// @param lightning The previously deployed IncoLightning proxy
    /// @param owner The address that will own the proxy
    /// @param quoteVerifier The Automata quote verifier for TEE attestation
    /// @return verifierProxy The deployed proxy cast to IIncoVerifier
    function deployVerifier(bytes32 verifierSalt, IIncoLightning lightning, address owner, IQuoteVerifier quoteVerifier)
        internal
        returns (IIncoVerifier verifierProxy)
    {
        bytes32 implSalt = Salt.getImplSalt(verifierSalt, MINOR_VERSION, PATCH_VERSION);
        address verifierImplem = CreateX(CREATE_X_ADDRESS)
            .deployCreate3(implSalt, abi.encodePacked(type(IncoVerifier).creationCode, abi.encode(address(lightning))));
        verifierProxy = IIncoVerifier(
            deployProxy({
                salt: verifierSalt,
                implem: verifierImplem,
                initCall: abi.encodeWithSelector(
                    IIncoVerifier.initialize.selector, owner, VERIFIER_NAME, lightning.getMajorVersion(), quoteVerifier
                )
            })
        );
    }

    /// @notice Deploys an ERC1967 proxy using CreateX (CREATE3 pattern)
    /// @dev The proxy is initialized with the provided init call during deployment.
    ///      Uses CREATE3 for deterministic addressing.
    /// @param salt The salt for CreateX deployment
    /// @param implem The implementation contract address
    /// @param initCall ABI-encoded initializer call (selector + arguments)
    /// @return proxy The deployed proxy address
    function deployProxy(bytes32 salt, address implem, bytes memory initCall) internal returns (address proxy) {
        CreateX createX = CreateX(CREATE_X_ADDRESS);
        bytes memory bytecode = abi.encodePacked(type(ERC1967Proxy).creationCode, abi.encode(implem, initCall));
        proxy = createX.deployCreate3(salt, bytecode);
    }

}
