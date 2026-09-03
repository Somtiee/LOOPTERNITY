// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Loopiterns
 * @notice ERC-721 collection for LOOPTERNITY on Robinhood Chain (4663).
 *
 * v2: public mint() is gone. Client survival time is spoofable, so the
 * mint is now gated by an off-chain server voucher: `mintWithVoucher`
 * recovers the signer from a signature bound to (minter, rarity, deadline,
 * nonce, chainid, this contract). The server only signs when the run's
 * survival time meets the rarity gate (45/60/90/120/180s). On-chain this
 * contract still enforces: server signature, exact `mintPrice`, max 5 per
 * wallet, global 10_000 cap, and remaining supply per rarity (with
 * drop-down to a lower rarity than requested, never an upgrade).
 *
 * Rarity ids: 0 Common, 1 Uncommon, 2 Rare, 3 Epic, 4 Legendary.
 */
contract Loopiterns is ERC721Enumerable, Ownable, Pausable {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant MAX_PER_WALLET = 5;
    uint8 public constant RARITY_COUNT = 5;

    /// @notice Caps: Common 5000, Uncommon 2500, Rare 1500, Epic 800, Legendary 200.
    uint256[5] public rarityCap;
    uint256[5] public mintedByRarity;

    uint256 public mintPrice;
    string public baseURI;
    string public contractURI;

    /// @notice Voucher signer, settable by the owner (server key rotation).
    address public mintSigner;

    /// @notice One voucher per `nonce` — replays revert.
    mapping(uint256 nonce => bool) public nonceUsed;

    mapping(uint256 tokenId => uint8) public tokenRarity;
    mapping(uint256 tokenId => uint64) public mintedAt;
    /// @dev Vouchered server-side survival seconds. Not client-supplied.
    mapping(uint256 tokenId => uint256) public claimedSeconds;

    event Minted(address indexed to, uint256 indexed id, uint8 rarity, uint8 requested);
    event MintPriceUpdated(uint256 mintPrice);
    event BaseURIUpdated(string baseURI);
    event ContractURIUpdated(string contractURI);
    event Withdrawn(address indexed to, uint256 amount);
    event MintSignerUpdated(address indexed mintSigner);

    error InvalidRarity();
    error WrongPrice();
    error WalletCap();
    error SoldOut();
    error WithdrawFailed();
    error BadVoucher();
    error ExpiredVoucher();
    error UsedNonce();

    constructor(
        uint256 mintPrice_,
        string memory baseURI_,
        address owner_,
        address mintSigner_
    ) ERC721("LOOPITERNS", "LOOP") Ownable(owner_) {
        mintPrice = mintPrice_;
        baseURI = baseURI_;
        mintSigner = mintSigner_;
        rarityCap[0] = 5_000;
        rarityCap[1] = 2_500;
        rarityCap[2] = 1_500;
        rarityCap[3] = 800;
        rarityCap[4] = 200;
    }

    function remaining(uint8 rarity) public view returns (uint256) {
        if (rarity >= RARITY_COUNT) revert InvalidRarity();
        return rarityCap[rarity] - mintedByRarity[rarity];
    }

    function remainingAll() external view returns (uint256[5] memory out) {
        for (uint8 i; i < RARITY_COUNT; ++i) {
            out[i] = rarityCap[i] - mintedByRarity[i];
        }
    }

    function tokensOfOwner(address owner_) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(owner_);
        ids = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = tokenOfOwnerByIndex(owner_, i);
        }
    }

    /**
     * @notice Batched rarity lookup for inventories: one call instead of N
     *         `tokenRarity` reads. Reverts if any id was never minted.
     */
    function raritiesOf(uint256[] calldata ids) external view returns (uint8[] memory out) {
        uint256 n = ids.length;
        out = new uint8[](n);
        for (uint256 i; i < n; ++i) {
            _requireOwned(ids[i]); // reverts if the id was never minted
            out[i] = tokenRarity[ids[i]];
        }
    }

    /// @notice Domain separator fields for voucher signatures: bind every
    ///         voucher to this minter, rarity, deadline, nonce, chain, contract.
    bytes32 private constant VOUCHER_TYPEHASH =
        keccak256(
            "LoopiternsVoucher(address minter,uint8 rarity,uint256 deadline,uint256 nonce)"
        );
    bytes32 private constant DOMAIN_NAME = keccak256("Loopiterns");
    bytes32 private constant DOMAIN_VERSION = keccak256("2");

    function _domainSeparator() internal view returns (bytes32) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                DOMAIN_NAME,
                DOMAIN_VERSION,
                chainId,
                address(this)
            )
        );
    }

    /**
     * @notice Pay `mintPrice` for one LOOPITERN using a server voucher.
     *         The signature must be from `mintSigner` over
     *         EIP-712 (minter = msg.sender, rarity, deadline, nonce) on this
     *         chain and this contract. The voucher dies with the deadline and
     *         its nonce is single-use.
     */
    function mintWithVoucher(
        uint8 rarity,
        uint256 deadline,
        uint256 nonce,
        bytes calldata signature
    ) external payable whenNotPaused returns (uint256) {
        if (rarity >= RARITY_COUNT) revert InvalidRarity();
        if (block.timestamp > deadline) revert ExpiredVoucher();
        if (nonceUsed[nonce]) revert UsedNonce();
        if (nonce == 0 || signature.length != 65) revert BadVoucher();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _domainSeparator(),
                keccak256(abi.encode(VOUCHER_TYPEHASH, msg.sender, rarity, deadline, nonce))
            )
        );
        // ecrecover returns 0 on malformed input — reject it and the zero address.
        address recovered = ecrecover(digest, _sigV(signature), _sigR(signature), _sigS(signature));
        if (recovered == address(0) || recovered != mintSigner) revert BadVoucher();

        nonceUsed[nonce] = true;
        return _mintTo(msg.sender, rarity, 0);
    }

    /// @dev Split a 65-byte calldata signature into v / r / s.
    function _sigV(bytes calldata sig) private pure returns (uint8) {
        return uint8(sig[64]);
    }
    function _sigR(bytes calldata sig) private pure returns (bytes32) {
        return bytes32(sig[0:32]);
    }
    function _sigS(bytes calldata sig) private pure returns (bytes32) {
        return bytes32(sig[32:64]);
    }

    function setMintSigner(address mintSigner_) external onlyOwner {
        mintSigner = mintSigner_;
        emit MintSignerUpdated(mintSigner_);
    }

    function setMintPrice(uint256 mintPrice_) external onlyOwner {
        mintPrice = mintPrice_;
        emit MintPriceUpdated(mintPrice_);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        baseURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    function setContractURI(string calldata contractURI_) external onlyOwner {
        contractURI = contractURI_;
        emit ContractURIUpdated(contractURI_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Sweep the full ETH balance to `to` (treasury). Reverts on failed transfer.
    function withdraw(address payable to) external onlyOwner {
        uint256 amount = address(this).balance;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(to, amount);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(baseURI, tokenId.toString(), ".json");
    }

    function _mintTo(address to, uint8 requested, uint256 claimedSeconds_)
        internal
        returns (uint256 id)
    {
        if (requested >= RARITY_COUNT) revert InvalidRarity();
        if (msg.value != mintPrice) revert WrongPrice();
        if (balanceOf(to) >= MAX_PER_WALLET) revert WalletCap();
        if (totalSupply() >= MAX_SUPPLY) revert SoldOut();

        uint8 resolved = _resolveRarity(requested);
        id = totalSupply() + 1;

        unchecked {
            mintedByRarity[resolved] += 1;
        }
        tokenRarity[id] = resolved;
        mintedAt[id] = uint64(block.timestamp);
        claimedSeconds[id] = claimedSeconds_;

        _safeMint(to, id);
        emit Minted(to, id, resolved, requested);
    }

    /// @dev Walk requested … 0. Never returns a rarity above `requested`.
    function _resolveRarity(uint8 requested) internal view returns (uint8) {
        uint8 r = requested;
        for (uint256 i; i < RARITY_COUNT; ++i) {
            if (mintedByRarity[r] < rarityCap[r]) {
                return r;
            }
            if (r == 0) break;
            unchecked {
                r -= 1;
            }
        }
        revert SoldOut();
    }
}
