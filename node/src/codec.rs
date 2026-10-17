use sha2::{Digest, Sha256};

pub type Hash = [u8; 32];
pub type Address = [u8; 20];

pub fn sha256(bytes: &[u8]) -> Hash {
    let digest = Sha256::digest(bytes);
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    out
}

pub fn encode_hex(bytes: &[u8]) -> String {
    hex::encode(bytes)
}

pub fn decode_hex(text: &str) -> Result<Vec<u8>, String> {
    hex::decode(text.trim().trim_start_matches("0x")).map_err(|err| err.to_string())
}

pub fn parse_hash(text: &str) -> Result<Hash, String> {
    let raw = decode_hex(text)?;
    if raw.len() != 32 {
        return Err("hash must be 32 bytes".into());
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&raw);
    Ok(out)
}

pub fn parse_address(text: &str) -> Result<Address, String> {
    let raw = decode_hex(text)?;
    if raw.len() != 20 {
        return Err("address must be 20 bytes".into());
    }
    let mut out = [0u8; 20];
    out.copy_from_slice(&raw);
    Ok(out)
}

pub fn parse_bytes32(text: &str) -> Result<[u8; 32], String> {
    parse_hash(text)
}
