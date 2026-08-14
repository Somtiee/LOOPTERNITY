// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {LoopternityVault} from "../src/LoopternityVault.sol";
import {IncoTest} from "@inco/lightning/src/test/IncoTest.sol";
import {inco} from "@inco/lightning/src/Lib.sol";

contract LoopternityVaultTest is IncoTest {
    LoopternityVault internal vault;
    address internal treasury;
    uint256 internal constant FEE = 0.01 ether;

    function setUp() public override {
        super.setUp();
        treasury = vm.addr(0x71EA5);
        vault = new LoopternityVault(FEE, treasury);
        // Sunday 9 Aug 2026 12:00 UTC — week id "2026-08-09"
        vm.warp(1_786_276_800);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(address(this), 100 ether);
    }

    function _week() internal view returns (string memory) {
        return vault.currentWeekId();
    }

    function _cipher(uint256 value, address account) internal view returns (bytes memory) {
        return fakePrepareEuint256Ciphertext(value, account, address(vault));
    }

    function testEnterRunPaysFee() public {
        string memory weekId = _week();
        vm.prank(alice);
        vault.enterRun{value: FEE}(weekId);
        assertEq(vault.weekPoolWei(weekId), FEE);
        assertEq(vault.unusedEntries(keccak256(bytes(weekId)), alice), 1);
    }

    function testRejectUnderpay() public {
        string memory weekId = _week();
        vm.prank(alice);
        vm.expectRevert(LoopternityVault.Underpaid.selector);
        vault.enterRun{value: FEE - 1}(weekId);
    }

    function testWrongWeekReverts() public {
        vm.prank(alice);
        vm.expectRevert(LoopternityVault.WrongWeek.selector);
        vault.enterRun{value: FEE}("2000-01-02");
    }

    function testSubmitWithoutEntryReverts() public {
        vm.prank(alice);
        vm.expectRevert(LoopternityVault.NoEntry.selector);
        vault.submitConfidentialScore{value: inco.getFee() * 2}(_cipher(1, alice), _cipher(100, alice));
    }

    function testSubmitConsumesTicketAndStoresHandle() public {
        string memory weekId = _week();
        vm.startPrank(alice);
        vault.enterRun{value: FEE}(weekId);
        vault.submitConfidentialScore{value: inco.getFee() * 2}(
            _cipher(90_000, alice),
            _cipher(200, alice)
        );
        vm.stopPrank();
        processAllOperations();
        bytes32 id = keccak256(bytes(weekId));
        assertEq(vault.unusedEntries(id, alice), 0);
        assertEq(vault.runCount(id, alice), 1);
        assertTrue(vault.hasScore(id, alice));
        assertEq(vault.bestSurvivalHandle(weekId, alice), bytes32(uint256(90_000)));
        assertEq(vault.bestMultiplierHandle(weekId, alice), bytes32(uint256(200)));
    }

    function testDoubleSealReverts() public {
        string memory weekId = _week();
        bytes memory theme = _cipher(1, address(this));
        vault.sealWeeklyTheme{value: inco.getFee()}(weekId, theme);
        assertTrue(vault.themeSealed(weekId));
        vm.expectRevert(LoopternityVault.ThemeAlreadySealed.selector);
        vault.sealWeeklyTheme{value: inco.getFee()}(weekId, theme);
    }

    function testSettleSplits8020AndTop10Shares() public {
        string memory weekId = _week();
        address[10] memory players;
        for (uint256 i = 0; i < 10; i++) {
            players[i] = vm.addr(i + 1);
            vm.deal(players[i], 10 ether);
            vm.prank(players[i]);
            vault.enterRun{value: FEE}(weekId);
        }
        assertEq(vault.weekPoolWei(weekId), FEE * 10);

        vm.warp(block.timestamp + 7 days);
        vault.attestTop10(weekId, players);
        vault.settleWeek(weekId);

        uint256 pool = FEE * 10;
        uint256 prize = (pool * 8000) / 10_000;
        uint256 treasuryCut = pool - prize;
        uint16[10] memory bps = [3000, 1800, 1200, 900, 800, 700, 600, 400, 300, 300];
        uint256 allocated;
        for (uint256 i = 0; i < 10; i++) {
            uint256 share = (prize * uint256(bps[i])) / 10_000;
            allocated += share;
            assertEq(vault.claimable(keccak256(bytes(weekId)), players[i]), share);
        }
        assertEq(allocated, prize);
        assertEq(treasury.balance, treasuryCut);

        uint256 before = players[0].balance;
        vm.prank(players[0]);
        vault.claim(weekId);
        assertEq(players[0].balance, before + (prize * 3000) / 10_000);
        assertEq(vault.claimable(keccak256(bytes(weekId)), players[0]), 0);
    }

    function testEmptyWeekSendsAllToTreasury() public {
        string memory weekId = _week();
        vm.prank(alice);
        vault.enterRun{value: FEE}(weekId);
        vm.warp(block.timestamp + 7 days);
        address[10] memory empty;
        vault.attestTop10(weekId, empty);
        vault.settleWeek(weekId);
        assertEq(treasury.balance, FEE);
        assertTrue(vault.weekSettled(weekId));
    }

    function testCannotSettleBeforeWeekEnd() public {
        string memory weekId = _week();
        address[10] memory empty;
        vm.expectRevert(LoopternityVault.WeekNotEnded.selector);
        vault.attestTop10(weekId, empty);
    }

    function testDoubleSettleReverts() public {
        string memory weekId = _week();
        vm.prank(alice);
        vault.enterRun{value: FEE}(weekId);
        vm.warp(block.timestamp + 7 days);
        address[10] memory empty;
        vault.attestTop10(weekId, empty);
        vault.settleWeek(weekId);
        vm.expectRevert(LoopternityVault.AlreadySettled.selector);
        vault.settleWeek(weekId);
    }

    function testLeftoverTop10BpsToTreasury() public {
        string memory weekId = _week();
        vm.prank(alice);
        vault.enterRun{value: FEE}(weekId);
        vm.warp(block.timestamp + 7 days);
        address[10] memory ranked;
        ranked[0] = alice;
        vault.attestTop10(weekId, ranked);
        vault.settleWeek(weekId);
        uint256 prize = (FEE * 8000) / 10_000;
        uint256 aliceShare = (prize * 3000) / 10_000;
        assertEq(vault.claimable(keccak256(bytes(weekId)), alice), aliceShare);
        assertEq(treasury.balance, FEE - aliceShare);
    }
}
