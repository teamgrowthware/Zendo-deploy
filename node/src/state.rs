use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::codec::{decode_hex, encode_hex, sha256, Address};
use crate::tx::Tx;
use crate::units::{CREATE_FEE, LAUNCH_MARKER, SUPPLY_CAP};
use crate::vm::{self, Halt, ZERO_ADDRESS};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ContractLog {
    pub address: String,
    pub topic: String,
    pub data: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Account {
    pub balance: u128,
    pub nonce: u64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub code: String,
    /// Deployer address. Empty on accounts created before code revisions existed, and on accounts with no code.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub admin: String,
    /// Earlier code bodies, oldest first. A rollback restores the last entry.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub history: Vec<String>,
}

pub const CODE_UPGRADE: u8 = 0xA1;
pub const CODE_ROLLBACK: u8 = 0xA2;

fn bare_account() -> Account {
    Account { balance: 0, nonce: 0, code: String::new(), admin: String::new(), history: Vec::new() }
}

/// Reserved account. A transaction sent here delegates or withdraws a validator bond.
/// The payload is five bytes: a selector (`1` delegate, `2` withdraw) and a big-endian validator index.
pub const STAKE_ADDRESS: Address = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];

/// Protocol treasury on the L1. It is `sha256("zendo:treasury")[..20]`, so the Rust node and the
/// TypeScript layer derive the same account from the same label. Launchpad creation fees land here.
pub const TREASURY_ADDRESS: Address =
    [0x59, 0x01, 0x2c, 0x82, 0xca, 0x86, 0x58, 0xb3, 0xc8, 0x2d, 0x3d, 0xc3, 0x70, 0xea, 0xea, 0x19, 0x98, 0xa2, 0x88, 0xe9];

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct State {
    pub accounts: BTreeMap<String, Account>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub storage: BTreeMap<String, BTreeMap<String, String>>,
    /// Bonded amount keyed by `delegator_hex:validator_index`. Coins sit on the validator account, so a slash can shrink what can be withdrawn.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub bonds: BTreeMap<String, u128>,
    #[serde(skip)]
    pub logs: Vec<ContractLog>,
}

#[derive(Clone, Debug)]
pub struct Simulation {
    pub status: String,
    pub gas_used: u64,
    pub return_data: Vec<u8>,
    pub logs: Vec<ContractLog>,
    pub reason: String,
}

impl State {
    pub fn get(&self, address: &Address) -> Account {
        self.accounts
            .get(&encode_hex(address))
            .cloned()
            .unwrap_or_else(bare_account)
    }

    pub fn code(&self, address: &Address) -> String {
        self.get(address).code
    }

    pub fn storage_at(&self, address: &Address, slot_hex: &str) -> String {
        self.storage
            .get(&encode_hex(address))
            .and_then(|slots| slots.get(slot_hex))
            .cloned()
            .unwrap_or_default()
    }

    pub fn storage_word(&self, address: &Address, slot: &[u8; 32]) -> [u8; 32] {
        let text = self.storage_at(address, &encode_hex(slot));
        let mut word = [0u8; 32];
        if let Ok(raw) = decode_hex(&text) {
            if raw.len() == 32 {
                word.copy_from_slice(&raw);
            }
        }
        word
    }

    pub fn set_storage(&mut self, address: &Address, slot: &[u8; 32], value: &[u8; 32]) {
        let addr = encode_hex(address);
        if *value == [0u8; 32] {
            if let Some(slots) = self.storage.get_mut(&addr) {
                slots.remove(&encode_hex(slot));
                if slots.is_empty() {
                    self.storage.remove(&addr);
                }
            }
            return;
        }
        self.storage
            .entry(addr)
            .or_default()
            .insert(encode_hex(slot), encode_hex(value));
    }

    pub fn credit(&mut self, address: &Address, amount: u128) -> Result<(), String> {
        let key = encode_hex(address);
        let account = self.accounts.entry(key).or_insert_with(bare_account);
        account.balance = account
            .balance
            .checked_add(amount)
            .ok_or_else(|| "balance overflow".to_string())?;
        Ok(())
    }

    pub fn bonds(&self) -> Vec<(String, u32, u128)> {
        let mut rows = Vec::new();
        for (key, amount) in &self.bonds {
            let Some((delegator, index)) = key.rsplit_once(':') else { continue };
            let Ok(index) = index.parse::<u32>() else { continue };
            rows.push((delegator.to_string(), index, *amount));
        }
        rows
    }

    /// Sum of every account balance. Transfers, stakes, contract calls, and launch fees all debit
    /// before they credit, so this never grows past the genesis amount unless a bug mints coins.
    pub fn total_supply(&self) -> u128 {
        self.accounts.values().map(|account| account.balance).sum()
    }

    /// Guards the fixed 1,000,000,000 Z cap. Returns the running total so a caller can log it.
    pub fn check_supply(&self) -> Result<u128, String> {
        let total = self.total_supply();
        if total > SUPPLY_CAP {
            return Err(format!("supply {total} exceeds the cap {}", SUPPLY_CAP));
        }
        Ok(total)
    }

    pub fn simulate_call(&self, from: &Address, to: &Address, value: u128, gas: u64, calldata: &[u8], time_ms: u64) -> Simulation {
        if *to == STAKE_ADDRESS {
            return Simulation {
                status: "revert".into(),
                gas_used: 0,
                return_data: Vec::new(),
                logs: Vec::new(),
                reason: "stake is applied as a transaction".into(),
            };
        }
        let code_hex = self.code(to);
        if code_hex.is_empty() {
            return Simulation {
                status: "revert".into(),
                gas_used: 0,
                return_data: Vec::new(),
                logs: Vec::new(),
                reason: "destination has no code".into(),
            };
        }
        let Ok(code) = decode_hex(&code_hex) else {
            return Simulation {
                status: "fault".into(),
                gas_used: 0,
                return_data: Vec::new(),
                logs: Vec::new(),
                reason: "code is not hex".into(),
            };
        };
        let mut draft = self.clone();
        if value > 0 {
            let mut account = draft.get(from);
            if account.balance < value {
                return Simulation {
                    status: "revert".into(),
                    gas_used: 0,
                    return_data: Vec::new(),
                    logs: Vec::new(),
                    reason: "insufficient balance".into(),
                };
            }
            account.balance -= value;
            draft.accounts.insert(encode_hex(from), account);
            if let Err(reason) = draft.credit(to, value) {
                return Simulation { status: "revert".into(), gas_used: 0, return_data: Vec::new(), logs: Vec::new(), reason };
            }
        }
        let env = vm::Env { caller: *from, address: *to, value, timestamp: time_ms, depth: 0 };
        match vm::execute(&mut draft, &env, &code, calldata, gas) {
            Ok(exec) => Simulation {
                status: "ok".into(),
                gas_used: exec.gas_used,
                return_data: exec.return_data,
                logs: exec.logs,
                reason: String::new(),
            },
            Err(Halt::Revert { gas_used, reason }) => Simulation {
                status: "revert".into(),
                gas_used,
                return_data: Vec::new(),
                logs: Vec::new(),
                reason,
            },
            Err(Halt::OutOfGas) => Simulation {
                status: "out_of_gas".into(),
                gas_used: gas,
                return_data: Vec::new(),
                logs: Vec::new(),
                reason: "out of gas".into(),
            },
            Err(Halt::Fault(reason)) => Simulation {
                status: "fault".into(),
                gas_used: gas,
                return_data: Vec::new(),
                logs: Vec::new(),
                reason,
            },
        }
    }

    pub fn apply_tx(&mut self, tx: &Tx, proposer: &Address, time_ms: u64, validators: &[Address]) -> Result<(), String> {
        tx.check_signature()?;
        let from = tx.sender()?;
        let to = tx.to_address()?;
        let sender = self.get(&from);
        if sender.nonce != tx.nonce {
            return Err(format!("nonce {} does not match account {}", tx.nonce, sender.nonce));
        }
        if to == STAKE_ADDRESS {
            return self.apply_stake(tx, &from, proposer, validators);
        }
        if calldata_starts_revision(&tx.data) && !self.code(&to).is_empty() {
            let raw = decode_hex(&tx.data)?;
            return self.apply_revision(tx, &from, &to, proposer, &raw);
        }
        let calldata = if tx.data.is_empty() {
            Vec::new()
        } else {
            let raw = decode_hex(&tx.data)?;
            if raw.len() > 24 * 1024 {
                return Err("payload exceeds 24 KiB".into());
            }
            raw
        };
        if to == ZERO_ADDRESS {
            if calldata.is_empty() {
                return Err("create requires bytecode".into());
            }
            return self.apply_create(tx, &from, proposer, &calldata, time_ms);
        }
        if !self.code(&to).is_empty() {
            return self.apply_call(tx, &from, &to, proposer, &calldata, time_ms);
        }
        if !calldata.is_empty() {
            return Err("destination has no code".into());
        }
        self.apply_transfer(tx, &from, &to, proposer)
    }

    fn apply_transfer(&mut self, tx: &Tx, from: &Address, to: &Address, proposer: &Address) -> Result<(), String> {
        let spend = tx.amount.checked_add(tx.fee).ok_or_else(|| "amount overflow".to_string())?;
        self.debit_nonce(from, spend)?;
        if tx.amount > 0 {
            self.credit(to, tx.amount)?;
        }
        if tx.fee > 0 {
            self.credit(proposer, tx.fee)?;
        }
        self.logs.clear();
        Ok(())
    }

    fn apply_create(&mut self, tx: &Tx, from: &Address, proposer: &Address, code: &[u8], time_ms: u64) -> Result<(), String> {
        let deployed = vm::contract_address(from, tx.nonce);
        if let Some((&LAUNCH_MARKER, program)) = code.split_first() {
            if program.is_empty() {
                return Err("launchpad create requires bytecode".into());
            }
            if tx.amount < CREATE_FEE {
                return Err(format!("launchpad create requires a fee of {CREATE_FEE} base units"));
            }
            return self.run_launch(tx, from, &deployed, proposer, program, time_ms);
        }
        self.run_code(tx, from, &deployed, proposer, code, &[], time_ms, true)
    }

    /// Deploys a launchpad coin. The creation fee leaves the creator and lands on the treasury;
    /// the new contract starts empty and never receives the fee. A revert still only costs gas.
    fn run_launch(
        &mut self,
        tx: &Tx,
        from: &Address,
        target: &Address,
        proposer: &Address,
        code: &[u8],
        time_ms: u64,
    ) -> Result<(), String> {
        let spend = tx.amount.checked_add(tx.fee).ok_or_else(|| "amount overflow".to_string())?;
        if self.get(from).balance < spend {
            return Err("insufficient balance".into());
        }
        let mut draft = self.clone();
        draft.debit_nonce(from, spend)?;
        draft.credit(&TREASURY_ADDRESS, tx.amount)?;
        if tx.fee > 0 {
            draft.credit(proposer, tx.fee)?;
        }
        let env = vm::Env { caller: *from, address: *target, value: 0, timestamp: time_ms, depth: 0 };
        match vm::execute(&mut draft, &env, code, &[], if tx.fee > (u64::MAX as u128) { u64::MAX } else { tx.fee as u64 }) {
            Ok(exec) => {
                draft.refund(from, proposer, tx.fee.saturating_sub(exec.gas_used as u128))?;
                let key = encode_hex(target);
                let account = draft.accounts.entry(key).or_insert_with(bare_account);
                account.code = encode_hex(code);
                if account.admin.is_empty() {
                    account.admin = encode_hex(from);
                }
                draft.logs = exec.logs;
                *self = draft;
                Ok(())
            }
            Err(halt) => {
                let used = match halt {
                    Halt::Revert { gas_used, .. } => gas_used,
                    Halt::OutOfGas | Halt::Fault(_) => tx.fee as u64,
                };
                self.debit_nonce(from, used as u128)?;
                if used > 0 {
                    self.credit(proposer, used as u128)?;
                }
                self.logs.clear();
                Ok(())
            }
        }
    }

    fn apply_call(&mut self, tx: &Tx, from: &Address, to: &Address, proposer: &Address, calldata: &[u8], time_ms: u64) -> Result<(), String> {
        let code = decode_hex(&self.code(to))?;
        self.run_code(tx, from, to, proposer, &code, calldata, time_ms, false)
    }

    fn run_code(
        &mut self,
        tx: &Tx,
        from: &Address,
        target: &Address,
        proposer: &Address,
        code: &[u8],
        calldata: &[u8],
        time_ms: u64,
        deploy: bool,
    ) -> Result<(), String> {
        let spend = tx.amount.checked_add(tx.fee).ok_or_else(|| "amount overflow".to_string())?;
        if self.get(from).balance < spend {
            return Err("insufficient balance".into());
        }
        let mut draft = self.clone();
        draft.debit_nonce(from, spend)?;
        if tx.amount > 0 {
            draft.credit(target, tx.amount)?;
        }
        if tx.fee > 0 {
            draft.credit(proposer, tx.fee)?;
        }
        let env = vm::Env {
            caller: *from,
            address: *target,
            value: tx.amount,
            timestamp: time_ms,
            depth: 0,
        };
        match vm::execute(&mut draft, &env, code, calldata, if tx.fee > (u64::MAX as u128) { u64::MAX } else { tx.fee as u64 }) {
            Ok(exec) => {
                draft.refund(from, proposer, tx.fee.saturating_sub(exec.gas_used as u128))?;
                if deploy {
                    let key = encode_hex(target);
                    let account = draft.accounts.entry(key).or_insert_with(bare_account);
                    account.code = encode_hex(code);
                    if account.admin.is_empty() {
                        account.admin = encode_hex(from);
                    }
                }
                draft.logs = exec.logs;
                *self = draft;
                Ok(())
            }
            Err(halt) => {
                let used = match halt {
                    Halt::Revert { gas_used, .. } => gas_used,
                    Halt::OutOfGas | Halt::Fault(_) => tx.fee as u64,
                };
                self.debit_nonce(from, used as u128)?;
                if used > 0 {
                    self.credit(proposer, used as u128)?;
                }
                self.logs.clear();
                Ok(())
            }
        }
    }

    fn debit_nonce(&mut self, address: &Address, amount: u128) -> Result<(), String> {
        let mut account = self.get(address);
        if account.balance < amount {
            return Err("insufficient balance".into());
        }
        account.balance -= amount;
        account.nonce += 1;
        self.accounts.insert(encode_hex(address), account);
        Ok(())
    }

    fn refund(&mut self, from: &Address, proposer: &Address, amount: u128) -> Result<(), String> {
        if amount == 0 {
            return Ok(());
        }
        let mut proposer_account = self.get(proposer);
        if proposer_account.balance < amount {
            return Err("gas refund exceeds proposer balance".into());
        }
        proposer_account.balance -= amount;
        self.accounts.insert(encode_hex(proposer), proposer_account);
        self.credit(from, amount)
    }

    fn apply_revision(&mut self, tx: &Tx, from: &Address, to: &Address, proposer: &Address, calldata: &[u8]) -> Result<(), String> {
        if tx.amount != 0 {
            return Err("a code revision does not move coins".into());
        }
        if calldata.is_empty() {
            return Err("missing revision selector".into());
        }
        let current = self.get(to);
        if current.admin != encode_hex(from) {
            return Err("only the deploying account can revise code".into());
        }
        let kind = calldata[0];
        let replacement = match kind {
            CODE_UPGRADE => {
                let next = calldata[1..].to_vec();
                if next.is_empty() || next.len() > 24 * 1024 {
                    return Err("replacement code is empty or too large".into());
                }
                Some(next)
            }
            CODE_ROLLBACK => {
                if current.history.is_empty() {
                    return Err("no previous code".into());
                }
                None
            }
            _ => return Err("unknown revision".into()),
        };
        self.debit_nonce(from, tx.fee)?;
        if tx.fee > 0 {
            self.credit(proposer, tx.fee)?;
        }
        let mut revised = self.get(to);
        match replacement {
            Some(next) => {
                if revised.history.len() == 8 {
                    revised.history.remove(0);
                }
                revised.history.push(revised.code);
                revised.code = encode_hex(&next);
            }
            None => {
                revised.code = revised.history.pop().unwrap_or_default();
            }
        }
        self.accounts.insert(encode_hex(to), revised);
        self.logs.clear();
        Ok(())
    }

    fn apply_stake(&mut self, tx: &Tx, from: &Address, proposer: &Address, validators: &[Address]) -> Result<(), String> {
        let raw = decode_hex(&tx.data)?;
        if raw.len() != 5 {
            return Err("stake payload must be 5 bytes".into());
        }
        let selector = raw[0];
        let mut index_bytes = [0u8; 4];
        index_bytes.copy_from_slice(&raw[1..5]);
        let index = u32::from_be_bytes(index_bytes);
        let validator = validators.get(index as usize).copied().ok_or_else(|| "unknown validator".to_string())?;
        match selector {
            1 => self.delegate(tx, from, &validator, index, proposer),
            2 => self.undelegate(tx, from, &validator, index, proposer),
            _ => Err("unknown stake selector".into()),
        }
    }

    fn delegate(&mut self, tx: &Tx, from: &Address, validator: &Address, index: u32, proposer: &Address) -> Result<(), String> {
        if tx.amount == 0 {
            return Err("stake amount is zero".into());
        }
        let spend = tx.amount.checked_add(tx.fee).ok_or_else(|| "amount overflow".to_string())?;
        self.debit_nonce(from, spend)?;
        self.credit(validator, tx.amount)?;
        if tx.fee > 0 {
            self.credit(proposer, tx.fee)?;
        }
        let key = bond_key(from, index);
        let next = self.bonds.get(&key).copied().unwrap_or(0).checked_add(tx.amount).ok_or_else(|| "bond overflow".to_string())?;
        self.bonds.insert(key, next);
        self.logs.clear();
        Ok(())
    }

    fn undelegate(&mut self, tx: &Tx, from: &Address, validator: &Address, index: u32, proposer: &Address) -> Result<(), String> {
        if tx.amount == 0 {
            return Err("stake amount is zero".into());
        }
        let key = bond_key(from, index);
        let bonded = self.bonds.get(&key).copied().unwrap_or(0);
        if tx.amount > bonded {
            return Err("bond is smaller than the withdrawal".into());
        }
        if self.get(validator).balance < tx.amount {
            return Err("slash reduced the bonded balance".into());
        }
        self.debit_nonce(from, tx.fee)?;
        let mut account = self.get(validator);
        account.balance -= tx.amount;
        self.accounts.insert(encode_hex(validator), account);
        self.credit(from, tx.amount)?;
        if tx.fee > 0 {
            self.credit(proposer, tx.fee)?;
        }
        if bonded == tx.amount {
            self.bonds.remove(&key);
        } else {
            self.bonds.insert(key, bonded - tx.amount);
        }
        self.logs.clear();
        Ok(())
    }

    pub fn root(&self) -> crate::codec::Hash {
        let encoded = serde_json::to_vec(self).unwrap_or_default();
        sha256(&encoded)
    }
}

pub fn stake_payload(selector: u8, validator: u32) -> [u8; 5] {
    let index = validator.to_be_bytes();
    [selector, index[0], index[1], index[2], index[3]]
}

pub fn stake_selector(data_hex: &str) -> Option<u8> {
    let raw = decode_hex(data_hex).ok()?;
    if raw.len() != 5 {
        return None;
    }
    Some(raw[0])
}

fn calldata_starts_revision(data_hex: &str) -> bool {
    let Ok(raw) = decode_hex(data_hex) else { return false };
    matches!(raw.first(), Some(&CODE_UPGRADE | &CODE_ROLLBACK))
}

fn bond_key(delegator: &Address, validator: u32) -> String {
    format!("{}:{validator}", encode_hex(delegator))
}
