// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

// https://github.com/intel/SGXDataCenterAttestationPrimitives/blob/e7604e02331b3377f3766ed3653250e03af72d45/QuoteVerification/QVL/Src/AttestationLibrary/src/CertVerification/X509Constants.h#L64
uint256 constant TCB_CPUSVN_SIZE = 16;

enum TcbId {
    /// the "id" field is absent from TCBInfo V2
    /// which defaults TcbId to SGX
    /// since TDX TCBInfos are only included in V3 or above
    SGX,
    TDX
}

/**
 * @dev This is a simple representation of the TCBInfo.json in string as a Solidity object.
 * @param tcbInfo: tcbInfoJson.tcbInfo string object body
 * @param signature The signature to be passed as bytes array
 */
struct TcbInfoJsonObj {
    string tcbInfoStr;
    bytes signature;
}

/// @dev Solidity object representing TCBInfo.json excluding TCBLevels
struct TcbInfoBasic {
    /// the name "tcbType" can be confusing/misleading
    /// as the tcbType referred here in this struct is the type
    /// of TCB level composition that determines TCB level comparison logic
    /// It is not the same as the "type" parameter passed as an argument to the
    /// getTcbInfo() API method described in Section 4.2.3 of the Intel PCCS Design Document
    /// Instead, getTcbInfo() "type" argument should be checked against the "id" value of this struct
    /// which represents the TEE type for the given TCBInfo
    uint8 tcbType;
    TcbId id;
    uint32 version;
    uint64 issueDate;
    uint64 nextUpdate;
    uint32 evaluationDataNumber;
    bytes6 fmspc;
    bytes2 pceid;
}

struct TcbLevelsObj {
    uint16 pcesvn;
    uint8[] sgxComponentCpuSvns;
    uint8[] tdxComponentCpuSvns;
    uint64 tcbDateTimestamp;
    TCBStatus status;
    string[] advisoryIDs;
}

struct TdxModule {
    bytes mrsigner; // 48 bytes
    bytes8 attributes;
    bytes8 attributesMask;
}

struct TdxModuleIdentity {
    string id;
    bytes8 attributes;
    bytes8 attributesMask;
    bytes mrsigner; // 48 bytes
    TdxModuleTcbLevelsObj[] tcbLevels;
}

struct TdxModuleTcbLevelsObj {
    uint8 isvsvn;
    uint64 tcbDateTimestamp;
    TCBStatus status;
}

enum TCBStatus {
    OK,
    TCB_SW_HARDENING_NEEDED,
    TCB_CONFIGURATION_AND_SW_HARDENING_NEEDED,
    TCB_CONFIGURATION_NEEDED,
    TCB_OUT_OF_DATE,
    TCB_OUT_OF_DATE_CONFIGURATION_NEEDED,
    TCB_REVOKED,
    TCB_UNRECOGNIZED
}

enum CA {
    ROOT,
    PROCESSOR,
    PLATFORM,
    SIGNING
}

enum EnclaveId {
    QE,
    QVE,
    TD_QE
}

/**
 * @dev This is a simple representation of the Identity.json in string as a Solidity object.
 * @param identityStr Identity string object body. Needs to be parsed
 * and converted as IdentityObj.
 * @param signature The signature to be passed as bytes array
 */
struct EnclaveIdentityJsonObj {
    string identityStr;
    bytes signature;
}

/// @dev Full Solidity Object representation of Identity.json
struct IdentityObj {
    EnclaveId id;
    uint32 version;
    uint64 issueDateTimestamp; // UNIX Epoch Timestamp in seconds
    uint64 nextUpdateTimestamp; // UNIX Epoch Timestamp in seconds
    uint32 tcbEvaluationDataNumber;
    bytes4 miscselect;
    bytes4 miscselectMask;
    bytes16 attributes;
    bytes16 attributesMask;
    bytes32 mrsigner;
    uint16 isvprodid;
    Tcb[] tcb;
}

enum EnclaveIdTcbStatus {
    SGX_ENCLAVE_REPORT_ISVSVN_NOT_SUPPORTED,
    OK,
    SGX_ENCLAVE_REPORT_ISVSVN_REVOKED,
    SGX_ENCLAVE_REPORT_ISVSVN_OUT_OF_DATE
}

struct Tcb {
    uint16 isvsvn;
    uint256 dateTimestamp;
    EnclaveIdTcbStatus status;
}

/**
 * @notice The Quote Header struct definition
 * @dev https://github.com/intel/SGX-TDX-DCAP-QuoteVerificationLibrary/blob/16b7291a7a86e486fdfcf1dfb4be885c0cc00b4e/Src/AttestationLibrary/src/QuoteVerification/QuoteStructures.h#L42-L53
 * @dev Section A.3 of Intel V4 TDX DCAP API Library Documentation
 */
struct Header {
    uint16 version; // LE -> BE
    bytes2 attestationKeyType;
    bytes4 teeType;
    bytes2 qeSvn;
    bytes2 pceSvn;
    bytes16 qeVendorId;
    bytes20 userData;
}

/**
 * @notice V4 Intel TDX Quote uses this struct as the quote body
 * @dev Section A.3.2 of Intel V4 TDX DCAP API Library Documentation
 * @dev https://github.com/intel/SGX-TDX-DCAP-QuoteVerificationLibrary/blob/7e5b2a13ca5472de8d97dd7d7024c2ea5af9a6ba/Src/AttestationLibrary/src/QuoteVerification/QuoteStructures.h#L82-L103
 */
struct Td10ReportBody {
    bytes16 teeTcbSvn;
    bytes mrSeam; // 48 bytes
    bytes mrsignerSeam; // 48 bytes
    bytes8 seamAttributes;
    bytes8 tdAttributes;
    // forge-lint: disable-next-line(mixed-case-variable)
    bytes8 xFAM;
    bytes mrTd; // 48 bytes
    bytes mrConfigId; // 48 bytes
    bytes mrOwner; // 48 bytes
    bytes mrOwnerConfig; // 48 bytes
    bytes rtMr0; // 48 bytes
    bytes rtMr1; // 48 bytes
    bytes rtMr2; // 48 bytes
    bytes rtMr3; // 48 bytes
    bytes reportData; // 64 bytes
}

/// @dev https://github.com/intel/SGX-TDX-DCAP-QuoteVerificationLibrary/blob/16b7291a7a86e486fdfcf1dfb4be885c0cc00b4e/Src/AttestationLibrary/src/QuoteVerification/QuoteConstants.h
uint16 constant HEADER_LENGTH = 48;
// bytes2 constant SUPPORTED_ATTESTATION_KEY_TYPE = 0x0200; // ECDSA_256_WITH_P256_CURVE (LE)
// // TEE_TYPE are little-endian encoded, hence reversing the order of bytes
// bytes4 constant SGX_TEE = 0x00000000;
bytes4 constant TDX_TEE = 0x81000000;
// bytes16 constant VALID_QE_VENDOR_ID = 0x939a7233f79c4ca9940a0db3957f0607;
// uint16 constant ENCLAVE_REPORT_LENGTH = 384;
// uint16 constant TD_REPORT10_LENGTH = 584;

// Header (48 bytes) + Body (minimum 384 bytes) + AuthDataSize (4 bytes) + AuthData:
// ECDSA_SIGNATURE (64 bytes) + ECDSA_KEY (64 bytes) + QE_REPORT_BYTES (384 bytes)
// + QE_REPORT_SIGNATURE (64 bytes) + QE_AUTH_DATA_SIZE (2 bytes) + QE_CERT_DATA_TYPE (2 bytes)
// + QE_CERT_DATA_SIZE (4 bytes)
uint16 constant MINIMUM_QUOTE_LENGTH = 1020;

// // timestamp + tcb_info_hash + identity_hash + root_ca_hash + tcb_signing_hash + root_crl_hash + pck_crl_hash
// // 8 + 6 * 32 = 200
// uint16 constant VERIFIED_OUTPUT_COLLATERAL_HASHES_LENGTH = 200;
