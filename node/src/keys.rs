use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;

use crate::codec::{sha256, Address, Hash};

pub fn generate_signing_key() -> SigningKey {
    SigningKey::generate(&mut OsRng)
}

pub fn address_of(key: &VerifyingKey) -> Address {
    let digest = sha256(key.as_bytes());
    let mut address = [0u8; 20];
    address.copy_from_slice(&digest[..20]);
    address
}

pub fn sign(key: &SigningKey, message: &[u8]) -> Signature {
    key.sign(message)
}

pub fn verify(key: &VerifyingKey, message: &[u8], signature: &Signature) -> bool {
    key.verify(message, signature).is_ok()
}

pub fn tx_message(from: &VerifyingKey, nonce: u64, to: &Address, amount: u128, fee: u128) -> Hash {
    let mut bytes = Vec::with_capacity(12 + 32 + 8 + 20 + 16 + 16);
    bytes.extend_from_slice(b"ZENDO_TX_V1");
    bytes.extend_from_slice(from.as_bytes());
    bytes.extend_from_slice(&nonce.to_le_bytes());
    bytes.extend_from_slice(to);
    bytes.extend_from_slice(&amount.to_le_bytes());
    bytes.extend_from_slice(&fee.to_le_bytes());
    sha256(&bytes)
}

pub fn tx_message_with_data(from: &VerifyingKey, nonce: u64, to: &Address, amount: u128, fee: u128, data: &[u8]) -> Hash {
    let mut bytes = Vec::with_capacity(12 + 32 + 8 + 20 + 16 + 16 + data.len());
    bytes.extend_from_slice(b"ZENDO_TX_V2");
    bytes.extend_from_slice(from.as_bytes());
    bytes.extend_from_slice(&nonce.to_le_bytes());
    bytes.extend_from_slice(to);
    bytes.extend_from_slice(&amount.to_le_bytes());
    bytes.extend_from_slice(&fee.to_le_bytes());
    bytes.extend_from_slice(data);
    sha256(&bytes)
}

pub fn vote_message(height: u64, block_hash: &Hash, validator: u32) -> Hash {
    let mut bytes = Vec::with_capacity(13 + 8 + 32 + 4);
    bytes.extend_from_slice(b"ZENDO_VOTE_V1");
    bytes.extend_from_slice(&height.to_le_bytes());
    bytes.extend_from_slice(block_hash);
    bytes.extend_from_slice(&validator.to_le_bytes());
    sha256(&bytes)
}

pub fn block_message(height: u64, parent: &Hash, time_ms: u64, proposer: u32, tx_root: &Hash) -> Hash {
    let mut bytes = Vec::with_capacity(12 + 8 + 32 + 8 + 4 + 32);
    bytes.extend_from_slice(b"ZENDO_BLK_V1");
    bytes.extend_from_slice(&height.to_le_bytes());
    bytes.extend_from_slice(parent);
    bytes.extend_from_slice(&time_ms.to_le_bytes());
    bytes.extend_from_slice(&proposer.to_le_bytes());
    bytes.extend_from_slice(tx_root);
    sha256(&bytes)
}
