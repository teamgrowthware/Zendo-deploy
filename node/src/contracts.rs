use crate::vm::{
    ADD, CALL, CALLDATALOAD, CALLER, CALLVALUE, DIV, DUP, EQ, ISZERO, JUMPDEST, JUMPI, LOG, LT, MUL, PUSH, RETURN, REVERT,
    SEND, SLOAD, SSTORE, STOP, SUB, SWAP, TIMESTAMP,
};

use crate::codec::Address;
#[cfg(test)]
use crate::codec::{decode_hex, encode_hex};
use crate::state::State;
#[cfg(test)]
use crate::state::Account;
#[cfg(test)]
use crate::vm::{contract_address, execute, Env, Exec, Halt};

pub const TOKEN_SUPPLY: u128 = 1_000_000;
pub const VEST_TOTAL: u128 = 1_000;
pub const VEST_CLIFF_MS: u64 = 1_000;
pub const VEST_PERIOD_MS: u64 = 4_000;
pub const CURVE_RESERVE: u128 = 1_000;

/// Token storage: slot 0 is the init flag, slot 1 is the supply, slot 2–3 are scratch,
/// and every other slot is a holder balance keyed by that account's address word.
/// Transfer logs use the recipient as the topic and the amount as the data.
pub fn token_bytecode() -> Vec<u8> {
    let mut asm = Asm::new();
    asm.sload(0);
    asm.op(ISZERO);
    asm.jumpi("init");
    asm.selector(1, "balance_of");
    asm.selector(2, "transfer");
    asm.op(REVERT);

    asm.label("init");
    asm.push_u128(1);
    asm.sstore_slot(0);
    asm.push_u128(TOKEN_SUPPLY);
    asm.op(CALLER);
    asm.op(SSTORE);
    asm.push_u128(TOKEN_SUPPLY);
    asm.sstore_slot(1);
    asm.op(STOP);

    asm.label("balance_of");
    asm.load_call(32);
    asm.op(SLOAD);
    asm.op(RETURN);

    asm.label("transfer");
    asm.load_call(64);
    asm.sstore_slot(2);
    asm.load_call(32);
    asm.sstore_slot(3);
    asm.op(CALLER);
    asm.op(SLOAD);
    asm.sload(2);
    asm.op(LT);
    asm.jumpi("reject");
    asm.op(CALLER);
    asm.op(SLOAD);
    asm.sload(2);
    asm.op(SUB);
    asm.op(CALLER);
    asm.op(SSTORE);
    asm.sload(3);
    asm.op(SLOAD);
    asm.sload(2);
    asm.op(ADD);
    asm.sload(3);
    asm.op(SSTORE);
    asm.sload(2);
    asm.sload(3);
    asm.op(LOG);
    asm.op(STOP);

    asm.label("reject");
    asm.op(REVERT);
    asm.finish()
}

/// Vesting storage: slot 0 init, 1 beneficiary, 2 total, 3 start, 4 cliff, 5 period, 6 claimed.
/// Nothing is paid at the cliff. After the cliff the balance vests linearly across the period.
/// Release sends native coins to the beneficiary and logs the paid amount under topic 1.
pub fn vesting_bytecode() -> Vec<u8> {
    let mut asm = Asm::new();
    asm.sload(0);
    asm.op(ISZERO);
    asm.jumpi("init");
    asm.selector(1, "release");
    asm.op(REVERT);

    asm.label("init");
    asm.push_u128(1);
    asm.sstore_slot(0);
    asm.op(CALLER);
    asm.sstore_slot(1);
    asm.push_u128(VEST_TOTAL);
    asm.sstore_slot(2);
    asm.op(TIMESTAMP);
    asm.sstore_slot(3);
    asm.push_u128(u128::from(VEST_CLIFF_MS));
    asm.sstore_slot(4);
    asm.push_u128(u128::from(VEST_PERIOD_MS));
    asm.sstore_slot(5);
    asm.op(STOP);

    asm.label("release");
    asm.op(CALLER);
    asm.sload(1);
    asm.op(EQ);
    asm.op(ISZERO);
    asm.jumpi("reject");
    asm.sload(3);
    asm.sload(4);
    asm.op(ADD);
    asm.sstore_slot(7);
    asm.op(TIMESTAMP);
    asm.sload(7);
    asm.op(LT);
    asm.jumpi("done");
    asm.op(TIMESTAMP);
    asm.sload(7);
    asm.op(SUB);
    asm.sstore_slot(8);
    asm.sload(8);
    asm.sload(5);
    asm.op(LT);
    asm.jumpi("keep");
    asm.sload(5);
    asm.sstore_slot(8);
    asm.label("keep");
    asm.sload(2);
    asm.sload(8);
    asm.op(MUL);
    asm.sload(5);
    asm.op(DIV);
    asm.sstore_slot(9);
    asm.sload(9);
    asm.sload(6);
    asm.op(SUB);
    asm.op(DUP);
    asm.sload(6);
    asm.op(ADD);
    asm.sstore_slot(6);
    asm.op(DUP);
    asm.op(SEND);
    asm.push_u128(1);
    asm.op(LOG);
    asm.op(STOP);

    asm.label("done");
    asm.op(STOP);
    asm.label("reject");
    asm.op(REVERT);
    asm.finish()
}

/// Curve storage: slot 0 init, 1 virtual Z reserve, 2 virtual token reserve, 3 constant k.
/// Token balances sit at the holder address word. Buy pays native Z through the transaction
/// value. Sell pays native Z back with SEND. Both take a 1% fee by integer division.
/// Buy logs topic 1 and the token output. Sell logs topic 2 and the Z output.
pub fn curve_bytecode() -> Vec<u8> {
    let mut asm = Asm::new();
    asm.sload(0);
    asm.op(ISZERO);
    asm.jumpi("init");
    asm.selector(1, "buy");
    asm.selector(2, "sell");
    asm.op(REVERT);

    asm.label("init");
    asm.push_u128(1);
    asm.sstore_slot(0);
    asm.push_u128(CURVE_RESERVE);
    asm.sstore_slot(1);
    asm.push_u128(CURVE_RESERVE);
    asm.sstore_slot(2);
    asm.push_u128(CURVE_RESERVE);
    asm.push_u128(CURVE_RESERVE);
    asm.op(MUL);
    asm.sstore_slot(3);
    asm.op(STOP);

    asm.label("buy");
    asm.op(CALLVALUE);
    asm.push_u128(100);
    asm.op(DIV);
    asm.sstore_slot(4);
    asm.op(CALLVALUE);
    asm.sload(4);
    asm.op(SUB);
    asm.sstore_slot(5);
    asm.sload(1);
    asm.sload(5);
    asm.op(ADD);
    asm.sstore_slot(6);
    asm.sload(3);
    asm.sload(6);
    asm.op(DIV);
    asm.sstore_slot(7);
    asm.sload(2);
    asm.sload(7);
    asm.op(LT);
    asm.jumpi("reject");
    asm.sload(2);
    asm.sload(7);
    asm.op(SUB);
    asm.sstore_slot(8);
    asm.sload(6);
    asm.sstore_slot(1);
    asm.sload(7);
    asm.sstore_slot(2);
    asm.op(CALLER);
    asm.op(SLOAD);
    asm.sload(8);
    asm.op(ADD);
    asm.op(CALLER);
    asm.op(SSTORE);
    asm.sload(8);
    asm.push_u128(1);
    asm.op(LOG);
    asm.op(STOP);

    asm.label("sell");
    asm.load_call(32);
    asm.sstore_slot(4);
    asm.op(CALLER);
    asm.op(SLOAD);
    asm.sload(4);
    asm.op(LT);
    asm.jumpi("reject");
    asm.sload(2);
    asm.sload(4);
    asm.op(ADD);
    asm.sstore_slot(5);
    asm.sload(3);
    asm.sload(5);
    asm.op(DIV);
    asm.sstore_slot(6);
    asm.sload(1);
    asm.sload(6);
    asm.op(LT);
    asm.jumpi("reject");
    asm.sload(1);
    asm.sload(6);
    asm.op(SUB);
    asm.sstore_slot(7);
    asm.sload(7);
    asm.push_u128(100);
    asm.op(DIV);
    asm.sstore_slot(8);
    asm.sload(7);
    asm.sload(8);
    asm.op(SUB);
    asm.op(DUP);
    asm.op(SEND);
    asm.sload(6);
    asm.sstore_slot(1);
    asm.sload(5);
    asm.sstore_slot(2);
    asm.op(CALLER);
    asm.op(SLOAD);
    asm.sload(4);
    asm.op(SUB);
    asm.op(CALLER);
    asm.op(SSTORE);
    asm.push_u128(2);
    asm.op(LOG);
    asm.op(STOP);

    asm.label("reject");
    asm.op(REVERT);
    asm.finish()
}

/// Governance storage: slot 1 is the latest proposal id. Yes votes live at 100 + id.
/// No votes live at 200 + id. A voter's address word stores the proposal they already
/// balloted, so each account can vote once. Propose logs topic 1 and the new id.
/// Vote logs topic 2 for yes and topic 3 for no, with the proposal id as the data.
pub fn governance_bytecode() -> Vec<u8> {
    let mut asm = Asm::new();
    asm.sload(0);
    asm.op(ISZERO);
    asm.jumpi("init");
    asm.selector(1, "propose");
    asm.selector(2, "vote");
    asm.op(REVERT);

    asm.label("init");
    asm.push_u128(1);
    asm.sstore_slot(0);
    asm.op(STOP);

    asm.label("propose");
    asm.sload(1);
    asm.push_u128(1);
    asm.op(ADD);
    asm.op(DUP);
    asm.sstore_slot(1);
    asm.push_u128(1);
    asm.op(LOG);
    asm.op(STOP);

    asm.label("vote");
    asm.load_call(32);
    asm.op(ISZERO);
    asm.jumpi("reject");
    asm.sload(1);
    asm.load_call(32);
    asm.op(LT);
    asm.jumpi("reject");
    asm.op(CALLER);
    asm.op(SLOAD);
    asm.op(ISZERO);
    asm.op(ISZERO);
    asm.jumpi("reject");
    asm.load_call(32);
    asm.op(CALLER);
    asm.op(SSTORE);
    asm.load_call(64);
    asm.push_u128(1);
    asm.op(EQ);
    asm.jumpi("yes");
    asm.load_call(32);
    asm.push_u128(200);
    asm.op(ADD);
    asm.bump();
    asm.load_call(32);
    asm.push_u128(3);
    asm.op(LOG);
    asm.op(STOP);

    asm.label("yes");
    asm.load_call(32);
    asm.push_u128(100);
    asm.op(ADD);
    asm.bump();
    asm.load_call(32);
    asm.push_u128(2);
    asm.op(LOG);
    asm.op(STOP);

    asm.label("reject");
    asm.op(REVERT);
    asm.finish()
}

/// NFT storage: slot 1 is the next token id. The owner of id N is the address word at
/// slot 1000 + N. Slot 2 holds the id being touched and slot 3 holds a transfer recipient.
/// Mint logs the new id as the topic and the minter as the data. Transfer logs the
/// recipient as the topic and the id as the data.
pub fn nft_bytecode() -> Vec<u8> {
    let mut asm = Asm::new();
    asm.sload(0);
    asm.op(ISZERO);
    asm.jumpi("init");
    asm.selector(1, "owner_of");
    asm.selector(2, "mint");
    asm.selector(3, "transfer");
    asm.op(REVERT);

    asm.label("init");
    asm.push_u128(1);
    asm.sstore_slot(0);
    asm.op(STOP);

    asm.label("owner_of");
    asm.load_call(32);
    asm.push_u128(1000);
    asm.op(ADD);
    asm.op(SLOAD);
    asm.op(RETURN);

    asm.label("mint");
    asm.sload(1);
    asm.push_u128(1);
    asm.op(ADD);
    asm.op(DUP);
    asm.sstore_slot(1);
    asm.op(DUP);
    asm.sstore_slot(2);
    asm.push_u128(1000);
    asm.op(ADD);
    asm.op(CALLER);
    asm.op(SWAP);
    asm.op(SSTORE);
    asm.op(CALLER);
    asm.sload(2);
    asm.op(LOG);
    asm.op(STOP);

    asm.label("transfer");
    asm.load_call(32);
    asm.sstore_slot(2);
    asm.load_call(64);
    asm.sstore_slot(3);
    asm.sload(2);
    asm.push_u128(1000);
    asm.op(ADD);
    asm.op(SLOAD);
    asm.op(CALLER);
    asm.op(EQ);
    asm.op(ISZERO);
    asm.jumpi("reject");
    asm.sload(3);
    asm.sload(2);
    asm.push_u128(1000);
    asm.op(ADD);
    asm.op(SSTORE);
    asm.sload(2);
    asm.sload(3);
    asm.op(LOG);
    asm.op(STOP);

    asm.label("reject");
    asm.op(REVERT);
    asm.finish()
}

/// Identity storage: slot 0 is the init flag. Each account's address word stores the
/// name it registered. Register writes the caller's word. Lookup reads the address
/// word passed in calldata and returns it.
pub fn identity_bytecode() -> Vec<u8> {
    let mut asm = Asm::new();
    asm.sload(0);
    asm.op(ISZERO);
    asm.jumpi("init");
    asm.selector(1, "register");
    asm.selector(2, "lookup");
    asm.op(REVERT);

    asm.label("init");
    asm.push_u128(1);
    asm.sstore_slot(0);
    asm.op(STOP);

    asm.label("register");
    asm.load_call(32);
    asm.op(CALLER);
    asm.op(SSTORE);
    asm.op(STOP);

    asm.label("lookup");
    asm.load_call(32);
    asm.op(SLOAD);
    asm.op(RETURN);
    asm.finish()
}

/// Reader storage: slot 1 is the identity contract. Selector 1 binds that address.
/// Selector 2 pushes the lookup selector and the account word, then CALL, and returns
/// the word the identity contract produced.
pub fn identity_reader_bytecode() -> Vec<u8> {
    let mut asm = Asm::new();
    asm.sload(0);
    asm.op(ISZERO);
    asm.jumpi("init");
    asm.selector(1, "bind");
    asm.selector(2, "read");
    asm.op(REVERT);

    asm.label("init");
    asm.push_u128(1);
    asm.sstore_slot(0);
    asm.op(STOP);

    asm.label("bind");
    asm.load_call(32);
    asm.sstore_slot(1);
    asm.op(STOP);

    asm.label("read");
    asm.push_u128(2);
    asm.load_call(32);
    asm.sload(1);
    asm.op(CALL);
    asm.op(RETURN);
    asm.finish()
}

/// Reads the governance program's slots: proposal count in slot 1, yes votes at 100 + id, no votes at 200 + id.
pub fn governance_tally(state: &State, contract: &Address) -> Result<Vec<(u64, u64, u64)>, String> {
    let next = read_small(state, contract, 1)?;
    let mut rows = Vec::new();
    for id in 1..=next.min(32) {
        rows.push((id, read_small(state, contract, 100 + id)?, read_small(state, contract, 200 + id)?));
    }
    Ok(rows)
}

fn slot_word(value: u64) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[24..].copy_from_slice(&value.to_be_bytes());
    word
}

fn read_small(state: &State, contract: &Address, slot: u64) -> Result<u64, String> {
    let word = state.storage_word(contract, &slot_word(slot));
    if word[..24].iter().any(|byte| *byte != 0) {
        return Err("storage word is too wide".into());
    }
    Ok(u64::from_be_bytes(word[24..].try_into().map_err(|_| "short word")?))
}

struct Asm {
    code: Vec<u8>,
    labels: std::collections::BTreeMap<String, usize>,
    patches: Vec<(usize, String)>,
}

impl Asm {
    fn new() -> Self {
        Self { code: Vec::new(), labels: std::collections::BTreeMap::new(), patches: Vec::new() }
    }

    fn op(&mut self, opcode: u8) {
        self.code.push(opcode);
    }

    fn push_u128(&mut self, value: u128) {
        let raw = value.to_be_bytes();
        let start = raw.iter().position(|byte| *byte != 0).unwrap_or(raw.len() - 1);
        let bytes = &raw[start..];
        self.op(PUSH);
        self.op(bytes.len() as u8);
        self.code.extend_from_slice(bytes);
    }

    fn push_label(&mut self, name: &str) {
        self.op(PUSH);
        self.op(2);
        self.patches.push((self.code.len(), name.to_string()));
        self.code.extend_from_slice(&[0, 0]);
    }

    fn label(&mut self, name: &str) {
        self.op(JUMPDEST);
        self.labels.insert(name.to_string(), self.code.len() - 1);
    }

    fn jumpi(&mut self, name: &str) {
        self.push_label(name);
        self.op(JUMPI);
    }

    fn sload(&mut self, slot: u64) {
        self.push_u128(u128::from(slot));
        self.op(SLOAD);
    }

    fn sstore_slot(&mut self, slot: u64) {
        self.push_u128(u128::from(slot));
        self.op(SSTORE);
    }

    fn load_call(&mut self, offset: u64) {
        self.push_u128(u128::from(offset));
        self.op(CALLDATALOAD);
    }

    fn selector(&mut self, id: u64, label: &str) {
        self.load_call(0);
        self.push_u128(u128::from(id));
        self.op(EQ);
        self.jumpi(label);
    }

    fn bump(&mut self) {
        self.op(DUP);
        self.op(SLOAD);
        self.push_u128(1);
        self.op(ADD);
        self.op(SWAP);
        self.op(SSTORE);
    }

    fn finish(mut self) -> Vec<u8> {
        for (at, name) in &self.patches {
            let dest = self.labels.get(name).copied().unwrap_or_else(|| panic!("missing label {name}"));
            let bytes = u16::try_from(dest).expect("bytecode exceeded 65535 bytes").to_be_bytes();
            self.code[*at] = bytes[0];
            self.code[*at + 1] = bytes[1];
        }
        self.code
    }
}

#[cfg(test)]
fn word_u64(value: u64) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[24..].copy_from_slice(&value.to_be_bytes());
    word
}

#[cfg(test)]
fn word_addr(address: &Address) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[12..].copy_from_slice(address);
    word
}

#[cfg(test)]
fn calldata(words: &[[u8; 32]]) -> Vec<u8> {
    let mut out = Vec::with_capacity(words.len() * 32);
    for word in words {
        out.extend_from_slice(word);
    }
    out
}

#[cfg(test)]
fn deploy(state: &mut State, caller: Address, value: u128, code: &[u8], time: u64) -> Address {
    let nonce = state.get(&caller).nonce;
    let address = contract_address(&caller, nonce);
    let mut draft = state.clone();
    let mut account = draft.get(&caller);
    if account.balance < value {
        panic!("deployer is underfunded");
    }
    account.balance -= value;
    account.nonce += 1;
    draft.accounts.insert(encode_hex(&caller), account);
    if value > 0 {
        draft.credit(&address, value).unwrap();
    }
    let env = Env { caller, address, value, timestamp: time, depth: 0 };
    execute(&mut draft, &env, code, &[], 1_000_000).expect("constructor");
    let entry = draft.accounts.entry(encode_hex(&address)).or_insert(Account {
        balance: 0,
        nonce: 0,
        code: String::new(),
        admin: String::new(),
        history: Vec::new(),
    });
    entry.code = encode_hex(code);
    *state = draft;
    address
}

#[cfg(test)]
fn call(state: &mut State, contract: Address, caller: Address, value: u128, data: &[u8], time: u64) -> Result<Exec, Halt> {
    let mut draft = state.clone();
    if value > 0 {
        let mut account = draft.get(&caller);
        if account.balance < value {
            return Err(Halt::Revert { gas_used: 0, reason: "underfunded".into() });
        }
        account.balance -= value;
        draft.accounts.insert(encode_hex(&caller), account);
        draft.credit(&contract, value).map_err(|reason| Halt::Revert { gas_used: 0, reason })?;
    }
    let code = decode_hex(&draft.code(&contract)).unwrap_or_default();
    let env = Env { caller, address: contract, value, timestamp: time, depth: 0 };
    match execute(&mut draft, &env, &code, data, 1_000_000) {
        Ok(exec) => {
            *state = draft;
            Ok(exec)
        }
        Err(halt) => Err(halt),
    }
}

#[cfg(test)]
fn stored_u64(state: &State, contract: &Address, slot: u64) -> u64 {
    let word = state.storage_word(contract, &word_u64(slot));
    u64::from_be_bytes(word[24..].try_into().unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fund(state: &mut State, address: Address, amount: u128) {
        state.credit(&address, amount).unwrap();
    }

    #[test]
    fn token_transfer_updates_balances_and_rejects_an_overspend() {
        let mut state = State::default();
        let alice = [1u8; 20];
        let bob = [2u8; 20];
        fund(&mut state, alice, 1);
        let token = deploy(&mut state, alice, 0, &token_bytecode(), 10);
        assert_eq!(stored_u64(&state, &token, 1), TOKEN_SUPPLY as u64);
        assert_eq!(state.storage_word(&token, &word_addr(&alice))[24..], 1_000_000u64.to_be_bytes());
        let moved = call(
            &mut state,
            token,
            alice,
            0,
            &calldata(&[word_u64(2), word_addr(&bob), word_u64(40)]),
            11,
        )
        .unwrap();
        assert_eq!(moved.logs.len(), 1);
        assert_eq!(moved.logs[0].topic, encode_hex(&word_addr(&bob)));
        assert_eq!(state.storage_word(&token, &word_addr(&bob))[31], 40);
        assert!(call(&mut state, token, alice, 0, &calldata(&[word_u64(2), word_addr(&bob), word_u64(TOKEN_SUPPLY as u64)]), 12).is_err());
        assert_eq!(state.storage_word(&token, &word_addr(&bob))[31], 40);
    }

    #[test]
    fn vesting_pays_nothing_at_the_cliff_and_then_linearly() {
        let mut state = State::default();
        let alice = [3u8; 20];
        fund(&mut state, alice, VEST_TOTAL);
        let start = 5_000u64;
        let vest = deploy(&mut state, alice, VEST_TOTAL, &vesting_bytecode(), start);
        call(&mut state, vest, alice, 0, &calldata(&[word_u64(1)]), start + VEST_CLIFF_MS).unwrap();
        assert_eq!(state.get(&alice).balance, 0);
        call(&mut state, vest, alice, 0, &calldata(&[word_u64(1)]), start + VEST_CLIFF_MS + VEST_PERIOD_MS / 2).unwrap();
        assert_eq!(state.get(&alice).balance, VEST_TOTAL / 2);
        call(&mut state, vest, alice, 0, &calldata(&[word_u64(1)]), start + VEST_CLIFF_MS + VEST_PERIOD_MS + 50).unwrap();
        assert_eq!(state.get(&alice).balance, VEST_TOTAL);
        assert_eq!(state.get(&vest).balance, 0);
    }

    #[test]
    fn curve_buy_and_sell_keep_the_constant_product_fee() {
        let mut state = State::default();
        let alice = [4u8; 20];
        fund(&mut state, alice, 1_000);
        let curve = deploy(&mut state, alice, 0, &curve_bytecode(), 20);
        let bought = call(&mut state, curve, alice, 100, &calldata(&[word_u64(1)]), 21).unwrap();
        assert_eq!(bought.logs.len(), 1);
        assert_eq!(state.storage_word(&curve, &word_addr(&alice))[31], 91);
        assert_eq!(stored_u64(&state, &curve, 1), 1_099);
        assert_eq!(stored_u64(&state, &curve, 2), 909);
        assert_eq!(state.get(&curve).balance, 100);
        call(&mut state, curve, alice, 0, &calldata(&[word_u64(2), word_u64(91)]), 22).unwrap();
        assert_eq!(state.storage_word(&curve, &word_addr(&alice))[31], 0);
        assert_eq!(state.get(&alice).balance, 1_000 - 100 + 99);
        assert_eq!(state.get(&curve).balance, 1);
        assert_eq!(stored_u64(&state, &curve, 1), 1_000);
        assert_eq!(stored_u64(&state, &curve, 2), 1_000);
    }

    #[test]
    fn governance_counts_one_ballot_per_account() {
        let mut state = State::default();
        let alice = [5u8; 20];
        let bob = [6u8; 20];
        let gov = deploy(&mut state, alice, 0, &governance_bytecode(), 30);
        let proposed = call(&mut state, gov, alice, 0, &calldata(&[word_u64(1)]), 31).unwrap();
        assert_eq!(proposed.logs.len(), 1);
        assert_eq!(stored_u64(&state, &gov, 1), 1);
        call(&mut state, gov, alice, 0, &calldata(&[word_u64(2), word_u64(1), word_u64(1)]), 32).unwrap();
        call(&mut state, gov, bob, 0, &calldata(&[word_u64(2), word_u64(1), word_u64(0)]), 33).unwrap();
        assert!(call(&mut state, gov, alice, 0, &calldata(&[word_u64(2), word_u64(1), word_u64(1)]), 34).is_err());
        assert_eq!(stored_u64(&state, &gov, 101), 1);
        assert_eq!(stored_u64(&state, &gov, 201), 1);
        assert_eq!(governance_tally(&state, &gov).unwrap(), vec![(1, 1, 1)]);
    }

    #[test]
    fn a_simulated_call_reads_a_balance_without_changing_it() {
        let mut state = State::default();
        let alice = [1u8; 20];
        fund(&mut state, alice, 1);
        let token = deploy(&mut state, alice, 0, &token_bytecode(), 10);
        let before = state.root();
        let sim = state.simulate_call(&alice, &token, 0, 100_000, &calldata(&[word_u64(1), word_addr(&alice)]), 11);
        assert_eq!(sim.status, "ok");
        assert_eq!(sim.return_data, word_u64(TOKEN_SUPPLY as u64));
        assert_eq!(state.root(), before);
    }

    #[test]
    fn nft_mint_and_transfer_follow_the_owner() {
        let mut state = State::default();
        let alice = [7u8; 20];
        let bob = [8u8; 20];
        let nft = deploy(&mut state, alice, 0, &nft_bytecode(), 40);
        let minted = call(&mut state, nft, alice, 0, &calldata(&[word_u64(2)]), 41).unwrap();
        assert_eq!(minted.logs.len(), 1);
        assert_eq!(stored_u64(&state, &nft, 1), 1);
        assert_eq!(state.storage_word(&nft, &word_u64(1001)), word_addr(&alice));
        let owned = call(&mut state, nft, alice, 0, &calldata(&[word_u64(1), word_u64(1)]), 42).unwrap();
        assert_eq!(owned.return_data, word_addr(&alice));
        call(&mut state, nft, alice, 0, &calldata(&[word_u64(3), word_u64(1), word_addr(&bob)]), 43).unwrap();
        assert_eq!(state.storage_word(&nft, &word_u64(1001)), word_addr(&bob));
        assert!(call(&mut state, nft, alice, 0, &calldata(&[word_u64(3), word_u64(1), word_addr(&alice)]), 44).is_err());
        assert_eq!(state.storage_word(&nft, &word_u64(1001)), word_addr(&bob));
    }

    #[test]
    fn a_reader_contract_calls_identity_and_returns_the_name() {
        let mut state = State::default();
        let alice = [9u8; 20];
        let identity = deploy(&mut state, alice, 0, &identity_bytecode(), 50);
        call(&mut state, identity, alice, 0, &calldata(&[word_u64(1), word_u64(42)]), 51).unwrap();
        assert_eq!(state.storage_word(&identity, &word_addr(&alice)), word_u64(42));
        let reader = deploy(&mut state, alice, 0, &identity_reader_bytecode(), 52);
        call(&mut state, reader, alice, 0, &calldata(&[word_u64(1), word_addr(&identity)]), 53).unwrap();
        let read = call(&mut state, reader, alice, 0, &calldata(&[word_u64(2), word_addr(&alice)]), 54).unwrap();
        assert_eq!(read.return_data, word_u64(42).to_vec());
    }

    #[test]
    fn a_token_transfer_is_still_there_after_the_chain_reopens() {
        use crate::chain::Chain;
        use crate::keys::{address_of, generate_signing_key};
        use crate::tx::{sign_contract, sign_tx};

        let dir = std::env::temp_dir().join(format!("zendo-token-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut chain = Chain::open_or_create(&dir, "test", 1_000).unwrap();
        let user_key = generate_signing_key();
        let user = address_of(&user_key.verifying_key());
        let bob = address_of(&generate_signing_key().verifying_key());
        let faucet = chain.signing_key().unwrap();
        chain.push_tx(sign_tx(&faucet, 0, user, 200_000, 1)).unwrap();
        let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
        chain.produce(when).unwrap().expect("fund");
        let code = token_bytecode();
        let token = contract_address(&user, 0);
        chain.push_tx(sign_contract(&user_key, 0, [0u8; 20], 0, 100_000, &code)).unwrap();
        chain.push_tx(sign_contract(&user_key, 1, token, 0, 100_000, &calldata(&[word_u64(2), word_addr(&bob), word_u64(25)]))).unwrap();
        let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
        chain.produce(when).unwrap().expect("contracts");
        assert_eq!(chain.state.storage_word(&token, &word_addr(&bob))[31], 25);
        let reopened = Chain::open_or_create(&dir, "test", 1_000).unwrap();
        assert_eq!(reopened.state.storage_word(&token, &word_addr(&bob))[31], 25);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
