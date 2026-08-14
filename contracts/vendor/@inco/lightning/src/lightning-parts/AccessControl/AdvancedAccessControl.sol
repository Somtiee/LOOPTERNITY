// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

import {
    AllowanceVoucher,
    AllowanceProof,
    REQUIRED_ALLOWANCE_VOUCHER_WARNING_HASH
} from "./AdvancedAccessControl.types.sol";
import {ALLOWANCE_GRANTED_MAGIC_VALUE} from "../../Types.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {IAdvancedAccessControl, IVoucherEip712Checker} from "./interfaces/IAdvancedAccessControl.sol";
import {SharerNotAllowedForHandle} from "../../Types.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IBaseAccessControlList} from "./interfaces/IBaseAccessControlList.sol";
import {LightningAddressGetter} from "../primitives/LightningAddressGetter.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title AdvancedAccessControlStorage
/// @notice Diamond storage pattern for advanced ACL session nonce tracking
/// @dev Stores per-account session nonces that allow users to invalidate all previously signed vouchers
abstract contract AdvancedAccessControlStorage {

    /// @notice Storage struct for advanced access control state
    struct AacStorage {
        /// @notice Maps account addresses to their active voucher session nonce
        /// @dev Vouchers signed with a different nonce are invalid. Initial nonce is bytes32(0).
        mapping(address => bytes32) activeVouchersSessionNonce;
    }

    /// @notice Storage slot location using keccak256 of a unique namespace string
    bytes32 private constant AAC_STORAGE_LOCATION = keccak256("inco.storage.AdvancedAccessControl");

    /// @notice Retrieves the storage struct from its dedicated slot
    /// @dev Uses assembly to directly access the storage slot for gas efficiency
    /// @return $ Reference to the AacStorage struct
    function getAacStorage() internal pure returns (AacStorage storage $) {
        bytes32 loc = AAC_STORAGE_LOCATION;
        assembly {
            $.slot := loc
        }
    }

}

/// @title VoucherEip712Checker
/// @notice EIP-712 typed data signing utilities for allowance vouchers
/// @dev Provides deterministic hashing of AllowanceVoucher structs for signature verification.
///      The voucher structure allows sharers to delegate access to their encrypted data
///      with flexible verification logic defined by an external contract.
abstract contract VoucherEip712Checker is IVoucherEip712Checker, EIP712Upgradeable {

    /// @notice EIP-712 type hash for the AllowanceVoucher struct
    /// @dev Computed once at compile time for gas efficiency
    bytes32 constant ALLOWANCE_VOUCHER_STRUCT_HASH = keccak256(
        "AllowanceVoucher(string warning,bytes32 sessionNonce,address verifyingContract,bytes4 callFunction,bytes sharerArgData)"
    );

    /// @notice Computes the EIP-712 digest for an allowance voucher
    /// @dev The digest can be signed by the sharer to authorize access.
    ///      Uses EIP-712 structured data hashing with domain separator.
    /// @param voucher The voucher to compute the digest for
    /// @return The EIP-712 typed data hash ready for signing
    function allowanceVoucherDigest(AllowanceVoucher memory voucher) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ALLOWANCE_VOUCHER_STRUCT_HASH,
                    keccak256(bytes(voucher.warning)),
                    voucher.sessionNonce,
                    voucher.verifyingContract,
                    voucher.callFunction,
                    keccak256(voucher.sharerArgData)
                )
            )
        );
    }

}

/// @title AdvancedAccessControl
/// @notice Voucher-based access delegation for encrypted data sharing
/// @dev Enables flexible access control patterns where data owners can sign vouchers
///      authorizing others to access their encrypted data under specific conditions.
///
///      Voucher flow:
///      1. Sharer signs an AllowanceVoucher specifying conditions (via verifyingContract)
///      2. Requester presents the voucher with proof when requesting access
///      3. This contract verifies the signature and calls the verifyingContract
///      4. Access is granted if the verifyingContract returns ALLOWANCE_GRANTED_MAGIC_VALUE
///
///      Security features:
///      - Session nonces allow sharers to invalidate all previous vouchers
///      - EIP-712 typed data ensures vouchers are human-readable when signing
///      - Supports both EOA and smart contract signatures (ERC-1271)
/// @dev `OwnableUpgradeable` is only here to align Context ordering with DecryptionAttester
///      for IncoVerifier's C3 linearization.
abstract contract AdvancedAccessControl is
    IAdvancedAccessControl,
    AdvancedAccessControlStorage,
    OwnableUpgradeable,
    VoucherEip712Checker,
    LightningAddressGetter,
    PausableUpgradeable
{

    using SignatureChecker for address;

    /// @notice Thrown when a voucher's warning field does not match the required warning text
    error InvalidVoucherWarning();

    /// @notice Thrown when a voucher signature is invalid for the claimed signer
    /// @param signer The address that allegedly signed the voucher
    /// @param digest The EIP-712 digest that should have been signed
    /// @param signature The invalid signature provided
    error InvalidVoucherSignature(address signer, bytes32 digest, bytes signature);

    /// @notice Thrown when a voucher's session nonce doesn't match the sharer's active nonce
    /// @param providedSessionNonce The nonce in the voucher
    /// @param activeSessionNonce The sharer's current active session nonce
    error InvalidVoucherSessionNonce(bytes32 providedSessionNonce, bytes32 activeSessionNonce);

    /// @notice Thrown when a voucher's verifyingContract address is the zero address
    error InvalidVerifyingContract();

    /// @notice Checks if an account is allowed to access a handle using a signed voucher proof
    /// @dev Intended for simulation/off-chain calls. Not a view function as it calls external contracts.
    ///      Returns false unconditionally when this contract is paused, before any input validation.
    ///      Verification steps:
    ///      1. Verify the sharer has access to the handle
    ///      2. Verify the voucher signature is valid
    ///      3. Verify the session nonce is current
    ///      4. Call the verifyingContract to check access conditions
    /// @param handle The encrypted value handle to check access for
    /// @param account The account requesting access
    /// @param proof The allowance proof containing voucher, signature, and requester data
    /// @return True if access is allowed, false or reverts otherwise
    function isAllowedWithProof(bytes32 handle, address account, AllowanceProof memory proof)
        public
        virtual
        returns (bool)
    {
        if (paused()) {
            return false;
        }
        require(
            keccak256(bytes(proof.voucher.warning)) == REQUIRED_ALLOWANCE_VOUCHER_WARNING_HASH, InvalidVoucherWarning()
        );
        require(proof.voucher.verifyingContract != address(0), InvalidVerifyingContract());
        require(
            IBaseAccessControlList(incoLightningAddress).isAllowed(handle, proof.sharer),
            SharerNotAllowedForHandle(handle, proof.sharer)
        );
        bytes32 voucherDigest = allowanceVoucherDigest(proof.voucher);
        require(
            proof.sharer.isValidSignatureNow(voucherDigest, proof.voucherSignature),
            InvalidVoucherSignature(proof.sharer, voucherDigest, proof.voucherSignature)
        );
        bytes32 sharerActiveVouchersSessionNonce = getActiveVouchersSessionNonce(proof.sharer);
        require(
            proof.voucher.sessionNonce == sharerActiveVouchersSessionNonce,
            InvalidVoucherSessionNonce(proof.voucher.sessionNonce, sharerActiveVouchersSessionNonce)
        );
        (bool success, bytes memory result) = proof.voucher.verifyingContract
            .call(
                abi.encodeWithSelector(
                    proof.voucher.callFunction, handle, account, proof.voucher.sharerArgData, proof.requesterArgData
                )
            );
        return (success && result.length >= 32 && abi.decode(result, (bytes32)) == ALLOWANCE_GRANTED_MAGIC_VALUE);
    }

    /// @notice Returns the current active voucher session nonce for an account
    /// @dev Vouchers must include this nonce to be valid. Initial value is bytes32(0).
    /// @param account The account to check the session nonce for
    /// @return The current active session nonce
    function getActiveVouchersSessionNonce(address account) public view returns (bytes32) {
        return getAacStorage().activeVouchersSessionNonce[account];
    }

    /// @notice Invalidates all previously signed vouchers by updating the session nonce
    /// @dev Generates a new random nonce using the caller's address, block.prevrandao, block.number, block.timestamp, and an additional random value.
    ///      Any vouchers signed with the previous nonce become invalid immediately.
    ///      Call this if you suspect voucher compromise or want to revoke all delegations.
    /// @param salt An additional random value to ensure nonce uniqueness (e.g., from an off-chain source)
    function updateActiveVouchersSessionNonce(bytes32 salt) external {
        getAacStorage().activeVouchersSessionNonce[msg.sender] =
            keccak256(abi.encodePacked(msg.sender, block.prevrandao, block.number, block.timestamp, salt));
    }

}
