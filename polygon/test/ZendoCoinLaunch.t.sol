// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ZendoCoin} from "../contracts/ZendoCoin.sol";
import {ZendoCoinLaunch} from "../contracts/ZendoCoinLaunch.sol";
import {ZendoCoinVesting} from "../contracts/ZendoCoinVesting.sol";

contract ZendoCoinLaunchTest is Test {
    address publicWallet = makeAddr("public");
    ZendoCoinLaunch launch;
    ZendoCoin token;
    ZendoCoinVesting vesting;

    function setUp() public {
        vm.chainId(137);
        launch = new ZendoCoinLaunch(publicWallet);
        token = launch.token();
        vesting = launch.vesting();
    }

    function testMetadataAndSupply() public view {
        assertEq(token.name(), "ZendoCoin");
        assertEq(token.symbol(), "$ZCoin");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), 1_000_000_000 ether);
        assertEq(token.balanceOf(publicWallet), 700_000_000 ether);
        assertEq(token.balanceOf(address(vesting)), 300_000_000 ether);
        assertEq(token.balanceOf(address(launch)), 0);
        assertEq(vesting.FOUNDER_ALLOCATION(), 300_000_000 ether);
        assertEq(vesting.allocation(vesting.LOUIS()), 200_000_000 ether);
        assertEq(vesting.allocation(vesting.PRABHAT()), 50_000_000 ether);
        assertEq(vesting.allocation(vesting.PRATYAKSH()), 50_000_000 ether);
        assertEq(vesting.role(vesting.LOUIS()), "Co-founder and President");
        assertEq(vesting.LOUIS_ROLE(), "Co-founder and President");
    }

    function testCliffPaysNothing() public {
        vm.warp(vesting.start() + 120 days);
        assertEq(vesting.releasable(vesting.LOUIS()), 0);
        assertEq(vesting.releasable(vesting.PRABHAT()), 0);
        assertEq(vesting.releasable(vesting.PRATYAKSH()), 0);
        vm.prank(vesting.LOUIS());
        vm.expectRevert(ZendoCoinVesting.NothingToRelease.selector);
        vesting.release();
    }

    function testNothingTheSecondBeforeTheFirstAnniversary() public {
        vm.warp(vesting.start() + 365 days - 1);
        assertEq(vesting.releasable(vesting.LOUIS()), 0);
    }

    function testYearlyUnlock() public {
        vm.warp(vesting.start() + 365 days);
        assertEq(vesting.releasable(vesting.LOUIS()), 50_000_000 ether);
        assertEq(vesting.releasable(vesting.PRABHAT()), 12_500_000 ether);
        assertEq(vesting.releasable(vesting.PRATYAKSH()), 12_500_000 ether);

        vm.prank(vesting.LOUIS());
        vesting.release();
        assertEq(token.balanceOf(vesting.LOUIS()), 50_000_000 ether);
        vm.prank(vesting.LOUIS());
        vm.expectRevert(ZendoCoinVesting.NothingToRelease.selector);
        vesting.release();

        vm.warp(vesting.start() + 2 * 365 days);
        vm.prank(vesting.LOUIS());
        vesting.release();
        assertEq(token.balanceOf(vesting.LOUIS()), 100_000_000 ether);

        vm.warp(vesting.start() + 3 * 365 days);
        vm.prank(vesting.PRABHAT());
        vesting.release();
        assertEq(token.balanceOf(vesting.PRABHAT()), 37_500_000 ether);

        vm.warp(vesting.start() + 4 * 365 days);
        vm.prank(vesting.LOUIS());
        vesting.release();
        vm.prank(vesting.PRABHAT());
        vesting.release();
        vm.prank(vesting.PRATYAKSH());
        vesting.release();
        assertEq(token.balanceOf(vesting.LOUIS()), 200_000_000 ether);
        assertEq(token.balanceOf(vesting.PRABHAT()), 50_000_000 ether);
        assertEq(token.balanceOf(vesting.PRATYAKSH()), 50_000_000 ether);
        assertEq(token.balanceOf(address(vesting)), 0);
    }

    function testStrangerCannotRelease() public {
        vm.warp(vesting.start() + 4 * 365 days);
        vm.expectRevert(ZendoCoinVesting.NothingToRelease.selector);
        vesting.release();
    }

    function testFounderCannotTakeAnotherGrant() public {
        vm.warp(vesting.start() + 365 days);
        vm.prank(vesting.PRABHAT());
        vesting.release();
        assertEq(token.balanceOf(vesting.PRABHAT()), 12_500_000 ether);
        assertEq(token.balanceOf(vesting.LOUIS()), 0);
    }

    function testWrongNetwork() public {
        vm.chainId(1);
        vm.expectRevert(ZendoCoinLaunch.WrongNetwork.selector);
        new ZendoCoinLaunch(publicWallet);
    }

    function testZeroPublicRecipient() public {
        vm.expectRevert(ZendoCoinLaunch.ZeroAddress.selector);
        new ZendoCoinLaunch(address(0));
    }

    function testPublicRecipientCannotBeTheLaunchContract() public {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.expectRevert(ZendoCoinLaunch.StuckAllocation.selector);
        new ZendoCoinLaunch(predicted);
    }
}
