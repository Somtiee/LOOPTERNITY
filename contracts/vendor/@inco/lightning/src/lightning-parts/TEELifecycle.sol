// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {BootstrapResult, UpgradeResult, AddNodeResult} from "./TEELifecycle.types.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IQuoteVerifier} from "../interfaces/automata-interfaces/IQuoteVerifier.sol";
import {BELE} from "../interfaces/automata-interfaces/BELE.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ITEELifecycle} from "./interfaces/ITEELifecycle.sol";
import {
    TcbInfoJsonObj,
    EnclaveIdentityJsonObj,
    IdentityObj,
    Td10ReportBody,
    Header,
    HEADER_LENGTH
} from "../interfaces/automata-interfaces/Types.sol";
import {IFmspcTcbDao} from "../interfaces/automata-interfaces/IFmspcTcbDao.sol";
import {IAutomataEnclaveIdentityDao} from "../interfaces/automata-interfaces/IAutomataEnclaveIdentityDao.sol";
import {SignatureVerifier} from "./primitives/SignatureVerifier.sol";

contract TEELifecycleStorage {

    struct StorageForTeeLifecycle {
        IQuoteVerifier quoteVerifier;
        // @notice The list of approved TEE versions, each item is the MR_AGGREGATED 32 bytes
        // @dev The index of the TEE version is the version number
        bytes32[] approvedTeeVersions;
        // @notice The Network key
        bytes networkPubkey;
    }

    bytes32 private constant TEE_LIFECYCLE_STORAGE_LOCATION = keccak256("inco.storage.TEELifecycle");

    function getTeeLifecycleStorage() internal pure returns (StorageForTeeLifecycle storage $) {
        bytes32 loc = TEE_LIFECYCLE_STORAGE_LOCATION;
        assembly {
            $.slot := loc
        }
    }

}

abstract contract TEELifecycle is
    TEELifecycleStorage,
    ITEELifecycle,
    OwnableUpgradeable,
    SignatureVerifier,
    EIP712Upgradeable
{

    // Errors
    error InvalidQuoteVerifierVersion(uint16 actual, uint16 expected);
    error EmptyTcbInfo();
    error EmptyIdentity();
    error BootstrapNotComplete();
    error BootstrapAlreadyCompleted();
    /// @notice The TEE version was not found in the TEEVersionHistory
    error TEEVersionNotFound();
    error InvalidReportMrAggregated();
    error InvalidReportDataSigner();
    error IndexOutOfBounds();
    /// @notice The EIP712 signature recovered an incorrect address
    error InvalidEIP712Signature();
    // @notice The network pubkey signed by the TDX EOA is not the same as the one in the bootstrap result
    error InvalidNetworkPubkey();

    // Events
    // @notice A new MR_AGGREGATED has been approved
    event NewTEEVersionApproved(uint256 indexed version, bytes32 indexed mrAggregated);
    event NewCovalidatorAdded(address covalidatorAddress, bytes quote);
    event BootstrapStageComplete(address indexed newEoaSigner, BootstrapResult bootstrapResult);
    // @notice Emitted to prove that an EOA has upgraded their TDX to a new
    // MR_AGGREGATED. This is done by checking remote attestation of the quote
    // and verifying the EIP712 signature of the bootstrap/upgrade result by
    // the TDX EOA.
    event SignerHasUpdatedTDX(address indexed eoaSigner, bytes32 indexed mrAggregated);

    // Constants
    bytes32 public constant BOOTSTRAP_RESULT_STRUCT_HASH = keccak256(bytes("BootstrapResult(bytes networkPubkey)"));
    bytes32 public constant UPGRADE_RESULT_STRUCT_HASH = keccak256(bytes("UpgradeResult(bytes networkPubkey)"));
    bytes32 public constant ADD_NODE_RESULT_STRUCT_HASH = keccak256(bytes("AddNodeResult(bytes networkPubkey)"));

    uint16 public constant QUOTE_VERIFIER_VERSION = 4;

    // forge-lint: disable-next-line(mixed-case-function)
    function __TeeLifecycle_init(IQuoteVerifier _quoteVerifier) internal onlyInitializing {
        getTeeLifecycleStorage().quoteVerifier = _quoteVerifier;
        uint16 actualQuoteVerifierVersion = _quoteVerifier.quoteVersion();
        require(
            actualQuoteVerifierVersion == QUOTE_VERIFIER_VERSION,
            InvalidQuoteVerifierVersion(actualQuoteVerifierVersion, QUOTE_VERIFIER_VERSION)
        );
    }

    /**
     * @notice Uploads the collateral to the contract
     * @param tcbInfo - The TCB info to upload
     * @param identity - The identity to upload
     */
    function uploadCollateral(TcbInfoJsonObj memory tcbInfo, EnclaveIdentityJsonObj memory identity) public onlyOwner {
        require(bytes(tcbInfo.tcbInfoStr).length != 0, EmptyTcbInfo());
        require(bytes(identity.identityStr).length != 0, EmptyIdentity());

        IQuoteVerifier _quoteVerifier = quoteVerifier();

        IFmspcTcbDao fmspcTcbDao = IFmspcTcbDao(_quoteVerifier.pccsRouter().fmspcTcbDaoAddr());
        fmspcTcbDao.upsertFmspcTcb(tcbInfo);
        IAutomataEnclaveIdentityDao enclaveIdDao =
            IAutomataEnclaveIdentityDao(_quoteVerifier.pccsRouter().qeIdDaoAddr());
        (IdentityObj memory identityObj,) = enclaveIdDao.EnclaveIdentityLib().parseIdentityString(identity.identityStr);
        enclaveIdDao.upsertEnclaveIdentity(uint256(identityObj.id), 4, identity);
    }

    /**
     * @notice Wrapper around activateNewTEEVersion which verifies the bootstrap result and marks the new TEE version as active
     * @param bootstrapResult - The bootstrap data to verify
     * @param quote - The quote to verify against
     * @param signature - The EIP712 signature of the bootstrap result by the TDX EOA
     */
    function verifyBootstrapResult(
        BootstrapResult calldata bootstrapResult,
        bytes calldata quote,
        bytes calldata signature
    ) public onlyOwner {
        StorageForTeeLifecycle storage $ = getTeeLifecycleStorage();

        // Make sure the bootstrap is not already complete, and that the contract owner
        // has already submitted the pending TEE MR_AGGREGATED.
        require(!isBootstrapComplete(), BootstrapAlreadyCompleted());
        require($.approvedTeeVersions.length == 1, TEEVersionNotFound());

        bytes32 digest = bootstrapResultDigest(bootstrapResult);
        address reportDataSigner = _verifyResultForEoa($.approvedTeeVersions[0], digest, quote, signature);

        // For bootstrap phase, we only have one EOA signer
        // So if we arrive here in code, it means that the EOA has signed the bootstrap result

        // Update contract publicly viewable state
        addSigner(reportDataSigner);
        $.networkPubkey = bootstrapResult.networkPubkey;

        emit BootstrapStageComplete(reportDataSigner, bootstrapResult);
    }

    /**
     * @notice Verifies the upgrade result for a single EOA. This function does not modify any contract state.
     * It simply serves as an on-chain proof that each TDX has been updated to the newest MR_AGGREGATED.
     * @param upgradeResult - The upgrade data to verify
     * @param quote - The quote to verify against (contains the TDX EOA)
     * @param signature - The EIP712 signature of the upgrade result by the TDX EOA
     */
    function verifyUpgradeResult(
        bytes32 newMrAggregated,
        UpgradeResult calldata upgradeResult,
        bytes calldata quote,
        bytes calldata signature
    ) public onlyOwner {
        StorageForTeeLifecycle storage $ = getTeeLifecycleStorage();

        require(isBootstrapComplete(), BootstrapNotComplete());
        // Make sure the quote's network pubkey is the same as the one in the bootstrap result
        require(keccak256($.networkPubkey) == keccak256(upgradeResult.networkPubkey), InvalidNetworkPubkey());
        // Make sure the new MR_AGGREGATED has been pre-approved.
        bool isApproved = _isApprovedTeeVersion(newMrAggregated);
        require(isApproved, TEEVersionNotFound());

        bytes32 digest = upgradeResultDigest(upgradeResult);
        address reportDataSigner = _verifyResultForEoa(newMrAggregated, digest, quote, signature);
        // Make sure the new EOA signer is an existing EOA signer
        require(isSigner(reportDataSigner), SignerNotFound(reportDataSigner));
    }

    /**
     * @notice Verifies the add node result, and adds the new EOA signer to the contract state.
     * @param quote - The quote from the new covalidator that contains the current MR_AGGREGATED and the eoa address of the new party in the report data
     */
    function verifyAddNodeResult(
        bytes32 newMrAggregated,
        AddNodeResult calldata addNodeResult,
        bytes calldata quote,
        bytes calldata signature
    ) public onlyOwner {
        StorageForTeeLifecycle storage $ = getTeeLifecycleStorage();

        require(isBootstrapComplete(), BootstrapNotComplete());
        // Make sure the quote's network pubkey is the same as the one in the bootstrap result
        require(keccak256($.networkPubkey) == keccak256(addNodeResult.networkPubkey), InvalidNetworkPubkey());
        // Make sure the new MR_AGGREGATED has been pre-approved.
        bool isApproved = _isApprovedTeeVersion(newMrAggregated);
        require(isApproved, TEEVersionNotFound());

        bytes32 digest = addNodeResultDigest(addNodeResult);
        address reportDataSigner = _verifyResultForEoa(newMrAggregated, digest, quote, signature);

        // Add this new EOA signer as a new signer to the contract state
        addSigner(reportDataSigner);
    }

    /**
     * @notice Approves a new TEE version as PENDING and updates the TEEVersionHistory.
     * The new TEE version can be activated by calling verifyBootstrapResult or activateNewTEEVersion.
     * @param newMrAggregated - The MR_AGGREGATED bytes of the new TEE version
     * @dev This function increments the version number automatically based on the current history
     */
    function approveNewTeeVersion(bytes32 newMrAggregated) public onlyOwner {
        StorageForTeeLifecycle storage $ = getTeeLifecycleStorage();
        $.approvedTeeVersions.push(newMrAggregated);
        emit NewTEEVersionApproved($.approvedTeeVersions.length - 1, newMrAggregated);
    }

    function _isApprovedTeeVersion(bytes32 newMrAggregated) internal view returns (bool) {
        StorageForTeeLifecycle storage $ = getTeeLifecycleStorage();
        for (uint256 i = 0; i < $.approvedTeeVersions.length; i++) {
            if ($.approvedTeeVersions[i] == newMrAggregated) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Verifies quote and signature from TDX for a single EOA. This is a shared function for bootstrap and upgrade.
     * @param newMrAggregated - The MR_AGGREGATED bytes of the new TEE version
     * @param resultEip712Digest - The EIP712 digest of the result to verify
     * @param quote - The quote to verify against (contains the TDX EOA)
     * @param signature - The EIP712 signature of the digest by the TDX EOA
     * @return reportDataSigner - The address of the report data signer (i.e. the TDX EOA)
     */
    function _verifyResultForEoa(
        bytes32 newMrAggregated,
        bytes32 resultEip712Digest,
        bytes calldata quote,
        bytes calldata signature
    ) internal onlyOwner returns (address) {
        (bool success, bytes memory output) = _verifyAndAttestOnChain(quote);
        require(success, string(output));

        Td10ReportBody memory tdReport = parseTd10ReportBody(quote);
        (address reportDataSigner, bytes32 reportMrAggregated) = parseReport(tdReport);
        require(reportMrAggregated == newMrAggregated, InvalidReportMrAggregated());
        address recoveredAddress = ECDSA.recover(resultEip712Digest, signature);
        require(recoveredAddress == reportDataSigner, InvalidEIP712Signature());

        emit SignerHasUpdatedTDX(reportDataSigner, newMrAggregated);

        return reportDataSigner;
    }

    /**
     * @notice Checks if the bootstrap is complete.
     * @return true if the bootstrap is complete, false otherwise
     */
    function isBootstrapComplete() public view returns (bool) {
        // The network pubkey is set once and once only, during the bootstrap process
        // So we can use the length of the network pubkey to check if the bootstrap is complete
        return getTeeLifecycleStorage().networkPubkey.length > 0;
    }

    /**
     * @notice Resets the contract state to the initial state.
     * @dev This function performs a destructive operation and should be used carefully. In particular:
     * 1) This function will remove all signers and reset the network pubkey and approved TEE versions, requiring a full bootstrap to restore normal operation.
     * 2) The contract effectively enters a maintenance mode where any operations that depend on signers or the network key will fail until re-bootstrap is completed.
     * 3) This function is intended to be called only as part of a coordinated key rotation or recovery process, with off-chain components updated accordingly.
     * @dev This function is only callable by the owner.
     */
    function reset() public onlyOwner {
        getTeeLifecycleStorage().networkPubkey = bytes("");
        getTeeLifecycleStorage().approvedTeeVersions = new bytes32[](0);

        // Directly access SignatureVerifier storage to reset signers and threshold
        // We bypass the normal functions because:
        // 1. removeSigner is external and has threshold validation
        // 2. setThreshold requires newThreshold > 0
        // We emit RemovedSignatureVerifier and ThresholdChanged so off-chain
        // systems tracking signer changes via events stay in sync.
        StorageForSigVerifier storage sigStorage = getSigVerifierStorage();
        uint256 oldThreshold = sigStorage.threshold;
        if (oldThreshold > 0) {
            emit ThresholdChanged(oldThreshold, 0);
        }
        sigStorage.threshold = 0;
        // In theory, this could revert if there are many signers. But in
        // practice, this should not be a problem.
        while (sigStorage.signers.length > 0) {
            address signer = sigStorage.signers[sigStorage.signers.length - 1];
            sigStorage.isSigner[signer] = false;
            sigStorage.signers.pop();
            emit RemovedSignatureVerifier(signer);
        }
    }

    /**
     * @notice From https://github.com/automata-network/automata-dcap-attestation/blob/evm-v1.0.0/evm/contracts/AttestationEntrypointBase.sol#L103
     * @notice full on-chain verification for an attestation
     * @param rawQuote - Intel DCAP Quote serialized in raw bytes
     * @return success - whether the quote has been successfully verified or not
     * @return output - the output upon completion of verification. The output data may require post-processing by the consumer.
     * For verification failures, the output is simply a UTF-8 encoded string, describing the reason for failure.
     * @dev can directly type-cast the failed output as a string
     */
    function _verifyAndAttestOnChain(bytes calldata rawQuote)
        internal
        view
        returns (bool success, bytes memory output)
    {
        // Parse the header
        Header memory header;
        (success, header) = _parseQuoteHeader(rawQuote);
        if (!success) {
            return (false, bytes("Could not parse quote header")); // todo #949 switch the two returned strings for bytes4 identifiers
        }

        if (QUOTE_VERIFIER_VERSION != header.version) {
            return (false, bytes("Unsupported quote version"));
        }

        // We found a supported version, begin verifying the quote
        // Note: The quote header cannot be trusted yet, it will be validated by the Verifier library
        (success, output) = getTeeLifecycleStorage().quoteVerifier.verifyQuote(header, rawQuote);
    }

    /**
     * @notice From https://github.com/automata-network/automata-dcap-attestation/blob/evm-v1.0.0/evm/contracts/AttestationEntrypointBase.sol#L168
     * @notice Parses the header to get basic information about the quote, such as the version, TEE types etc.
     */
    function _parseQuoteHeader(bytes calldata rawQuote) private pure returns (bool success, Header memory header) {
        success = rawQuote.length >= HEADER_LENGTH;
        if (success) {
            uint16 version = uint16(BELE.leBytesToBeUint(rawQuote[0:2]));
            bytes4 teeType = bytes4(rawQuote[4:8]);
            bytes2 attestationKeyType = bytes2(rawQuote[2:4]);
            bytes2 qeSvn = bytes2(rawQuote[8:10]);
            bytes2 pceSvn = bytes2(rawQuote[10:12]);
            bytes16 qeVendorId = bytes16(rawQuote[12:28]);
            bytes20 userData = bytes20(rawQuote[28:48]);

            header = Header({
                version: version,
                attestationKeyType: attestationKeyType,
                teeType: teeType,
                qeSvn: qeSvn,
                pceSvn: pceSvn,
                qeVendorId: qeVendorId,
                userData: userData
            });
        }
    }

    /**
     * @notice From https://github.com/automata-network/automata-dcap-attestation/blob/evm-v1.0.0/evm/contracts/verifiers/V4QuoteVerifier.sol#L309
     * @notice Parses the TD10 report body from the raw quote
     * @param rawQuote - The raw quote bytes
     * @return report - The parsed TD10 report body
     */
    function parseTd10ReportBody(bytes calldata rawQuote) public pure returns (Td10ReportBody memory report) {
        report = Td10ReportBody({
            teeTcbSvn: bytes16(rawQuote[HEADER_LENGTH:HEADER_LENGTH + 16]),
            mrSeam: bytes(rawQuote[HEADER_LENGTH + 16:HEADER_LENGTH + 64]),
            mrsignerSeam: bytes(rawQuote[HEADER_LENGTH + 64:HEADER_LENGTH + 112]),
            seamAttributes: bytes8(uint64(BELE.leBytesToBeUint(rawQuote[HEADER_LENGTH + 112:HEADER_LENGTH + 120]))),
            tdAttributes: bytes8(uint64(BELE.leBytesToBeUint(rawQuote[HEADER_LENGTH + 120:HEADER_LENGTH + 128]))),
            xFAM: bytes8(uint64(BELE.leBytesToBeUint(rawQuote[HEADER_LENGTH + 128:HEADER_LENGTH + 136]))),
            mrTd: bytes(rawQuote[HEADER_LENGTH + 136:HEADER_LENGTH + 184]),
            mrConfigId: bytes(rawQuote[HEADER_LENGTH + 184:HEADER_LENGTH + 232]),
            mrOwner: bytes(rawQuote[HEADER_LENGTH + 232:HEADER_LENGTH + 280]),
            mrOwnerConfig: bytes(rawQuote[HEADER_LENGTH + 280:HEADER_LENGTH + 328]),
            rtMr0: bytes(rawQuote[HEADER_LENGTH + 328:HEADER_LENGTH + 376]),
            rtMr1: bytes(rawQuote[HEADER_LENGTH + 376:HEADER_LENGTH + 424]),
            rtMr2: bytes(rawQuote[HEADER_LENGTH + 424:HEADER_LENGTH + 472]),
            rtMr3: bytes(rawQuote[HEADER_LENGTH + 472:HEADER_LENGTH + 520]),
            reportData: bytes(rawQuote[HEADER_LENGTH + 520:HEADER_LENGTH + 584])
        });
    }

    /**
     * @notice Parses the TD10 report to extract the report data and MR_AGGREGATED
     * @param tdReport - The TD10 report body
     * @return reportDataSigner - The signing address of the report data signer
     * @return reportMrAggregated - The MR_AGGREGATED bytes from the report
     */
    function parseReport(Td10ReportBody memory tdReport) public pure returns (address, bytes32) {
        return (
            address(bytes20(tdReport.reportData)),
            computeMrAggregated(tdReport.mrTd, tdReport.rtMr0, tdReport.rtMr1, tdReport.rtMr2)
        );
    }

    /**
     * @notice Computes the MR_AGGREGATED from the TD10 report body. It is defined as:
     * as KECCAK256(abi.encode(MRTD, RTMR0, RTMR1, RTMR2))
     * @param mrTd - The MR_TD bytes
     * @param rtMr0 - The RTMR0 bytes
     * @param rtMr1 - The RTMR1 bytes
     * @param rtMr2 - The RTMR2 bytes
     * @return mrAggregated - The MR_AGGREGATED bytes32
     */
    function computeMrAggregated(bytes memory mrTd, bytes memory rtMr0, bytes memory rtMr1, bytes memory rtMr2)
        public
        pure
        returns (bytes32)
    {
        bytes memory message = abi.encode(mrTd, rtMr0, rtMr1, rtMr2);
        return keccak256(message);
    }

    function quoteVerifier() public view returns (IQuoteVerifier) {
        return getTeeLifecycleStorage().quoteVerifier;
    }

    function approvedTeeVersions(uint256 index) external view returns (bytes32) {
        StorageForTeeLifecycle storage $ = getTeeLifecycleStorage();
        require(index < $.approvedTeeVersions.length, IndexOutOfBounds());
        return $.approvedTeeVersions[index];
    }

    function networkPubkey() external view returns (bytes memory) {
        return getTeeLifecycleStorage().networkPubkey;
    }

    function bootstrapResultDigest(BootstrapResult memory bootstrapResult) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(abi.encode(BOOTSTRAP_RESULT_STRUCT_HASH, keccak256(bootstrapResult.networkPubkey)))
            );
    }

    function upgradeResultDigest(UpgradeResult memory upgradeResult) public view returns (bytes32) {
        return
            _hashTypedDataV4(keccak256(abi.encode(UPGRADE_RESULT_STRUCT_HASH, keccak256(upgradeResult.networkPubkey))));
    }

    function addNodeResultDigest(AddNodeResult memory addNodeResult) public view returns (bytes32) {
        return
            _hashTypedDataV4(keccak256(abi.encode(ADD_NODE_RESULT_STRUCT_HASH, keccak256(addNodeResult.networkPubkey))));
    }

}
