use crate::codec::{decode_hex, encode_hex, sha256, Address};
use crate::state::{ContractLog, State};

pub const ZERO_ADDRESS: Address = [0u8; 20];
const MAX_CODE: usize = 24 * 1024;
const MAX_STACK: usize = 256;
const MAX_STEPS: usize = 10_000;
const MAX_DEPTH: u32 = 4;

pub const STOP: u8 = 0x00;
pub const PUSH: u8 = 0x01;
pub const ADD: u8 = 0x02;
pub const SUB: u8 = 0x03;
pub const MUL: u8 = 0x04;
pub const DIV: u8 = 0x05;
pub const EQ: u8 = 0x06;
pub const LT: u8 = 0x07;
pub const ISZERO: u8 = 0x08;
pub const DUP: u8 = 0x09;
pub const SWAP: u8 = 0x0a;
pub const POP: u8 = 0x0b;
pub const SLOAD: u8 = 0x0c;
pub const SSTORE: u8 = 0x0d;
pub const CALLER: u8 = 0x0e;
pub const ADDRESS: u8 = 0x0f;
pub const CALLVALUE: u8 = 0x10;
pub const BALANCE: u8 = 0x11;
pub const LOG: u8 = 0x12;
pub const REVERT: u8 = 0x13;
pub const RETURN: u8 = 0x14;
pub const JUMP: u8 = 0x15;
pub const JUMPI: u8 = 0x16;
pub const GAS: u8 = 0x17;
pub const TIMESTAMP: u8 = 0x18;
pub const CALL: u8 = 0x19;
pub const CALLDATA: u8 = 0x1a;
pub const JUMPDEST: u8 = 0x1b;
pub const CALLDATALOAD: u8 = 0x1c;
pub const SEND: u8 = 0x1d;

const GAS_FAST: u64 = 2;
const GAS_PUSH: u64 = 3;
const GAS_SLOAD: u64 = 50;
const GAS_SSTORE: u64 = 200;
const GAS_LOG: u64 = 100;
const GAS_CALL: u64 = 100;

#[derive(Clone, Debug)]
pub struct Env {
    pub caller: Address,
    pub address: Address,
    pub value: u128,
    pub timestamp: u64,
    pub depth: u32,
}

#[derive(Clone, Debug)]
pub struct Exec {
    pub gas_used: u64,
    pub return_data: Vec<u8>,
    pub logs: Vec<ContractLog>,
}

#[derive(Clone, Debug)]
pub enum Halt {
    OutOfGas,
    Fault(String),
    Revert { gas_used: u64, reason: String },
}

pub fn contract_address(sender: &Address, nonce: u64) -> Address {
    let mut material = Vec::with_capacity(12 + 20 + 8);
    material.extend_from_slice(b"ZENDO_CREATE");
    material.extend_from_slice(sender);
    material.extend_from_slice(&nonce.to_le_bytes());
    let digest = sha256(&material);
    let mut address = [0u8; 20];
    address.copy_from_slice(&digest[..20]);
    address
}

pub fn execute(state: &mut State, env: &Env, code: &[u8], calldata: &[u8], gas_limit: u64) -> Result<Exec, Halt> {
    if code.len() > MAX_CODE || calldata.len() > MAX_CODE {
        return Err(Halt::Fault("payload exceeds 24 KiB".into()));
    }
    let mut machine = Machine {
        stack: Vec::new(),
        logs: Vec::new(),
        return_data: Vec::new(),
        gas_left: gas_limit,
        gas_used: 0,
    };
    let dests = jumpdests(code);
    let mut pc = 0;
    for _ in 0..MAX_STEPS {
        if pc >= code.len() {
            return Ok(machine.finish());
        }
        let op = code[pc];
        pc += 1;
        match op {
            STOP => return Ok(machine.finish()),
            JUMPDEST => {}
            PUSH => {
                machine.charge(GAS_PUSH)?;
                if pc >= code.len() {
                    return Err(Halt::Fault("truncated push".into()));
                }
                let len = code[pc] as usize;
                pc += 1;
                if len == 0 || len > 32 || pc + len > code.len() {
                    return Err(Halt::Fault("truncated push".into()));
                }
                let mut word = [0u8; 32];
                word[32 - len..].copy_from_slice(&code[pc..pc + len]);
                pc += len;
                machine.push(word)?;
            }
            ADD | SUB | MUL | DIV => {
                machine.charge(GAS_FAST)?;
                let right = machine.pop()?;
                let left = machine.pop()?;
                let a = as_u128(left).map_err(|_| Halt::Revert { gas_used: machine.gas_used, reason: "word too wide".into() })?;
                let b = as_u128(right).map_err(|_| Halt::Revert { gas_used: machine.gas_used, reason: "word too wide".into() })?;
                let value = match op {
                    ADD => a.checked_add(b).ok_or_else(|| Halt::Revert { gas_used: machine.gas_used, reason: "overflow".into() })?,
                    SUB => a.checked_sub(b).ok_or_else(|| Halt::Revert { gas_used: machine.gas_used, reason: "underflow".into() })?,
                    MUL => a.checked_mul(b).ok_or_else(|| Halt::Revert { gas_used: machine.gas_used, reason: "overflow".into() })?,
                    DIV => {
                        if b == 0 {
                            return Err(Halt::Revert { gas_used: machine.gas_used, reason: "division by zero".into() });
                        }
                        a / b
                    }
                    _ => 0,
                };
                machine.push(from_u128(value))?;
            }
            EQ | LT => {
                machine.charge(GAS_FAST)?;
                let right = machine.pop()?;
                let left = machine.pop()?;
                let flag = match op {
                    EQ => left == right,
                    LT => as_u128(left).unwrap_or(0) < as_u128(right).unwrap_or(0),
                    _ => false,
                };
                machine.push(from_u128(u128::from(flag)))?;
            }
            ISZERO => {
                machine.charge(GAS_FAST)?;
                let word = machine.pop()?;
                machine.push(from_u128(u128::from(word == [0u8; 32])))?;
            }
            DUP => {
                machine.charge(GAS_FAST)?;
                let word = machine.pop()?;
                machine.push(word)?;
                machine.push(word)?;
            }
            SWAP => {
                machine.charge(GAS_FAST)?;
                let first = machine.pop()?;
                let second = machine.pop()?;
                machine.push(first)?;
                machine.push(second)?;
            }
            POP => {
                machine.charge(GAS_FAST)?;
                machine.pop()?;
            }
            SLOAD => {
                machine.charge(GAS_SLOAD)?;
                let slot = machine.pop()?;
                machine.push(state.storage_word(&env.address, &slot))?;
            }
            SSTORE => {
                machine.charge(GAS_SSTORE)?;
                let slot = machine.pop()?;
                let value = machine.pop()?;
                state.set_storage(&env.address, &slot, &value);
            }
            CALLER => {
                machine.charge(GAS_FAST)?;
                machine.push(from_address(&env.caller))?;
            }
            ADDRESS => {
                machine.charge(GAS_FAST)?;
                machine.push(from_address(&env.address))?;
            }
            CALLVALUE => {
                machine.charge(GAS_FAST)?;
                machine.push(from_u128(env.value))?;
            }
            BALANCE => {
                machine.charge(GAS_SLOAD)?;
                let word = machine.pop()?;
                let account = address_from_word(word);
                machine.push(from_u128(state.get(&account).balance))?;
            }
            LOG => {
                machine.charge(GAS_LOG)?;
                let topic = machine.pop()?;
                let data = machine.pop()?;
                machine.logs.push(ContractLog {
                    address: encode_hex(&env.address),
                    topic: encode_hex(&topic),
                    data: encode_hex(&data),
                });
            }
            REVERT => {
                return Err(Halt::Revert { gas_used: machine.gas_used, reason: "reverted".into() });
            }
            RETURN => {
                machine.charge(GAS_FAST)?;
                let word = machine.pop()?;
                machine.return_data = word.to_vec();
                return Ok(machine.finish());
            }
            JUMP | JUMPI => {
                machine.charge(GAS_FAST)?;
                let dest = machine.pop()?;
                let dest = as_u128(dest).map_err(|_| Halt::Fault("bad jump".into()))? as usize;
                let take = if op == JUMPI {
                    let cond = machine.pop()?;
                    cond != [0u8; 32]
                } else {
                    true
                };
                if take {
                    if !dests.contains(&dest) || dest >= code.len() || code[dest] != JUMPDEST {
                        return Err(Halt::Fault("jump destination is not a jumpdest".into()));
                    }
                    pc = dest;
                }
            }
            GAS => {
                machine.charge(GAS_FAST)?;
                machine.push(from_u128(u128::from(machine.gas_left)))?;
            }
            TIMESTAMP => {
                machine.charge(GAS_FAST)?;
                machine.push(from_u128(u128::from(env.timestamp)))?;
            }
            CALL => {
                machine.charge(GAS_CALL)?;
                let callee = address_from_word(machine.pop()?);
                let argument = machine.pop()?;
                let selector = machine.pop()?;
                if env.depth >= MAX_DEPTH {
                    machine.push(from_u128(0))?;
                    continue;
                }
                let stipend = machine.gas_left.min(4_000);
                machine.charge(stipend)?;
                let mut forwarded = selector.to_vec();
                forwarded.extend_from_slice(&argument);
                let code = decode_hex(&state.code(&callee)).unwrap_or_default();
                let mut child = state.clone();
                let child_env = Env {
                    caller: env.address,
                    address: callee,
                    value: 0,
                    timestamp: env.timestamp,
                    depth: env.depth + 1,
                };
                match execute(&mut child, &child_env, &code, &forwarded, stipend) {
                    Ok(exec) => {
                        let refund = stipend.saturating_sub(exec.gas_used);
                        machine.gas_left += refund;
                        machine.gas_used -= refund;
                        *state = child;
                        machine.logs.extend(exec.logs);
                        if exec.return_data.len() == 32 {
                            let mut word = [0u8; 32];
                            word.copy_from_slice(&exec.return_data);
                            machine.push(word)?;
                        } else {
                            machine.push(from_u128(1))?;
                        }
                    }
                    Err(Halt::Revert { gas_used, .. }) => {
                        let refund = stipend.saturating_sub(gas_used);
                        machine.gas_left += refund;
                        machine.gas_used -= refund;
                        machine.push(from_u128(0))?;
                    }
                    Err(_) => {
                        machine.push(from_u128(0))?;
                    }
                }
            }
            CALLDATA => {
                machine.charge(GAS_FAST)?;
                let mut word = [0u8; 32];
                let take = calldata.len().min(32);
                word[32 - take..].copy_from_slice(&calldata[..take]);
                machine.push(word)?;
            }
            CALLDATALOAD => {
                machine.charge(GAS_FAST)?;
                let offset_word = machine.pop()?;
                let offset = as_u128(offset_word).map_err(|_| Halt::Fault("bad calldata offset".into()))? as usize;
                let mut word = [0u8; 32];
                if offset < calldata.len() {
                    let end = offset.saturating_add(32).min(calldata.len());
                    let take = end - offset;
                    word[32 - take..].copy_from_slice(&calldata[offset..end]);
                }
                machine.push(word)?;
            }
            SEND => {
                machine.charge(GAS_SSTORE)?;
                let amount_word = machine.pop()?;
                let amount = as_u128(amount_word).map_err(|_| Halt::Revert {
                    gas_used: machine.gas_used,
                    reason: "send amount is too wide".into(),
                })?;
                let mut holder = state.get(&env.address);
                if holder.balance < amount {
                    return Err(Halt::Revert { gas_used: machine.gas_used, reason: "contract balance too low".into() });
                }
                holder.balance -= amount;
                state.accounts.insert(encode_hex(&env.address), holder);
                state.credit(&env.caller, amount).map_err(|reason| Halt::Revert { gas_used: machine.gas_used, reason })?;
            }
            _ => return Err(Halt::Fault(format!("unknown opcode {op:#x}"))),
        }
    }
    Err(Halt::Fault("step limit".into()))
}

struct Machine {
    stack: Vec<[u8; 32]>,
    logs: Vec<ContractLog>,
    return_data: Vec<u8>,
    gas_left: u64,
    gas_used: u64,
}

impl Machine {
    fn charge(&mut self, cost: u64) -> Result<(), Halt> {
        if self.gas_left < cost {
            return Err(Halt::OutOfGas);
        }
        self.gas_left -= cost;
        self.gas_used += cost;
        Ok(())
    }

    fn push(&mut self, word: [u8; 32]) -> Result<(), Halt> {
        if self.stack.len() >= MAX_STACK {
            return Err(Halt::Fault("stack overflow".into()));
        }
        self.stack.push(word);
        Ok(())
    }

    fn pop(&mut self) -> Result<[u8; 32], Halt> {
        self.stack.pop().ok_or_else(|| Halt::Fault("stack underflow".into()))
    }

    fn finish(self) -> Exec {
        Exec {
            gas_used: self.gas_used,
            return_data: self.return_data,
            logs: self.logs,
        }
    }
}

fn jumpdests(code: &[u8]) -> std::collections::HashSet<usize> {
    let mut dests = std::collections::HashSet::new();
    let mut pc = 0;
    while pc < code.len() {
        if code[pc] == PUSH {
            pc += 1;
            if pc >= code.len() {
                break;
            }
            let len = code[pc] as usize;
            pc += 1 + len;
            continue;
        }
        if code[pc] == JUMPDEST {
            dests.insert(pc);
        }
        pc += 1;
    }
    dests
}

fn as_u128(word: [u8; 32]) -> Result<u128, ()> {
    if word[..16].iter().any(|byte| *byte != 0) {
        return Err(());
    }
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&word[16..]);
    Ok(u128::from_be_bytes(bytes))
}

fn from_u128(value: u128) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[16..].copy_from_slice(&value.to_be_bytes());
    word
}

fn from_address(address: &Address) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[12..].copy_from_slice(address);
    word
}

fn address_from_word(word: [u8; 32]) -> Address {
    let mut address = [0u8; 20];
    address.copy_from_slice(&word[12..]);
    address
}

#[cfg(test)]
mod tests {
    use super::*;

    fn push_u64(code: &mut Vec<u8>, value: u64) {
        let raw = value.to_be_bytes();
        let start = raw.iter().position(|byte| *byte != 0).unwrap_or(raw.len() - 1);
        let bytes = &raw[start..];
        code.push(PUSH);
        code.push(bytes.len() as u8);
        code.extend_from_slice(bytes);
    }

    fn env() -> Env {
        Env {
            caller: [7u8; 20],
            address: [9u8; 20],
            value: 0,
            timestamp: 50,
            depth: 0,
        }
    }

    #[test]
    fn storage_log_and_revert_follow_gas() {
        let mut code = Vec::new();
        push_u64(&mut code, 0);
        code.push(SLOAD);
        push_u64(&mut code, 1);
        code.push(ADD);
        push_u64(&mut code, 0);
        code.push(SSTORE);
        push_u64(&mut code, 4);
        push_u64(&mut code, 9);
        code.push(LOG);
        code.push(STOP);
        let mut state = State::default();
        let exec = execute(&mut state, &env(), &code, &[], 10_000).unwrap();
        assert_eq!(exec.gas_used, GAS_SLOAD + GAS_PUSH * 5 + GAS_FAST + GAS_SSTORE + GAS_LOG);
        assert_eq!(exec.logs.len(), 1);
        assert_eq!(state.storage_word(&[9u8; 20], &[0u8; 32])[31], 1);

        let mut reverted = State::default();
        let halt = execute(&mut reverted, &env(), &[REVERT], &[], 10_000).unwrap_err();
        match halt {
            Halt::Revert { gas_used, .. } => assert_eq!(gas_used, 0),
            other => panic!("expected revert, got {other:?}"),
        }
        assert!(execute(&mut State::default(), &env(), &[0xff], &[], 40).is_err());
        assert!(matches!(execute(&mut State::default(), &env(), &code, &[], 10).unwrap_err(), Halt::OutOfGas));
    }
}
