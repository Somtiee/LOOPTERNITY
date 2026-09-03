// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Loopiterns} from "../src/Loopiterns.sol";

/// @dev Contract with no receive/fallback: rejects plain ETH transfers.
contract NoReceiver {}

contract LoopiternsTest is Test {
    Loopiterns internal nft;
    address internal owner = address(0xA11CE);
    address internal alice = address(0xA11);
    uint256 internal constant PRICE = 0.01 ether;

    function setUp() public {
        nft = new Loopiterns(PRICE, "https://loopternity.example/m/", owner);
        vm.deal(alice, 100 ether);
    }

    function testRarityCapsSumToMaxSupply() public view {
        uint256 sum;
        for (uint8 i; i < 5; ++i) {
            sum += nft.rarityCap(i);
        }
        assertEq(sum, nft.MAX_SUPPLY());
        assertEq(sum, 10_000);
    }

    function testMintWrongPriceReverts() public {
        vm.prank(alice);
        vm.expectRevert(Loopiterns.WrongPrice.selector);
        nft.mint{value: PRICE - 1}(0);

        vm.prank(alice);
        vm.expectRevert(Loopiterns.WrongPrice.selector);
        nft.mint{value: PRICE + 1}(0);
    }

    function testMintCommonAndRemaining() public {
        vm.prank(alice);
        uint256 id = nft.mint{value: PRICE}(0);
        assertEq(id, 1);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.tokenRarity(1), 0);
        assertEq(nft.remaining(0), 4_999);
        assertEq(nft.mintedByRarity(0), 1);
        assertEq(
            keccak256(bytes(nft.tokenURI(1))),
            keccak256(bytes("https://loopternity.example/m/1.json"))
        );
    }

    function testClaimedSecondsStoredUntrusted() public {
        vm.prank(alice);
        nft.mint{value: PRICE}(4, 999_999);
        assertEq(nft.claimedSeconds(1), 999_999);
        assertEq(nft.tokenRarity(1), 4);
    }

    function testMaxFivePerWallet() public {
        vm.startPrank(alice);
        for (uint256 i; i < 5; ++i) {
            nft.mint{value: PRICE}(0);
        }
        vm.expectRevert(Loopiterns.WalletCap.selector);
        nft.mint{value: PRICE}(0);
        vm.stopPrank();
        assertEq(nft.balanceOf(alice), 5);
        uint256[] memory ids = nft.tokensOfOwner(alice);
        assertEq(ids.length, 5);
    }

    function testRaritiesOfReturnsBatch() public {
        vm.startPrank(alice);
        nft.mint{value: PRICE}(0);
        nft.mint{value: PRICE}(2);
        nft.mint{value: PRICE}(4);
        vm.stopPrank();

        uint256[] memory ids = new uint256[](3);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
        uint8[] memory rarities = nft.raritiesOf(ids);
        assertEq(rarities.length, 3);
        assertEq(rarities[0], 0);
        assertEq(rarities[1], 2);
        assertEq(rarities[2], 4);
    }

    function testRaritiesOfEmptyBatch() public view {
        uint256[] memory ids = new uint256[](0);
        assertEq(nft.raritiesOf(ids).length, 0);
    }

    function testRaritiesOfRevertsOnUnknownId() public {
        vm.prank(alice);
        nft.mint{value: PRICE}(0);

        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 999;
        vm.expectRevert();
        nft.raritiesOf(ids);
    }

    function testNeverMintsHigherThanRequested() public {
        vm.prank(alice);
        nft.mint{value: PRICE}(0);
        assertEq(nft.tokenRarity(1), 0);
    }

    function testInvalidRarityReverts() public {
        vm.prank(alice);
        vm.expectRevert(Loopiterns.InvalidRarity.selector);
        nft.mint{value: PRICE}(5);
    }

    function testOwnerSetMintPrice() public {
        vm.prank(owner);
        nft.setMintPrice(0.02 ether);
        assertEq(nft.mintPrice(), 0.02 ether);

        vm.prank(alice);
        vm.expectRevert(Loopiterns.WrongPrice.selector);
        nft.mint{value: PRICE}(0);

        vm.prank(alice);
        nft.mint{value: 0.02 ether}(1);
        assertEq(nft.tokenRarity(1), 1);
    }

    function testPauseBlocksMint() public {
        vm.prank(owner);
        nft.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        nft.mint{value: PRICE}(0);
        vm.prank(owner);
        nft.unpause();
        vm.prank(alice);
        nft.mint{value: PRICE}(0);
        assertEq(nft.totalSupply(), 1);
    }

    function testDropDownWhenRequestedTierEmpty() public {
        _fillRarity(4, 200);
        assertEq(nft.remaining(4), 0);

        address buyer = address(0xB0B);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        uint256 id = nft.mint{value: PRICE}(4);
        assertEq(nft.tokenRarity(id), 3);
        assertEq(nft.remaining(3), 799);
    }

    function testRequestedCommonDoesNotUpgradeWhenCommonSoldOut() public {
        _fillRarity(0, 5_000);
        assertEq(nft.remaining(0), 0);
        assertTrue(nft.remaining(1) > 0);

        address buyer = address(0xC0);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        vm.expectRevert(Loopiterns.SoldOut.selector);
        nft.mint{value: PRICE}(0);
    }

    function testMintedEvent() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Loopiterns.Minted(alice, 1, 2, 2);
        nft.mint{value: PRICE}(2);
    }

    function testBalanceGrowsAfterMints() public {
        assertEq(address(nft).balance, 0);
        vm.startPrank(alice);
        nft.mint{value: PRICE}(0);
        nft.mint{value: PRICE}(1);
        vm.stopPrank();
        assertEq(address(nft).balance, 2 * PRICE);
    }

    function testWithdrawSendsFullBalanceToTreasury() public {
        address treasury = address(0xED638d2de9E7b6E8D06514A161bb2cEFf28bfCDd);
        vm.startPrank(alice);
        nft.mint{value: PRICE}(0);
        nft.mint{value: PRICE}(2);
        vm.stopPrank();
        assertEq(address(nft).balance, 2 * PRICE);

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit Loopiterns.Withdrawn(treasury, 2 * PRICE);
        nft.withdraw(payable(treasury));

        assertEq(address(nft).balance, 0);
        assertEq(treasury.balance, 2 * PRICE);
    }

    function testWithdrawZeroBalanceStillSucceeds() public {
        vm.prank(owner);
        nft.withdraw(payable(owner));
        assertEq(address(nft).balance, 0);
    }

    function testWithdrawOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        nft.withdraw(payable(alice));
    }

    /// @dev Pinned behavior: a contract without receive/fallback rejects the
    ///      low-level call, so `withdraw` reverts with `WithdrawFailed`.
    function testWithdrawToRejectingReceiverReverts() public {
        vm.prank(alice);
        nft.mint{value: PRICE}(0);

        NoReceiver sink = new NoReceiver();
        vm.prank(owner);
        vm.expectRevert(Loopiterns.WithdrawFailed.selector);
        nft.withdraw(payable(address(sink)));
        assertEq(address(nft).balance, PRICE);
    }

    /// @dev Pinned behavior: an address with no code (EOA semantics) accepts
    ///      the call, so the sweep succeeds.
    function testWithdrawToPlainAddressSucceeds() public {
        vm.prank(alice);
        nft.mint{value: PRICE}(0);

        address plain = address(0x5EED);
        vm.prank(owner);
        nft.withdraw(payable(plain));
        assertEq(plain.balance, PRICE);
        assertEq(address(nft).balance, 0);
    }

    /// @dev 5 mints per wallet; `count` must be divisible by 5.
    function _fillRarity(uint8 rarity, uint256 count) internal {
        require(count % 5 == 0, "count");
        uint256 wallets = count / 5;
        for (uint256 w; w < wallets; ++w) {
            address who = address(uint160(uint256(keccak256(abi.encode(rarity, w)))));
            vm.deal(who, 10 ether);
            vm.startPrank(who);
            for (uint256 i; i < 5; ++i) {
                nft.mint{value: PRICE}(rarity);
            }
            vm.stopPrank();
        }
    }
}
