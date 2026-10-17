use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

use serde_json::{json, Value};

use crate::chain::{unix_ms, Chain};
use crate::codec::{decode_hex, encode_hex, parse_address};
use crate::contracts::governance_tally;
use crate::keys::address_of;
use crate::peers::PeerBook;
use crate::state::{stake_payload, STAKE_ADDRESS};
use crate::tx::Tx;
use crate::units::SUPPLY_CAP;
use crate::vm::contract_address;

pub fn serve(chain: Arc<Mutex<Chain>>, peers: Arc<Mutex<PeerBook>>, bind: std::net::SocketAddr) -> Result<(), String> {
    let listener = TcpListener::bind(bind).map_err(|err| err.to_string())?;
    thread::spawn(move || {
        for incoming in listener.incoming() {
            let Ok(stream) = incoming else { continue };
            let slot = chain.clone();
            let peers = peers.clone();
            thread::spawn(move || {
                let _ = handle(slot, peers, stream);
            });
        }
    });
    Ok(())
}

fn handle(chain: Arc<Mutex<Chain>>, peers: Arc<Mutex<PeerBook>>, mut stream: TcpStream) -> Result<(), String> {
    let mut buffer = vec![0u8; 64 * 1024];
    let read = stream.read(&mut buffer).map_err(|err| err.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..read]);
    let body = request.split("\r\n\r\n").nth(1).unwrap_or("");
    let response = match serde_json::from_str::<Value>(body) {
        Ok(call) => dispatch(&chain, &peers, &call),
        Err(_) => json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"parse error"}}),
    };
    let payload = response.to_string();
    let header = format!(
        "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
        payload.len()
    );
    stream.write_all(header.as_bytes()).map_err(|err| err.to_string())?;
    stream.write_all(payload.as_bytes()).map_err(|err| err.to_string())?;
    Ok(())
}

fn dispatch(chain: &Arc<Mutex<Chain>>, peers: &Arc<Mutex<PeerBook>>, call: &Value) -> Value {
    let id = call.get("id").cloned().unwrap_or(Value::Null);
    let method = call.get("method").and_then(|value| value.as_str()).unwrap_or("");
    let params = call.get("params").cloned().unwrap_or(json!([]));
    let result = (|| -> Result<Value, String> {
        if method == "zendo_sendTransaction" {
            let raw = params.get(0).ok_or("transaction required")?;
            let tx: Tx = serde_json::from_value(raw.clone()).map_err(|err| err.to_string())?;
            let id = tx.id_checked()?;
            let mut guard = chain.lock().map_err(|err| err.to_string())?;
            guard.push_tx(tx)?;
            return Ok(json!({ "id": id, "accepted": true }));
        }
        let guard = chain.lock().map_err(|err| err.to_string())?;
        match method {
            "zendo_chainId" => Ok(json!(guard.meta.chain_id)),
            "zendo_blockNumber" => Ok(json!(guard.height())),
            "zendo_finalized" => Ok(json!(guard.finalized_height())),
            "zendo_contractAddress" => {
                let text = params.get(0).and_then(|value| value.as_str()).ok_or("from address required")?;
                let from = parse_address(text)?;
                let nonce = params.get(1).and_then(|value| value.as_u64()).ok_or("nonce required")?;
                Ok(json!(encode_hex(&contract_address(&from, nonce))))
            }
            "zendo_nonce" => {
                let text = params.get(0).and_then(|value| value.as_str()).ok_or("address required")?;
                let address = parse_address(text)?;
                Ok(json!(guard.state.get(&address).nonce))
            }
            "zendo_power" => {
                let text = params.get(0).and_then(|value| value.as_str()).ok_or("address required")?;
                let address = parse_address(text)?;
                let key = encode_hex(&address);
                let bonds: u128 = guard
                    .state
                    .bonds()
                    .into_iter()
                    .filter(|(delegator, _, _)| delegator == &key)
                    .map(|(_, _, amount)| amount)
                    .sum();
                let balance = guard.balance(&address);
                Ok(json!({
                    "address": key,
                    "balance": balance.to_string(),
                    "bonds": bonds.to_string(),
                    "power": balance.saturating_add(bonds).to_string(),
                }))
            }
            "zendo_supply" => Ok(json!({
                "total": guard.total_supply().to_string(),
                "cap": SUPPLY_CAP.to_string(),
            })),
            "zendo_launchProgram" => Ok(json!(encode_hex(&crate::contracts::curve_bytecode()))),
            "zendo_governanceProgram" => Ok(json!(encode_hex(&crate::contracts::governance_bytecode()))),
            "zendo_getBlockByHeight" => {
                let height = params.get(0).and_then(|value| value.as_u64()).ok_or("height required")?;
                let block = guard
                    .blocks
                    .iter()
                    .find(|block| block.height == height)
                    .ok_or_else(|| "block not found".to_string())?;
                Ok(serde_json::to_value(block).map_err(|err| err.to_string())?)
            }
            "zendo_getBalance" => {
                let text = params.get(0).and_then(|value| value.as_str()).ok_or("address required")?;
                let address = parse_address(text)?;
                Ok(json!(guard.balance(&address).to_string()))
            }
            "zendo_getCodeInfo" => {
                let text = params.get(0).and_then(|value| value.as_str()).ok_or("address required")?;
                let address = parse_address(text)?;
                let account = guard.state.get(&address);
                Ok(json!({
                    "code": account.code,
                    "admin": account.admin,
                    "history": account.history.len(),
                }))
            }
            "zendo_getCode" => {
                let text = params.get(0).and_then(|value| value.as_str()).ok_or("address required")?;
                let address = parse_address(text)?;
                Ok(json!(guard.state.code(&address)))
            }
            "zendo_getStorage" => {
                let text = params.get(0).and_then(|value| value.as_str()).ok_or("address required")?;
                let slot = params.get(1).and_then(|value| value.as_str()).ok_or("slot required")?;
                let address = parse_address(text)?;
                Ok(json!(guard.state.storage_at(&address, slot)))
            }
            "zendo_localAddress" => Ok(json!(encode_hex(&guard.local_address()?))),
            "zendo_mempool" => Ok(json!(guard.mempool.len())),
            "zendo_consensus" => Ok(json!({
                "height": guard.height(),
                "finalized": guard.finalized_height(),
                "voteFinalized": guard.vote_finalized_height(),
                "reorgs": guard.meta.reorgs,
                "tip": encode_hex(&guard.tip()?.hash()?),
                "sideBlocks": guard.side_blocks(),
                "votes": guard.votes.len(),
                "slashes": guard.slashes.len(),
                "validators": guard.meta.validators.len(),
                "blockReward": guard.meta.block_reward.to_string(),
            })),
            "zendo_validators" => {
                let keys = guard.validators()?;
                let rows: Vec<_> = keys
                    .iter()
                    .enumerate()
                    .map(|(index, key)| {
                        let address = address_of(key);
                        json!({
                            "index": index,
                            "publicKey": encode_hex(key.as_bytes()),
                            "address": encode_hex(&address),
                            "balance": guard.balance(&address).to_string(),
                        })
                    })
                    .collect();
                Ok(json!(rows))
            }
            "zendo_slashes" => Ok(serde_json::to_value(&guard.slashes).map_err(|err| err.to_string())?),
            "zendo_staking" => {
                let bonds: Vec<_> = guard
                    .state
                    .bonds()
                    .into_iter()
                    .map(|(delegator, validator, amount)| json!({ "delegator": delegator, "validator": validator, "amount": amount.to_string() }))
                    .collect();
                Ok(json!({ "address": encode_hex(&STAKE_ADDRESS), "bonds": bonds }))
            }
            "zendo_receipt" => {
                let text = params.get(0).and_then(|value| value.as_str()).ok_or("transaction id required")?;
                let want = text.trim_start_matches("0x").to_lowercase();
                let mut found = None;
                for block in &guard.blocks {
                    let hit = block
                        .txs
                        .iter()
                        .any(|tx| tx.id_checked().map(|id| id.to_lowercase() == want).unwrap_or(false));
                    if hit {
                        found = Some(block.height);
                        break;
                    }
                }
                Ok(json!({
                    "height": found,
                    "finalized": found.map(|height| height <= guard.finalized_height()).unwrap_or(false),
                }))
            }
            "zendo_stakePayload" => {
                let selector = params.get(0).and_then(|value| value.as_u64()).ok_or("selector required")?;
                let index = params.get(1).and_then(|value| value.as_u64()).ok_or("validator index required")?;
                if selector > u8::MAX as u64 || index > u32::MAX as u64 {
                    return Err("selector or validator index out of range".into());
                }
                Ok(json!(encode_hex(&stake_payload(selector as u8, index as u32))))
            }
            "zendo_governance" => {
                let text = params.get(0).and_then(|value| value.as_str()).ok_or("contract address required")?;
                let address = parse_address(text)?;
                let rows = governance_tally(&guard.state, &address)?;
                let proposals: Vec<_> = rows
                    .into_iter()
                    .map(|(id, yes, no)| json!({ "id": id, "yes": yes, "no": no }))
                    .collect();
                Ok(json!({ "contract": encode_hex(&address), "proposals": proposals }))
            }
            "zendo_call" => {
                let input = params.get(0).ok_or("call object required")?;
                let from = parse_address(input.get("from").and_then(|value| value.as_str()).ok_or("from required")?)?;
                let to = parse_address(input.get("to").and_then(|value| value.as_str()).ok_or("to required")?)?;
                let data_hex = input.get("data").and_then(|value| value.as_str()).unwrap_or("");
                let data = if data_hex.is_empty() { Vec::new() } else { decode_hex(data_hex)? };
                let value = parse_u128_param(input.get("value")).unwrap_or(0);
                let gas = input.get("gas").and_then(|value| value.as_u64()).unwrap_or(1_000_000).min(1_000_000);
                let sim = guard.state.simulate_call(&from, &to, value, gas, &data, unix_ms());
                let logs: Vec<_> = sim
                    .logs
                    .iter()
                    .map(|log| json!({ "address": log.address, "topic": log.topic, "data": log.data }))
                    .collect();
                Ok(json!({
                    "status": sim.status,
                    "gasUsed": sim.gas_used,
                    "returnData": encode_hex(&sim.return_data),
                    "logs": logs,
                    "reason": sim.reason,
                }))
            }
            "zendo_peers" => {
                drop(guard);
                let book = peers.lock().map_err(|err| err.to_string())?;
                let rows: Vec<_> = book
                    .records()
                    .into_iter()
                    .map(|peer| {
                        json!({
                            "addr": peer.addr.to_string(),
                            "height": peer.height,
                            "tip": peer.tip,
                            "lastSeenMs": peer.last_seen_ms,
                            "failures": peer.failures,
                            "seed": peer.seed,
                            "rttMs": peer.rtt_ms,
                            "region": peer.region,
                        })
                    })
                    .collect();
                Ok(json!(rows))
            }
            _ => Err(format!("unknown method {method}")),
        }
    })();
    match result {
        Ok(value) => json!({"jsonrpc":"2.0","id":id,"result":value}),
        Err(message) => json!({"jsonrpc":"2.0","id":id,"error":{"code":-32000,"message":message}}),
    }
}

fn parse_u128_param(value: Option<&Value>) -> Option<u128> {
    match value {
        Some(Value::String(text)) => text.trim().parse().ok(),
        Some(Value::Number(number)) => number.as_u64().map(u128::from),
        _ => None,
    }
}
