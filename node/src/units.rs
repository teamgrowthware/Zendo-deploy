use std::fmt;

use serde::{Deserializer, Serializer};

/// Base units per whole Z. The node, the application, and the genesis file all use
/// eighteen decimals, so `1 Z` is always `1_000_000_000_000_000_000` base units.
pub const UNITS_PER_Z: u128 = 1_000_000_000_000_000_000;

/// Permanent cap. Genesis credits exactly this to the validator and no code path mints more.
pub const GENESIS_SUPPLY_UNITS: u128 = 1_000_000_000 * UNITS_PER_Z;

/// Hard ceiling on the sum of every account balance. It equals the genesis amount, so the
/// only way to move coins is to debit one account before crediting another. No code path mints.
pub const SUPPLY_CAP: u128 = GENESIS_SUPPLY_UNITS;

/// Flat ZCoin launchpad creation fee, enforced by the node when a deploy carries `LAUNCH_MARKER`.
/// It is `0.2 Z` and is routed to the protocol treasury, never to the new contract.
pub const CREATE_FEE: u128 = 200_000_000_000_000_000;

/// First byte of the deploy payload that marks a launchpad coin. The node strips it before
/// storing the program, so the stored code is the curve program itself.
pub const LAUNCH_MARKER: u8 = 0xF0;

/// Serializes `u128` amounts as decimal strings so a JavaScript client never rounds
/// a value above `2^53`. Deserialization also accepts plain JSON numbers for leniency.
pub mod serde_u128 {
    use super::*;

    pub fn serialize<S: Serializer>(value: &u128, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&value.to_string())
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u128, D::Error> {
        struct U128Visitor;

        impl<'de> serde::de::Visitor<'de> for U128Visitor {
            type Value = u128;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a u128 encoded as a decimal string or an integer")
            }

            fn visit_u64<E: serde::de::Error>(self, value: u64) -> Result<u128, E> {
                Ok(u128::from(value))
            }

            fn visit_u128<E: serde::de::Error>(self, value: u128) -> Result<u128, E> {
                Ok(value)
            }

            fn visit_i64<E: serde::de::Error>(self, value: i64) -> Result<u128, E> {
                u128::try_from(value).map_err(E::custom)
            }

            fn visit_i128<E: serde::de::Error>(self, value: i128) -> Result<u128, E> {
                u128::try_from(value).map_err(E::custom)
            }

            fn visit_str<E: serde::de::Error>(self, value: &str) -> Result<u128, E> {
                value.trim().parse::<u128>().map_err(E::custom)
            }
        }

        deserializer.deserialize_any(U128Visitor)
    }
}
