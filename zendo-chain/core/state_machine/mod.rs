use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::external_registry::{validate_asset, ExternalAsset};
use crate::fee_engine::{charge, trade_fee, FeeSchedule};

pub const ZENDO_COIN: &str = "ZCOIN";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Account {
    pub address: String,
    pub nonce: u64,
    pub balances: BTreeMap<String, u128>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct MemeCoin {
    pub id: String,
    pub symbol: String,
    pub creator: String,
    pub reserve_z: u128,
    pub reserve_token: u128,
    pub graduated: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChainState {
    pub height: u64,
    pub treasury: String,
    pub fees: FeeSchedule,
    pub accounts: BTreeMap<String, Account>,
    pub memes: BTreeMap<String, MemeCoin>,
    pub registry: Vec<ExternalAsset>,
    pub seen: BTreeSet<String>,
    pub quarantine: Vec<Quarantine>,
    pub revenue: BTreeMap<String, u128>,
    pub metrics: Metrics,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct Metrics {
    pub ingested: u64,
    pub minted: u64,
    pub burned: u64,
    pub quarantined: u64,
    pub fees: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Quarantine {
    pub key: String,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum Transaction {
    CreateAccount { address: String },
    Transfer { from: String, to: String, asset: String, amount: u128, nonce: u64 },
    LaunchMeme { creator: String, id: String, symbol: String, nonce: u64 },
    Trade { trader: String, meme: String, buy: bool, amount: u128, nonce: u64 },
    Boost { trader: String, meme: String, nonce: u64 },
    Graduate { trader: String, meme: String, nonce: u64 },
    List { seller: String, meme: String, nonce: u64 },
    Stake { from: String, amount: u128, nonce: u64 },
    Govern { from: String, nonce: u64 },
    RegisterAsset { admin: bool, asset: ExternalAsset },
    Observe { observations: Vec<Observation> },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Observation {
    pub source: String,
    pub asset_id: String,
    pub kind: String,
    pub tx_hash: String,
    pub log_index: u32,
    pub block_number: u64,
    pub head_number: u64,
    pub topic: String,
    pub token: String,
    pub amount: u128,
    pub zendo_account: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Receipt {
    pub height: u64,
    pub summary: String,
}

pub struct Machine {
    pub state: ChainState,
}

impl Machine {
    pub fn new(treasury: impl Into<String>) -> Self {
        let treasury = treasury.into();
        let mut accounts = BTreeMap::new();
        accounts.insert(treasury.clone(), empty_account(&treasury));
        Self {
            state: ChainState {
                height: 0,
                treasury,
                fees: FeeSchedule::default(),
                accounts,
                memes: BTreeMap::new(),
                registry: Vec::new(),
                seen: BTreeSet::new(),
                quarantine: Vec::new(),
                revenue: BTreeMap::new(),
                metrics: Metrics::default(),
            },
        }
    }

    pub fn apply(&mut self, tx: Transaction) -> Result<Receipt, String> {
        let saved = self.state.clone();
        match self.dispatch(tx) {
            Ok(receipt) => Ok(receipt),
            Err(err) => {
                self.state = saved;
                Err(err)
            }
        }
    }

    fn dispatch(&mut self, tx: Transaction) -> Result<Receipt, String> {
        match tx {
            Transaction::CreateAccount { address } => self.create_account(address),
            Transaction::Transfer { from, to, asset, amount, nonce } => self.transfer(from, to, asset, amount, nonce),
            Transaction::LaunchMeme { creator, id, symbol, nonce } => self.launch(creator, id, symbol, nonce),
            Transaction::Trade { trader, meme, buy, amount, nonce } => self.trade(trader, meme, buy, amount, nonce),
            Transaction::Boost { trader, meme, nonce } => self.flat_fee(trader, meme, nonce, self.state.fees.boost, "boost"),
            Transaction::Graduate { trader, meme, nonce } => self.graduate(trader, meme, nonce),
            Transaction::List { seller, meme, nonce } => self.flat_fee(seller, meme, nonce, self.state.fees.listing, "listing"),
            Transaction::Stake { from, amount, nonce } => self.stake(from, amount, nonce),
            Transaction::Govern { from, nonce } => self.govern(from, nonce),
            Transaction::RegisterAsset { admin, asset } => self.register(admin, asset),
            Transaction::Observe { observations } => self.observe(observations),
        }
    }

    fn bump(&mut self, summary: String) -> Receipt {
        self.state.height += 1;
        Receipt { height: self.state.height, summary }
    }

    fn create_account(&mut self, address: String) -> Result<Receipt, String> {
        check_address(&address)?;
        if self.state.accounts.contains_key(&address) {
            return Err("Account already exists.".into());
        }
        self.state.accounts.insert(address.clone(), empty_account(&address));
        Ok(self.bump(format!("account {address}")))
    }

    fn take_nonce(&mut self, address: &str, nonce: u64) -> Result<(), String> {
        let account = self.state.accounts.get_mut(address).ok_or("Unknown account.")?;
        if account.nonce != nonce {
            return Err("Bad nonce. Replay rejected.".into());
        }
        account.nonce += 1;
        Ok(())
    }

    fn credit(&mut self, address: &str, asset: &str, amount: u128) -> Result<(), String> {
        let account = self.state.accounts.get_mut(address).ok_or("Unknown account.")?;
        let entry = account.balances.entry(asset.to_string()).or_insert(0);
        *entry = entry.checked_add(amount).ok_or("Balance overflow.")?;
        Ok(())
    }

    fn debit(&mut self, address: &str, asset: &str, amount: u128) -> Result<(), String> {
        if amount == 0 {
            return Err("Amount must be positive.".into());
        }
        let account = self.state.accounts.get_mut(address).ok_or("Unknown account.")?;
        let entry = account.balances.get_mut(asset).ok_or("Insufficient balance.")?;
        if *entry < amount {
            return Err("Insufficient balance.".into());
        }
        *entry -= amount;
        Ok(())
    }

    fn pay_fee(&mut self, from: &str, asset: &str, amount: u128, reason: &str) -> Result<(), String> {
        let fee = charge(asset, amount, reason)?;
        self.debit(from, &fee.asset, fee.amount)?;
        let treasury = self.state.treasury.clone();
        self.credit(&treasury, &fee.asset, fee.amount)?;
        *self.state.revenue.entry(fee.asset).or_insert(0) += fee.amount;
        self.state.metrics.fees += 1;
        Ok(())
    }

    fn transfer(&mut self, from: String, to: String, asset: String, amount: u128, nonce: u64) -> Result<Receipt, String> {
        check_address(&from)?;
        check_address(&to)?;
        self.take_nonce(&from, nonce)?;
        self.debit(&from, &asset, amount)?;
        self.credit(&to, &asset, amount)?;
        Ok(self.bump(format!("transfer {amount} {asset}")))
    }

    fn launch(&mut self, creator: String, id: String, symbol: String, nonce: u64) -> Result<Receipt, String> {
        check_address(&creator)?;
        if self.state.memes.contains_key(&id) {
            return Err("Meme coin already exists.".into());
        }
        self.take_nonce(&creator, nonce)?;
        let fee = self.state.fees.launch;
        self.pay_fee(&creator, ZENDO_COIN, fee, "launch")?;
        self.state.memes.insert(
            id.clone(),
            MemeCoin {
                id: id.clone(),
                symbol,
                creator: creator.clone(),
                reserve_z: 1_000_000,
                reserve_token: 1_000_000_000,
                graduated: false,
            },
        );
        self.credit(&creator, &id, 1_000_000_000)?;
        Ok(self.bump(format!("launch {id}")))
    }

    fn trade(&mut self, trader: String, meme: String, buy: bool, amount: u128, nonce: u64) -> Result<Receipt, String> {
        self.take_nonce(&trader, nonce)?;
        let coin = self.state.memes.get(&meme).cloned().ok_or("Unknown meme coin.")?;
        if coin.graduated {
            return Err("Graduated coins trade in the pool, not this curve.".into());
        }
        let fee = trade_fee(amount, self.state.fees.trade_bps);
        if buy {
            self.pay_fee(&trader, ZENDO_COIN, fee.max(1), "trade")?;
            let net = amount;
            self.debit(&trader, ZENDO_COIN, net)?;
            let out = (coin.reserve_token.saturating_mul(net)) / coin.reserve_z.saturating_add(net);
            if out == 0 {
                return Err("Trade is too small.".into());
            }
            let coin = self.state.memes.get_mut(&meme).unwrap();
            coin.reserve_z += net;
            coin.reserve_token -= out;
            self.credit(&trader, &meme, out)?;
        } else {
            self.debit(&trader, &meme, amount)?;
            let out = (coin.reserve_z.saturating_mul(amount)) / coin.reserve_token.saturating_add(amount);
            if out == 0 {
                return Err("Trade is too small.".into());
            }
            let coin = self.state.memes.get_mut(&meme).unwrap();
            coin.reserve_token += amount;
            coin.reserve_z -= out;
            let fee = trade_fee(out, self.state.fees.trade_bps).max(1);
            if out <= fee {
                return Err("Trade output does not cover the fee.".into());
            }
            self.credit(&trader, ZENDO_COIN, out - fee)?;
            let treasury = self.state.treasury.clone();
            self.credit(&treasury, ZENDO_COIN, fee)?;
            *self.state.revenue.entry(ZENDO_COIN.to_string()).or_insert(0) += fee;
            self.state.metrics.fees += 1;
        }
        Ok(self.bump(format!("trade {meme}")))
    }

    fn flat_fee(&mut self, from: String, _meme: String, nonce: u64, amount: u128, reason: &str) -> Result<Receipt, String> {
        self.take_nonce(&from, nonce)?;
        self.pay_fee(&from, ZENDO_COIN, amount, reason)?;
        Ok(self.bump(reason.to_string()))
    }

    fn graduate(&mut self, from: String, meme: String, nonce: u64) -> Result<Receipt, String> {
        self.take_nonce(&from, nonce)?;
        let coin = self.state.memes.get_mut(&meme).ok_or("Unknown meme coin.")?;
        if coin.graduated {
            return Err("Already graduated.".into());
        }
        coin.graduated = true;
        Ok(self.bump(format!("graduate {meme}")))
    }

    fn stake(&mut self, from: String, amount: u128, nonce: u64) -> Result<Receipt, String> {
        self.take_nonce(&from, nonce)?;
        let fee = trade_fee(amount, self.state.fees.stake_bps);
        if fee > 0 {
            self.pay_fee(&from, ZENDO_COIN, fee, "stake")?;
        }
        self.debit(&from, ZENDO_COIN, amount)?;
        Ok(self.bump("stake".into()))
    }

    fn govern(&mut self, from: String, nonce: u64) -> Result<Receipt, String> {
        self.take_nonce(&from, nonce)?;
        let fee = self.state.fees.govern;
        self.pay_fee(&from, ZENDO_COIN, fee, "govern")?;
        Ok(self.bump("govern".into()))
    }

    fn register(&mut self, admin: bool, asset: ExternalAsset) -> Result<Receipt, String> {
        if !admin {
            return Err("Only an operator can register an external asset.".into());
        }
        validate_asset(&asset)?;
        if self.state.registry.iter().any(|row| row.id == asset.id) {
            return Err("That synthetic id is already registered.".into());
        }
        let id = asset.id.clone();
        self.state.registry.push(asset);
        Ok(self.bump(format!("register {id}")))
    }

    fn observe(&mut self, observations: Vec<Observation>) -> Result<Receipt, String> {
        self.state.metrics.ingested += 1;
        if observations.len() < 2 {
            return Err("Two independent observations are required.".into());
        }
        let first = &observations[0];
        let asset = self
            .state
            .registry
            .iter()
            .find(|row| row.id == first.asset_id)
            .cloned()
            .ok_or("Unknown external asset.")?;
        if !asset.enabled {
            return Err("That asset is disabled.".into());
        }
        let key = format!("{}:{}:{}", asset.chain, first.tx_hash, first.log_index);
        if self.state.seen.contains(&key) {
            return Err("Event already applied. Replay rejected.".into());
        }
        let mut hosts = BTreeSet::new();
        for row in &observations {
            if row.asset_id != first.asset_id
                || row.kind != first.kind
                || row.tx_hash != first.tx_hash
                || row.log_index != first.log_index
                || row.amount != first.amount
                || row.zendo_account != first.zendo_account
                || row.token.to_lowercase() != first.token.to_lowercase()
                || row.topic.to_lowercase() != first.topic.to_lowercase()
            {
                self.state.quarantine.push(Quarantine { key: key.clone(), reason: "Sources disagree.".into() });
                self.state.metrics.quarantined += 1;
                self.state.seen.insert(key);
                return Ok(self.bump("quarantine".into()));
            }
            if row.head_number < row.block_number || row.head_number - row.block_number + 1 < u64::from(asset.confirmations) {
                self.state.quarantine.push(Quarantine { key: key.clone(), reason: "Not enough confirmations.".into() });
                self.state.metrics.quarantined += 1;
                self.state.seen.insert(key);
                return Ok(self.bump("quarantine".into()));
            }
            if row.topic.to_lowercase() != asset.topic.to_lowercase() || row.token.to_lowercase() != asset.token.to_lowercase() {
                return Err("Event does not match the registry.".into());
            }
            hosts.insert(host_of(&row.source));
        }
        if hosts.len() < usize::from(asset.min_sources) {
            return Err("Not enough independent RPC sources.".into());
        }
        check_address(&first.zendo_account)?;
        if !self.state.accounts.contains_key(&first.zendo_account) {
            return Err("Unknown Zendo account.".into());
        }
        self.state.seen.insert(key);
        let account = first.zendo_account.clone();
        let synthetic = format!("syn:{}", asset.id);
        if first.kind == "deposit" {
            self.credit(&account, &synthetic, first.amount)?;
            self.state.metrics.minted += 1;
            log_event("mint", &asset.id, first.amount);
            Ok(self.bump(format!("mint {synthetic}")))
        } else if first.kind == "withdraw" {
            self.debit(&account, &synthetic, first.amount)?;
            self.state.metrics.burned += 1;
            log_event("burn", &asset.id, first.amount);
            Ok(self.bump(format!("burn {synthetic}")))
        } else {
            Err("Kind must be deposit or withdraw.".into())
        }
    }

    pub fn balance(&self, address: &str, asset: &str) -> u128 {
        self.state
            .accounts
            .get(address)
            .and_then(|account| account.balances.get(asset))
            .copied()
            .unwrap_or(0)
    }
}

fn empty_account(address: &str) -> Account {
    Account { address: address.to_string(), nonce: 0, balances: BTreeMap::new() }
}

pub fn check_address(address: &str) -> Result<(), String> {
    let rest = address.strip_prefix("znd1").ok_or("Address must start with znd1.")?;
    if rest.len() == 38 && rest.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Address is not a Zendo account.".into())
    }
}

fn host_of(source: &str) -> String {
    let stripped = source.trim_start_matches("https://").trim_start_matches("http://");
    stripped.split('/').next().unwrap_or(source).to_lowercase()
}

fn log_event(kind: &str, asset: &str, amount: u128) {
    eprintln!("{{\"component\":\"oracle\",\"kind\":\"{kind}\",\"asset\":\"{asset}\",\"amount\":{amount}}}");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::external_registry::example_registry;

    fn addr(byte: u8) -> String {
        format!("znd1{:038x}", byte)
    }

    fn machine() -> Machine {
        let mut machine = Machine::new(addr(1));
        machine.apply(Transaction::CreateAccount { address: addr(2) }).unwrap();
        machine.credit(&addr(2), ZENDO_COIN, 10_000_000_000_000_000_000).unwrap();
        machine
    }

    fn obs(kind: &str, head: u64) -> Observation {
        Observation {
            source: "https://rpc-a.example".into(),
            asset_id: "ethereum.slot.0001".into(),
            kind: kind.into(),
            tx_hash: "0xabc".into(),
            log_index: 1,
            block_number: 100,
            head_number: head,
            topic: format!("0x{:064x}", 1),
            token: format!("0x{:040x}", 1),
            amount: 5,
            zendo_account: addr(2),
        }
    }

    #[test]
    fn replay_and_double_spend_are_rejected() {
        let mut machine = machine();
        machine
            .apply(Transaction::Transfer {
                from: addr(2),
                to: addr(1),
                asset: ZENDO_COIN.into(),
                amount: 1,
                nonce: 0,
            })
            .unwrap();
        let again = machine.apply(Transaction::Transfer {
            from: addr(2),
            to: addr(1),
            asset: ZENDO_COIN.into(),
            amount: 1,
            nonce: 0,
        });
        assert!(again.unwrap_err().contains("Replay"));
        let too_much = machine.apply(Transaction::Transfer {
            from: addr(2),
            to: addr(1),
            asset: ZENDO_COIN.into(),
            amount: u128::MAX,
            nonce: 1,
        });
        assert!(too_much.unwrap_err().contains("Insufficient"));
    }

    #[test]
    fn synthetic_mint_burn_and_quarantine() {
        let mut machine = machine();
        let asset = example_registry(1).assets.remove(0);
        machine.apply(Transaction::RegisterAsset { admin: true, asset }).unwrap();
        let mut second = obs("deposit", 111);
        second.source = "https://rpc-b.example".into();
        machine.apply(Transaction::Observe { observations: vec![obs("deposit", 111), second] }).unwrap();
        assert_eq!(machine.balance(&addr(2), "syn:ethereum.slot.0001"), 5);
        let mut burn_a = obs("withdraw", 111);
        burn_a.tx_hash = "0xdef".into();
        let mut burn_b = burn_a.clone();
        burn_b.source = "https://rpc-b.example".into();
        machine.apply(Transaction::Observe { observations: vec![burn_a, burn_b] }).unwrap();
        assert_eq!(machine.balance(&addr(2), "syn:ethereum.slot.0001"), 0);
        let mut bad = obs("deposit", 111);
        bad.tx_hash = "0x111".into();
        let mut worse = bad.clone();
        worse.source = "https://rpc-b.example".into();
        worse.amount = 9;
        let held = machine.apply(Transaction::Observe { observations: vec![bad, worse] }).unwrap();
        assert_eq!(held.summary, "quarantine");
        assert_eq!(machine.state.metrics.quarantined, 1);
    }

    #[test]
    fn meme_launch_and_trade_collect_fees() {
        let mut machine = machine();
        machine
            .apply(Transaction::LaunchMeme {
                creator: addr(2),
                id: "meme1".into(),
                symbol: "MEME".into(),
                nonce: 0,
            })
            .unwrap();
        assert!(machine.balance(&addr(2), "meme1") > 0);
        assert!(machine.balance(&addr(1), ZENDO_COIN) >= machine.state.fees.launch);
        machine
            .apply(Transaction::Trade {
                trader: addr(2),
                meme: "meme1".into(),
                buy: true,
                amount: 1_000,
                nonce: 1,
            })
            .unwrap();
        assert!(machine.state.metrics.fees >= 2);
    }
}
