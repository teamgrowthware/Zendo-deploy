use serde::{Deserialize, Serialize};

pub const CHAINS: &[&str] = &["ethereum", "bsc", "polygon", "avalanche", "solana"];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExternalAsset {
    pub id: String,
    pub symbol: String,
    pub decimals: u8,
    pub chain: String,
    pub token: String,
    pub event_name: String,
    pub topic: String,
    pub confirmations: u32,
    pub min_sources: u8,
    pub rpcs: Vec<String>,
    pub enabled: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Registry {
    pub assets: Vec<ExternalAsset>,
}

impl Registry {
    pub fn get(&self, id: &str) -> Option<&ExternalAsset> {
        self.assets.iter().find(|asset| asset.id == id)
    }

    pub fn insert(&mut self, asset: ExternalAsset) -> Result<(), String> {
        validate_asset(&asset)?;
        if self.assets.iter().any(|row| row.id == asset.id) {
            return Err("That synthetic id is already registered.".into());
        }
        self.assets.push(asset);
        Ok(())
    }
}

pub fn validate_asset(asset: &ExternalAsset) -> Result<(), String> {
    if asset.id.len() < 3 || asset.id.len() > 80 || !asset.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return Err("Asset id must be 3 to 80 safe characters.".into());
    }
    if !CHAINS.contains(&asset.chain.as_str()) {
        return Err("Unsupported chain type.".into());
    }
    if asset.symbol.is_empty() || asset.symbol.len() > 16 {
        return Err("Symbol must be 1 to 16 characters.".into());
    }
    if asset.decimals > 18 {
        return Err("Decimals cannot exceed 18.".into());
    }
    if asset.token.len() < 8 || asset.token.len() > 80 {
        return Err("Token identifier length is invalid.".into());
    }
    if asset.chain != "solana" && !is_hex_address(&asset.token) {
        return Err("EVM token must be a 0x address.".into());
    }
    if !is_topic(&asset.topic) {
        return Err("Topic must be 32 bytes of hex.".into());
    }
    if asset.confirmations == 0 || asset.confirmations > 10_000 {
        return Err("Confirmations must be between 1 and 10000.".into());
    }
    if asset.min_sources < 2 || asset.min_sources > 7 {
        return Err("At least two RPC sources are required.".into());
    }
    for rpc in &asset.rpcs {
        if !(rpc.starts_with("https://") || rpc.starts_with("http://127.0.0.1") || rpc.starts_with("http://localhost")) {
            return Err("RPC URLs must be https, or localhost for a private node.".into());
        }
    }
    Ok(())
}

fn is_hex_address(value: &str) -> bool {
    let rest = value.strip_prefix("0x").unwrap_or("");
    rest.len() == 40 && rest.chars().all(|c| c.is_ascii_hexdigit())
}

fn is_topic(value: &str) -> bool {
    let rest = value.strip_prefix("0x").unwrap_or("");
    rest.len() == 64 && rest.chars().all(|c| c.is_ascii_hexdigit())
}

pub fn example_registry(count: usize) -> Registry {
    let mut assets = Vec::with_capacity(count);
    for index in 1..=count {
        let chain = CHAINS[(index - 1) % CHAINS.len()];
        let token = if chain == "solana" {
            format!("So1anaToken{index:016}")
        } else {
            format!("0x{:040x}", index)
        };
        assets.push(ExternalAsset {
            id: format!("{chain}.slot.{index:04}"),
            symbol: format!("S{index:04}"),
            decimals: 18,
            chain: chain.to_string(),
            token,
            event_name: "TokenLocked".into(),
            topic: format!("0x{:064x}", index),
            confirmations: if chain == "solana" { 32 } else { 12 },
            min_sources: 2,
            rpcs: vec![],
            enabled: true,
        });
    }
    Registry { assets }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_holds_at_least_1500_assets() {
        let registry = example_registry(1500);
        assert!(registry.assets.len() >= 1500);
        assert!(validate_asset(&registry.assets[0]).is_ok());
        assert!(validate_asset(&registry.assets[1499]).is_ok());
        assert!(registry.get("ethereum.slot.0001").is_some());
    }

    #[test]
    fn public_rpc_must_be_https() {
        let mut asset = example_registry(1).assets.remove(0);
        asset.rpcs.push("http://evil.example/rpc".into());
        assert!(validate_asset(&asset).is_err());
    }
}
