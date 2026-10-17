// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ZendoCoin} from "./ZendoCoin.sol";
import {ZendoCoinVesting} from "./ZendoCoinVesting.sol";

/// @title One-transaction ZendoCoin launch on Polygon mainnet
/// @notice Deploys $ZCoin, locks 300,000,000 in founder vesting, and sends 700,000,000 to the public allocation wallet.
/// @dev Refuses every chain except Polygon mainnet (chain id 137). Founder wallets are fixed in ZendoCoinVesting.
contract ZendoCoinLaunch {
    ZendoCoin public immutable token;
    ZendoCoinVesting public immutable vesting;

    error WrongNetwork();
    error ZeroAddress();
    error StuckAllocation();
    error AllocationMismatch();

    constructor(address publicRecipient) {
        if (block.chainid != 137) revert WrongNetwork();
        if (publicRecipient == address(0)) revert ZeroAddress();

        token = new ZendoCoin();
        vesting = new ZendoCoinVesting(token);
        if (token.TOTAL_SUPPLY() != token.PUBLIC_ALLOCATION() + vesting.FOUNDER_ALLOCATION()) revert AllocationMismatch();
        if (publicRecipient == address(this) || publicRecipient == address(vesting)) revert StuckAllocation();

        token.transfer(address(vesting), vesting.FOUNDER_ALLOCATION());
        token.transfer(publicRecipient, token.PUBLIC_ALLOCATION());
    }
}
