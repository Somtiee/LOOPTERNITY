// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Liquidbox Corp.
// Licensed under the Business Source License 1.1. See LICENSE.md.
// Terms of use: https://www.inco.org/terms-of-services
// Security contact team@inco.network
pragma solidity ^0.8;

// Required warning that must be present in every AllowanceVoucher.
// Must match SESSION_KEY_WARNING in js/src/advancedacl/session-key.ts.
string constant REQUIRED_ALLOWANCE_VOUCHER_WARNING =
    "Inco Warning: signing this message may leak your private data, including from unrelated apps. Sign only if you fully trust this app.";

// Precomputed hash of REQUIRED_ALLOWANCE_VOUCHER_WARNING for cheap runtime comparison.
// Evaluated at compile time — no storage slot used, no runtime keccak256 of the full string.
bytes32 constant REQUIRED_ALLOWANCE_VOUCHER_WARNING_HASH = keccak256(bytes(REQUIRED_ALLOWANCE_VOUCHER_WARNING));

// can be for arbitrary handles to arbitrary accounts
// signed by the account sharing its read access
struct AllowanceVoucher {
    // Human-readable warning displayed by wallets at signing time.
    // Must be first so wallets show it before the opaque byte fields below.
    string warning;
    bytes32 sessionNonce;
    address verifyingContract;
    bytes4 callFunction;
    bytes sharerArgData;
}

struct AllowanceProof {
    address sharer;
    AllowanceVoucher voucher;
    bytes voucherSignature;
    bytes requesterArgData;
}
