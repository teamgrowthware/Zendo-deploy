use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};

use crate::codec::{encode_hex, parse_address, parse_bytes32, Address};
use crate::keys::{address_of, tx_message, tx_message_with_data, verify};
use crate::units::serde_u128;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Tx {
    pub from: String,
    pub nonce: u64,
    pub to: String,
    #[serde(with = "serde_u128")]
    pub amount: u128,
    #[serde(with = "serde_u128")]
    pub fee: u128,
    pub signature: String,
    #[serde(default)]
    pub data: String,
}

impl Tx {
    pub fn id(&self) -> String {
        encode_hex(&self.signed_message().expect("checked"))
    }

    pub fn id_checked(&self) -> Result<String, String> {
        Ok(encode_hex(&self.signed_message()?))
    }

    fn signed_message(&self) -> Result<crate::codec::Hash, String> {
        let key = self.verifying_key()?;
        let to = self.to_address()?;
        if self.data.is_empty() {
            return Ok(tx_message(&key, self.nonce, &to, self.amount, self.fee));
        }
        let data = crate::codec::decode_hex(&self.data)?;
        Ok(tx_message_with_data(&key, self.nonce, &to, self.amount, self.fee, &data))
    }

    pub fn verifying_key(&self) -> Result<VerifyingKey, String> {
        let bytes = parse_bytes32(&self.from)?;
        VerifyingKey::from_bytes(&bytes).map_err(|err| err.to_string())
    }

    pub fn to_address(&self) -> Result<Address, String> {
        parse_address(&self.to)
    }

    pub fn signature(&self) -> Result<Signature, String> {
        let bytes = parse_bytes32_64(&self.signature)?;
        Ok(Signature::from_bytes(&bytes))
    }

    pub fn sender(&self) -> Result<Address, String> {
        Ok(address_of(&self.verifying_key()?))
    }

    pub fn check_signature(&self) -> Result<(), String> {
        let key = self.verifying_key()?;
        let signature = self.signature()?;
        let message = self.signed_message()?;
        if !verify(&key, &message, &signature) {
            return Err("bad transaction signature".into());
        }
        Ok(())
    }
}

fn parse_bytes32_64(text: &str) -> Result<[u8; 64], String> {
    let raw = crate::codec::decode_hex(text)?;
    if raw.len() != 64 {
        return Err("signature must be 64 bytes".into());
    }
    let mut out = [0u8; 64];
    out.copy_from_slice(&raw);
    Ok(out)
}

pub fn sign_tx(key: &ed25519_dalek::SigningKey, nonce: u64, to: Address, amount: u128, fee: u128) -> Tx {
    let message = tx_message(&key.verifying_key(), nonce, &to, amount, fee);
    let signature = crate::keys::sign(key, &message);
    Tx {
        from: encode_hex(key.verifying_key().as_bytes()),
        nonce,
        to: encode_hex(&to),
        amount,
        fee,
        signature: encode_hex(&signature.to_bytes()),
        data: String::new(),
    }
}

pub fn sign_contract(
    key: &ed25519_dalek::SigningKey,
    nonce: u64,
    to: Address,
    amount: u128,
    fee: u128,
    data: &[u8],
) -> Tx {
    let message = tx_message_with_data(&key.verifying_key(), nonce, &to, amount, fee, data);
    let signature = crate::keys::sign(key, &message);
    Tx {
        from: encode_hex(key.verifying_key().as_bytes()),
        nonce,
        to: encode_hex(&to),
        amount,
        fee,
        signature: encode_hex(&signature.to_bytes()),
        data: encode_hex(data),
    }
}
