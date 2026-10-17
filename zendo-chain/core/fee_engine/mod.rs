use serde::{Deserialize, Serialize};

/// Protocol fees stay on the Zendo ledger. They do not move coins on another chain.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct FeeSchedule {
    pub launch: u128,
    pub trade_bps: u32,
    pub boost: u128,
    pub graduation: u128,
    pub listing: u128,
    pub govern: u128,
    pub stake_bps: u32,
}

impl Default for FeeSchedule {
    fn default() -> Self {
        Self {
            launch: 200_000_000_000_000_000,
            trade_bps: 100,
            boost: 50_000_000_000_000_000_000,
            graduation: 0,
            listing: 1_000_000_000_000_000_000,
            govern: 1_000_000_000_000_000_000,
            stake_bps: 0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct FeeCharge {
    pub asset: String,
    pub amount: u128,
    pub reason: String,
}

pub fn trade_fee(notional: u128, bps: u32) -> u128 {
    notional.saturating_mul(u128::from(bps)) / 10_000
}

pub fn charge(asset: &str, amount: u128, reason: &str) -> Result<FeeCharge, String> {
    if amount == 0 {
        return Err("A fee amount must be positive.".into());
    }
    if asset.is_empty() {
        return Err("A fee needs an asset.".into());
    }
    Ok(FeeCharge {
        asset: asset.to_string(),
        amount,
        reason: reason.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trade_fee_is_one_percent_by_default() {
        assert_eq!(trade_fee(10_000, 100), 100);
        assert_eq!(trade_fee(1, 100), 0);
    }

    #[test]
    fn zero_fee_is_rejected() {
        assert!(charge("ZCOIN", 0, "launch").is_err());
    }
}
