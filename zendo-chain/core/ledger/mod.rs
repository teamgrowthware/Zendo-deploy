use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::state_machine::{Machine, Receipt, Transaction};

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Record {
    tx: Transaction,
    receipt: Receipt,
}

pub struct Writer {
    path: PathBuf,
    pub machine: Machine,
}

impl Writer {
    pub fn open(dir: &Path, treasury: &str) -> Result<Self, String> {
        fs::create_dir_all(dir).map_err(|err| err.to_string())?;
        let path = dir.join("blocks.jsonl");
        let mut machine = Machine::new(treasury);
        if path.exists() {
            for line in fs::read_to_string(&path).map_err(|err| err.to_string())?.lines() {
                if line.is_empty() {
                    continue;
                }
                let record: Record = serde_json::from_str(line).map_err(|err| err.to_string())?;
                machine.apply(record.tx)?;
            }
        }
        Ok(Self { path, machine })
    }

    pub fn commit(&mut self, tx: Transaction) -> Result<Receipt, String> {
        let receipt = self.machine.apply(tx.clone())?;
        let record = Record { tx, receipt: receipt.clone() };
        let mut file = OpenOptions::new().create(true).append(true).open(&self.path).map_err(|err| err.to_string())?;
        writeln!(file, "{}", serde_json::to_string(&record).map_err(|err| err.to_string())?).map_err(|err| err.to_string())?;
        Ok(receipt)
    }
}

pub struct Replica {
    pub machine: Machine,
}

impl Replica {
    pub fn follow(log: &Path, treasury: &str) -> Result<Self, String> {
        let mut machine = Machine::new(treasury);
        let text = fs::read_to_string(log).map_err(|err| err.to_string())?;
        for line in text.lines() {
            if line.is_empty() {
                continue;
            }
            let record: Record = serde_json::from_str(line).map_err(|err| err.to_string())?;
            machine.apply(record.tx)?;
        }
        Ok(Self { machine })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state_machine::Transaction;

    #[test]
    fn replica_matches_writer_and_does_not_create_a_second_log() {
        let dir = std::env::temp_dir().join(format!("zendo-ledger-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let treasury = "znd111111111111111111111111111111111111111";
        let account = "znd122222222222222222222222222222222222222";
        let mut writer = Writer::open(&dir, treasury).unwrap();
        writer.commit(Transaction::CreateAccount { address: account.into() }).unwrap();
        let replica = Replica::follow(&dir.join("blocks.jsonl"), treasury).unwrap();
        assert_eq!(replica.machine.state.height, writer.machine.state.height);
        assert!(replica.machine.state.accounts.contains_key(account));
        let _ = fs::remove_dir_all(&dir);
    }
}
