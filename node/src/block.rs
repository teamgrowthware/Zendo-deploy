use ed25519_dalek::{Signature, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};

use crate::codec::{encode_hex, sha256, Hash};
use crate::keys::{block_message, sign, verify};
use crate::tx::Tx;

pub const ZERO_HASH: Hash = [0u8; 32];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Block {
    pub height: u64,
    pub parent: String,
    pub time_ms: u64,
    pub proposer: u32,
    pub txs: Vec<Tx>,
    pub tx_root: String,
    pub state_root: String,
    pub signature: String,
}

impl Block {
    pub fn parent_hash(&self) -> Result<Hash, String> {
        crate::codec::parse_hash(&self.parent)
    }

    pub fn tx_root_hash(&self) -> Result<Hash, String> {
        crate::codec::parse_hash(&self.tx_root)
    }

    pub fn unsigned_message(&self) -> Result<Hash, String> {
        Ok(block_message(
            self.height,
            &self.parent_hash()?,
            self.time_ms,
            self.proposer,
            &self.tx_root_hash()?,
        ))
    }

    pub fn hash(&self) -> Result<Hash, String> {
        let message = self.unsigned_message()?;
        let mut material = message.to_vec();
        material.extend_from_slice(&self.signature_bytes()?);
        Ok(sha256(&material))
    }

    pub fn signature_bytes(&self) -> Result<[u8; 64], String> {
        let raw = crate::codec::decode_hex(&self.signature)?;
        if raw.len() != 64 {
            return Err("block signature must be 64 bytes".into());
        }
        let mut out = [0u8; 64];
        out.copy_from_slice(&raw);
        Ok(out)
    }

    pub fn check_signature(&self, key: &VerifyingKey) -> Result<(), String> {
        let message = self.unsigned_message()?;
        let signature = Signature::from_bytes(&self.signature_bytes()?);
        if !verify(key, &message, &signature) {
            return Err("bad block signature".into());
        }
        let expected = tx_root(&self.txs);
        if encode_hex(&expected) != self.tx_root {
            return Err("transaction root does not match".into());
        }
        Ok(())
    }
}

pub fn tx_root(txs: &[Tx]) -> Hash {
    let mut bytes = Vec::new();
    for tx in txs {
        let _ = tx.check_signature();
        bytes.extend_from_slice(tx.from.as_bytes());
        bytes.extend_from_slice(&tx.nonce.to_le_bytes());
        bytes.extend_from_slice(tx.to.as_bytes());
        bytes.extend_from_slice(&tx.amount.to_le_bytes());
        bytes.extend_from_slice(&tx.fee.to_le_bytes());
        bytes.extend_from_slice(tx.signature.as_bytes());
        bytes.extend_from_slice(tx.data.as_bytes());
    }
    sha256(&bytes)
}

pub fn seal(
    key: &SigningKey,
    height: u64,
    parent: Hash,
    time_ms: u64,
    proposer: u32,
    txs: Vec<Tx>,
    state_root: Hash,
) -> Block {
    let root = tx_root(&txs);
    let message = block_message(height, &parent, time_ms, proposer, &root);
    let signature = sign(key, &message);
    Block {
        height,
        parent: encode_hex(&parent),
        time_ms,
        proposer,
        txs,
        tx_root: encode_hex(&root),
        state_root: encode_hex(&state_root),
        signature: encode_hex(&signature.to_bytes()),
    }
}
