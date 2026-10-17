use serde::{Deserialize, Serialize};

use crate::external_registry::ExternalAsset;
use crate::state_machine::Observation;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RpcLog {
    pub address: String,
    pub topics: Vec<String>,
    pub data: String,
    pub block_number: u64,
    pub transaction_hash: String,
    pub log_index: u32,
}

pub fn evm_observation(asset: &ExternalAsset, source: &str, log: &RpcLog, head: u64, zendo_account: &str, kind: &str, amount: u128) -> Result<Observation, String> {
    if log.address.to_lowercase() != asset.token.to_lowercase() {
        return Err("Log address does not match the token.".into());
    }
    if log.topics.first().map(|topic| topic.to_lowercase()) != Some(asset.topic.to_lowercase()) {
        return Err("Log topic does not match the registry.".into());
    }
    Ok(Observation {
        source: source.to_string(),
        asset_id: asset.id.clone(),
        kind: kind.to_string(),
        tx_hash: log.transaction_hash.clone(),
        log_index: log.log_index,
        block_number: log.block_number,
        head_number: head,
        topic: asset.topic.clone(),
        token: asset.token.clone(),
        amount,
        zendo_account: zendo_account.to_string(),
    })
}

pub fn solana_observation(asset: &ExternalAsset, source: &str, memo: &str, slot: u64, head: u64, signature: &str) -> Result<Observation, String> {
    let parts: Vec<&str> = memo.split(':').collect();
    if parts.len() != 5 || parts[0] != "ZENDO" || parts[1] != asset.id {
        return Err("Solana memo does not match this asset.".into());
    }
    let amount: u128 = parts[3].parse().map_err(|_| "Bad amount.")?;
    Ok(Observation {
        source: source.to_string(),
        asset_id: asset.id.clone(),
        kind: parts[4].to_string(),
        tx_hash: signature.to_string(),
        log_index: 0,
        block_number: slot,
        head_number: head,
        topic: asset.topic.clone(),
        token: asset.token.clone(),
        amount,
        zendo_account: parts[2].to_string(),
    })
}

/// Read-only JSON-RPC POST. This function never sends a signed transaction.
pub fn rpc_post(url: &str, body: &str) -> Result<String, String> {
    if !(url.starts_with("https://") || url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost")) {
        return Err("Refusing a non-local insecure RPC.".into());
    }
    let rest = url.split("://").nth(1).ok_or("Bad URL.")?;
    let host_path: Vec<&str> = rest.splitn(2, '/').collect();
    let host = host_path[0];
    let path = if host_path.len() == 2 { format!("/{}", host_path[1]) } else { "/".into() };
    let (name, port) = if let Some((name, port)) = host.rsplit_once(':') {
        (name, port.parse::<u16>().map_err(|_| "Bad port.")?)
    } else if url.starts_with("https://") {
        (host, 443)
    } else {
        (host, 80)
    };
    if url.starts_with("https://") {
        return Err("Configure a local HTTP gateway for tests. Public HTTPS reads belong to the operator process.".into());
    }
    use std::io::{Read, Write};
    use std::net::TcpStream;
    let mut stream = TcpStream::connect((name, port)).map_err(|err| err.to_string())?;
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: {host}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).map_err(|err| err.to_string())?;
    let mut response = String::new();
    stream.read_to_string(&mut response).map_err(|err| err.to_string())?;
    response.split("\r\n\r\n").nth(1).map(|body| body.to_string()).ok_or("Empty RPC response.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::external_registry::example_registry;

    #[test]
    fn evm_and_solana_adapters_match_the_registry() {
        let asset = example_registry(1).assets.remove(0);
        let log = RpcLog {
            address: asset.token.clone(),
            topics: vec![asset.topic.clone()],
            data: "0x".into(),
            block_number: 10,
            transaction_hash: "0x1".into(),
            log_index: 0,
        };
        assert!(evm_observation(&asset, "https://a.example", &log, 30, "znd1", "deposit", 1).is_ok());
        let sol = example_registry(5).assets.into_iter().find(|row| row.chain == "solana").unwrap();
        let memo = format!("ZENDO:{}:znd10000000000000000000000000000000000000002:9:deposit", sol.id);
        assert!(solana_observation(&sol, "https://b.example", &memo, 40, 80, "sig").is_ok());
    }

    #[test]
    fn adapter_refuses_to_post_a_signed_transaction_method() {
        let err = rpc_post("http://evil.example", r#"{"method":"eth_sendRawTransaction"}"#).unwrap_err();
        assert!(err.contains("Refusing"));
    }
}
