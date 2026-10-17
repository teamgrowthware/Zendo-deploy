// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ZendoCoin} from "./ZendoCoin.sol";

/// @title ZendoCoin founder vesting on Polygon mainnet
/// @notice Holds 300,000,000 $ZCoin for three founders.
///         Nothing can be released for 120 days, including on the cliff day.
///         After that, 25% of each founder's own allocation unlocks at each 365-day anniversary, for four years.
/// @dev Beneficiaries and amounts are fixed in this contract. There is no admin and no change of wallet.
contract ZendoCoinVesting {
    uint256 public constant CLIFF = 120 days;
    uint256 public constant YEAR = 365 days;
    uint256 public constant YEARS = 4;
    uint256 public constant YEARLY_UNLOCK_BPS = 2_500;

    /// @notice Louis Conner, Co-founder and President. 200,000,000 $ZCoin.
    address public constant LOUIS = 0x18a0730008034177b40F1172aA5953a37dAE7102;
    uint256 public constant LOUIS_AMOUNT = 200_000_000 * 10 ** 18;
    string public constant LOUIS_ROLE = "Co-founder and President";

    /// @notice Prabhat Agrawal. 50,000,000 $ZCoin.
    address public constant PRABHAT = 0xD319679625599303393084671a3AdaB52ea999B3;
    uint256 public constant PRABHAT_AMOUNT = 50_000_000 * 10 ** 18;
    string public constant PRABHAT_ROLE = "Founder";

    /// @notice Pratyaksh Lutare. 50,000,000 $ZCoin.
    address public constant PRATYAKSH = 0x3336a52Cd82F01956147aed641F35694a235fbc9;
    uint256 public constant PRATYAKSH_AMOUNT = 50_000_000 * 10 ** 18;
    string public constant PRATYAKSH_ROLE = "Founder";

    uint256 public constant FOUNDER_ALLOCATION = LOUIS_AMOUNT + PRABHAT_AMOUNT + PRATYAKSH_AMOUNT;

    ZendoCoin public immutable token;
    uint256 public immutable start;
    mapping(address => uint256) public released;

    event Released(address indexed founder, uint256 amount);

    error NothingToRelease();
    error TransferFailed();

    constructor(ZendoCoin token_) {
        token = token_;
        start = block.timestamp;
    }

    function allocation(address founder) public pure returns (uint256) {
        if (founder == LOUIS) return LOUIS_AMOUNT;
        if (founder == PRABHAT) return PRABHAT_AMOUNT;
        if (founder == PRATYAKSH) return PRATYAKSH_AMOUNT;
        return 0;
    }

    function role(address founder) public pure returns (string memory) {
        if (founder == LOUIS) return LOUIS_ROLE;
        if (founder == PRABHAT) return PRABHAT_ROLE;
        if (founder == PRATYAKSH) return PRATYAKSH_ROLE;
        return "";
    }

    /// @notice Cumulative amount unlocked for `founder` at `time`. Zero during the cliff, then 25% per elapsed year, capped at four years.
    function vested(address founder, uint256 time) public view returns (uint256) {
        uint256 total = allocation(founder);
        if (total == 0 || time < start + CLIFF) return 0;
        uint256 elapsed = time - start;
        uint256 yearsElapsed = elapsed / YEAR;
        if (yearsElapsed > YEARS) yearsElapsed = YEARS;
        return (total * yearsElapsed * YEARLY_UNLOCK_BPS) / 10_000;
    }

    function releasable(address founder) public view returns (uint256) {
        uint256 amount = vested(founder, block.timestamp);
        uint256 paid = released[founder];
        if (amount <= paid) return 0;
        return amount - paid;
    }

    /// @notice Sends the caller's unlocked balance. A founder cannot release another founder's coins.
    function release() external {
        uint256 amount = releasable(msg.sender);
        if (amount == 0) revert NothingToRelease();
        released[msg.sender] += amount;
        if (!token.transfer(msg.sender, amount)) revert TransferFailed();
        emit Released(msg.sender, amount);
    }
}
