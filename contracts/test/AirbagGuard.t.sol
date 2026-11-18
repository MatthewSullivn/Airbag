// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AirbagGuard, IMorpho, IVault, IERC20, MarketParams} from "../src/AirbagGuard.sol";
import {MockERC20, MockOracle, MockVault, MockMorpho} from "./Mocks.sol";

/// Foundry cheatcodes we use (no forge-std dependency).
interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function expectRevert() external;
    function expectPartialRevert(bytes4) external;
    function assume(bool) external;
}

contract AirbagGuardTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    // Numbers shaped like the real Arc Testnet loan: 0.0001 cirBTC (8 dec), USDC (6 dec), oracle fixed at $75,000, LLTV 0.86.
    uint256 constant PRICE = 75_000 * 1e36 * 1e6 / 1e8;
    uint128 constant COLLATERAL = 10_000;          // 0.0001 cirBTC
    uint128 constant DEBT = 4_600_000;             // 4.60 USDC  -> health ~1.402
    uint256 constant SAVINGS = 10_000_000;         // 10 USDC in the vault
    bytes32 constant ID = keccak256("cirBTC/USDC");

    address owner = address(0xA11CE);
    address bot = address(0xB07);
    address stranger = address(0xBAD);

    MockERC20 usdc;
    MockERC20 cirbtc;
    MockOracle oracle;
    MockVault vault;
    MockMorpho morpho;
    AirbagGuard guard;

    function setUp() public {
        usdc = new MockERC20("USDC", 6);
        cirbtc = new MockERC20("cirBTC", 8);
        oracle = new MockOracle(PRICE);
        MarketParams memory p = MarketParams(address(usdc), address(cirbtc), address(oracle), address(0x1), 0.86e18);
        morpho = new MockMorpho(ID, p);
        vault = new MockVault(usdc);

        morpho.setPosition(owner, COLLATERAL, DEBT);
        usdc.mint(owner, SAVINGS);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(SAVINGS, owner);
        vm.stopPrank();

        guard = new AirbagGuard(owner, bot, IMorpho(address(morpho)), IVault(address(vault)), ID, 5_000_000, 1.15e18);

        // What the owner signs once to hand the guard (not the bot) its two narrow powers.
        vm.startPrank(owner);
        vault.approve(address(guard), type(uint256).max);
        morpho.setAuthorization(address(guard), true);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ helpers
    function eq(uint256 a, uint256 b, string memory why) internal pure {
        if (a != b) revert(string.concat(why, ": ", _s(a), " != ", _s(b)));
    }
    function yes(bool c, string memory why) internal pure {
        if (!c) revert(why);
    }
    function _s(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        bytes memory b;
        while (v > 0) { b = abi.encodePacked(bytes1(uint8(48 + v % 10)), b); v /= 10; }
        return string(b);
    }

    // ------------------------------------------------------------------ the save
    function test_save_moves_owners_savings_into_owners_loan() public {
        uint256 hBefore = guard.health();
        vm.prank(bot);
        uint256 hAfter = guard.save(780_000);
        eq(morpho.debtOf(owner), DEBT - 780_000, "debt");
        eq(vault.balanceOf(owner), SAVINGS - 780_000, "savings");
        yes(hAfter > hBefore, "health went up");
        eq(usdc.balanceOf(bot), 0, "bot got nothing");
        eq(usdc.balanceOf(address(guard)), 0, "guard keeps nothing");
    }

    function test_health_matches_the_loan() public view {
        // 0.0001 BTC * $75,000 * 0.86 = 6.45 USDC of borrowing power over 4.60 USDC of debt.
        uint256 h = guard.health();
        yes(h > 1.40e18 && h < 1.41e18, "health ~1.402");
    }

    function test_save_more_than_owed_reverts() public {
        // Give the owner more savings than debt, then try to repay more than the debt.
        usdc.mint(owner, 10_000_000);
        vm.prank(owner);
        vault.deposit(10_000_000, owner);
        vm.prank(owner);
        guard.setLimits(100_000_000, 1.15e18);
        vm.prank(bot);
        vm.expectRevert(bytes("morpho: repay more than owed"));
        guard.save(DEBT + 1);
    }

    function test_save_needs_the_owners_vault_allowance() public {
        vm.prank(owner);
        vault.approve(address(guard), 0);
        vm.prank(bot);
        vm.expectRevert(bytes("vault: allowance"));
        guard.save(100_000);
    }

    // ------------------------------------------------------------------ the give-back
    function test_giveBack_moves_loan_money_into_owners_savings() public {
        vm.prank(bot);
        guard.save(1_000_000);   // calm the loan first
        vm.prank(bot);
        uint256 h = guard.giveBack(500_000);
        eq(morpho.debtOf(owner), DEBT - 500_000, "debt");
        eq(vault.balanceOf(owner), SAVINGS - 500_000, "savings");
        yes(h >= 1.15e18, "above floor");
        eq(usdc.balanceOf(bot), 0, "bot got nothing");
        eq(usdc.balanceOf(address(guard)), 0, "guard keeps nothing");
    }

    function test_giveBack_refuses_to_go_under_the_floor() public {
        // Health 1.40 now. Borrowing 1.2 USDC more would land near 1.10, under the 1.15 floor.
        vm.prank(bot);
        vm.expectPartialRevert(AirbagGuard.HealthTooLow.selector);
        guard.giveBack(1_200_000);
        eq(morpho.debtOf(owner), DEBT, "debt unchanged");
        eq(vault.balanceOf(owner), SAVINGS, "savings unchanged");
    }

    function test_giveBack_needs_morpho_authorization() public {
        vm.prank(owner);
        morpho.setAuthorization(address(guard), false);
        vm.prank(bot);
        vm.expectRevert(bytes("morpho: unauthorized"));
        guard.giveBack(100_000);
    }

    // ------------------------------------------------------------------ who may do what
    function test_only_the_bot_can_move_money() public {
        vm.prank(stranger);
        vm.expectRevert(AirbagGuard.NotBot.selector);
        guard.save(100_000);
        vm.prank(owner);
        vm.expectRevert(AirbagGuard.NotBot.selector);
        guard.giveBack(100_000);
    }

    function test_only_the_owner_changes_settings() public {
        vm.prank(bot);
        vm.expectRevert(AirbagGuard.NotOwner.selector);
        guard.setBot(bot);
        vm.prank(bot);
        vm.expectRevert(AirbagGuard.NotOwner.selector);
        guard.setLimits(type(uint256).max, 1e18);
        vm.prank(stranger);
        vm.expectRevert(AirbagGuard.NotOwner.selector);
        guard.setPaused(true);
        vm.prank(bot);
        vm.expectRevert(AirbagGuard.NotOwner.selector);
        guard.sweep(IERC20(address(usdc)));
    }

    function test_owner_can_pause_and_swap_the_bot() public {
        vm.prank(owner);
        guard.setPaused(true);
        vm.prank(bot);
        vm.expectRevert(AirbagGuard.IsPaused.selector);
        guard.save(100_000);

        vm.prank(owner);
        guard.setPaused(false);
        vm.prank(owner);
        guard.setBot(stranger);
        vm.prank(bot);
        vm.expectRevert(AirbagGuard.NotBot.selector);
        guard.save(100_000);
    }

    function test_floor_cannot_be_set_under_1() public {
        vm.prank(owner);
        vm.expectRevert(AirbagGuard.BadFloor.selector);
        guard.setLimits(1, 0.99e18);
    }

    function test_zero_amount_reverts() public {
        vm.prank(bot);
        vm.expectRevert(AirbagGuard.ZeroAmount.selector);
        guard.save(0);
    }

    // ------------------------------------------------------------------ the daily cap
    function test_daily_cap_counts_both_directions_and_resets() public {
        vm.warp(1_000_000);
        vm.prank(bot);
        guard.save(3_000_000);
        vm.prank(bot);
        guard.giveBack(1_500_000);
        eq(guard.capLeft(), 500_000, "cap left");
        vm.prank(bot);
        vm.expectRevert(abi.encodeWithSelector(AirbagGuard.OverDailyCap.selector, 5_500_000, 5_000_000));
        guard.save(1_000_000);

        vm.warp(1_000_000 + 1 days);
        eq(guard.capLeft(), 5_000_000, "fresh day");
        vm.prank(bot);
        guard.save(1_000_000);
    }

    // ------------------------------------------------------------------ setup checks
    function test_constructor_rejects_a_wrong_market() public {
        vm.expectRevert(AirbagGuard.WrongMarket.selector);
        new AirbagGuard(owner, bot, IMorpho(address(morpho)), IVault(address(vault)), keccak256("nope"), 1, 1.15e18);
    }

    function test_constructor_rejects_a_vault_of_another_token() public {
        MockVault other = new MockVault(new MockERC20("EURC", 6));
        vm.expectRevert(AirbagGuard.WrongMarket.selector);
        new AirbagGuard(owner, bot, IMorpho(address(morpho)), IVault(address(other)), ID, 1, 1.15e18);
    }

    // ------------------------------------------------------------------ fuzz: a leaked bot key still can't take money
    function testFuzz_bot_never_ends_up_with_money(uint256 saveAmt, uint256 backAmt) public {
        saveAmt = 1 + saveAmt % 2_000_000;
        backAmt = 1 + backAmt % 2_000_000;
        vm.prank(bot);
        try guard.save(saveAmt) {} catch {}
        vm.prank(bot);
        try guard.giveBack(backAmt) {} catch {}
        eq(usdc.balanceOf(bot), 0, "bot usdc");
        eq(usdc.balanceOf(address(guard)), 0, "guard usdc");
        // Savings minus debt never changes: every USDC that left savings paid the owner's own debt, and back.
        eq(vault.balanceOf(owner) + DEBT, morpho.debtOf(owner) + SAVINGS, "owner's net position unchanged");
    }
}
