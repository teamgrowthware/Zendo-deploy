use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

use serde_json::{json, Value};

use crate::ledger::Writer;
use crate::state_machine::Transaction;

pub fn serve(writer: &mut Writer, bind: &str, admin_token: Option<String>) -> Result<(), String> {
    let listener = TcpListener::bind(bind).map_err(|err| err.to_string())?;
    eprintln!("{{\"component\":\"api\",\"bind\":\"{bind}\"}}");
    for stream in listener.incoming() {
        let mut stream = stream.map_err(|err| err.to_string())?;
        if let Err(err) = handle(&mut stream, writer, admin_token.as_deref()) {
            let _ = write_response(&mut stream, 400, &json!({"error": err}).to_string());
        }
    }
    Ok(())
}

fn handle(stream: &mut TcpStream, writer: &mut Writer, admin_token: Option<&str>) -> Result<(), String> {
    let mut buffer = [0u8; 65536];
    let count = stream.read(&mut buffer).map_err(|err| err.to_string())?;
    let text = String::from_utf8_lossy(&buffer[..count]);
    let mut parts = text.split("\r\n\r\n");
    let head = parts.next().unwrap_or("");
    let body = parts.next().unwrap_or("");
    let mut lines = head.lines();
    let request = lines.next().unwrap_or("");
    let mut auth = "";
    for line in lines {
        if let Some(value) = line.strip_prefix("Authorization:") {
            auth = value.trim();
        }
    }
    let mut words = request.split_whitespace();
    let method = words.next().unwrap_or("");
    let path = words.next().unwrap_or("");
    if method == "GET" && path.starts_with("/v1/balances") {
        let address = path.split("address=").nth(1).unwrap_or("").split('&').next().unwrap_or("");
        let account = writer.machine.state.accounts.get(address);
        return write_response(stream, 200, &json!({"address": address, "balances": account.map(|row| &row.balances)}).to_string());
    }
    if method == "GET" && path == "/v1/assets" {
        return write_response(stream, 200, &json!({"count": writer.machine.state.registry.len(), "assets": writer.machine.state.registry}).to_string());
    }
    if method != "POST" {
        return write_response(stream, 404, &json!({"error":"Not found."}).to_string());
    }
    let value: Value = serde_json::from_str(body).map_err(|_| "JSON body required.".to_string())?;
    let tx = match path {
        "/v1/accounts" => Transaction::CreateAccount { address: value["address"].as_str().unwrap_or("").to_string() },
        "/v1/trade" => Transaction::Trade {
            trader: value["trader"].as_str().unwrap_or("").into(),
            meme: value["meme"].as_str().unwrap_or("").into(),
            buy: value["buy"].as_bool().unwrap_or(true),
            amount: value["amount"].as_u64().unwrap_or(0) as u128,
            nonce: value["nonce"].as_u64().unwrap_or(0),
        },
        "/v1/meme" => Transaction::LaunchMeme {
            creator: value["creator"].as_str().unwrap_or("").into(),
            id: value["id"].as_str().unwrap_or("").into(),
            symbol: value["symbol"].as_str().unwrap_or("").into(),
            nonce: value["nonce"].as_u64().unwrap_or(0),
        },
        "/v1/assets" => {
            let expected = admin_token.ok_or("Set ZENDO_CHAIN_ADMIN_TOKEN before registering assets.".to_string())?;
            if auth != format!("Bearer {expected}") {
                return Err("Admin token rejected.".into());
            }
            let asset = serde_json::from_value(value["asset"].clone()).map_err(|err| err.to_string())?;
            Transaction::RegisterAsset { admin: true, asset }
        }
        "/v1/observe" => {
            let observations = serde_json::from_value(value["observations"].clone()).map_err(|err| err.to_string())?;
            Transaction::Observe { observations }
        }
        _ => return write_response(stream, 404, &json!({"error":"Not found."}).to_string()),
    };
    let receipt = writer.commit(tx)?;
    write_response(stream, 200, &serde_json::to_string(&receipt).map_err(|err| err.to_string())?)
}

fn write_response(stream: &mut TcpStream, status: u16, body: &str) -> Result<(), String> {
    let reason = if status == 200 { "OK" } else { "Error" };
    let payload = format!("HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
    stream.write_all(payload.as_bytes()).map_err(|err| err.to_string())
}
