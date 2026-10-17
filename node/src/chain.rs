use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

use ed25519_dalek::{Signature, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};

use crate::block::{seal, Block, ZERO_HASH};
use crate::codec::{encode_hex, Address};
use crate::keys::{address_of, generate_signing_key};
use crate::state::{stake_selector, State, STAKE_ADDRESS, TREASURY_ADDRESS};
use crate::tx::Tx;
use crate::units::{serde_u128, GENESIS_SUPPLY_UNITS};

const MAX_TXS: usize = 100;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NodeMeta {
    pub chain_id: String,
    pub genesis_ms: u64,
    pub block_time_ms: u64,
    pub finality_depth: u64,
    pub validators: Vec<String>,
    pub secret_hex: String,
    #[serde(default)]
    pub reorgs: u64,
    #[serde(default, with = "serde_u128")]
    pub block_reward: u128,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Vote {
    pub height: u64,
    pub block: String,
    pub validator: u32,
    pub signature: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Slash {
    pub height: u64,
    pub proposer: u32,
    #[serde(with = "serde_u128")]
    pub amount: u128,
    pub kept: String,
    pub dropped: String,
}

pub struct Chain {
    pub dir: PathBuf,
    pub meta: NodeMeta,
    pub blocks: Vec<Block>,
    pub state: State,
    pub mempool: Vec<Tx>,
    pub extras: Vec<Block>,
    pub votes: Vec<Vote>,
    pub slashes: Vec<Slash>,
}

impl Chain {
    pub fn open_or_create(dir: &Path, chain_id: &str, block_time_ms: u64) -> Result<Self, String> {
        fs::create_dir_all(dir).map_err(|err| err.to_string())?;
        let meta_path = dir.join("meta.json");
        if !meta_path.exists() {
            let key = generate_signing_key();
            let now = unix_ms();
            let meta = NodeMeta {
                chain_id: chain_id.to_string(),
                genesis_ms: now,
                block_time_ms,
                finality_depth: 2,
                validators: vec![encode_hex(key.verifying_key().as_bytes())],
                secret_hex: encode_hex(&key.to_bytes()),
                reorgs: 0,
                block_reward: 0,
            };
            fs::write(&meta_path, serde_json::to_vec_pretty(&meta).map_err(|err| err.to_string())?)
                .map_err(|err| err.to_string())?;
            let mut chain = Self {
                dir: dir.to_path_buf(),
                meta,
                blocks: Vec::new(),
                state: State::default(),
                mempool: Vec::new(),
                extras: Vec::new(),
                votes: Vec::new(),
                slashes: Vec::new(),
            };
            let faucet = address_of(&chain.signing_key()?.verifying_key());
            chain.state.credit(&faucet, GENESIS_SUPPLY_UNITS)?;
            let genesis = seal(
                &chain.signing_key()?,
                0,
                ZERO_HASH,
                now,
                0,
                Vec::new(),
                chain.state.root(),
            );
            chain.persist_and_store(genesis)?;
            return Ok(chain);
        }
        let meta: NodeMeta = serde_json::from_slice(&fs::read(&meta_path).map_err(|err| err.to_string())?)
            .map_err(|err| err.to_string())?;
        let mut chain = Self {
            dir: dir.to_path_buf(),
            meta,
            blocks: Vec::new(),
            state: State::default(),
            mempool: Vec::new(),
            extras: Vec::new(),
            votes: Vec::new(),
            slashes: Vec::new(),
        };
        chain.replay()?;
        chain.load_evidence()?;
        Ok(chain)
    }

    pub fn signing_key(&self) -> Result<SigningKey, String> {
        let bytes = crate::codec::parse_bytes32(&self.meta.secret_hex)?;
        Ok(SigningKey::from_bytes(&bytes))
    }

    pub fn validators(&self) -> Result<Vec<VerifyingKey>, String> {
        self.meta
            .validators
            .iter()
            .map(|hex_key| {
                let bytes = crate::codec::parse_bytes32(hex_key)?;
                VerifyingKey::from_bytes(&bytes).map_err(|err| err.to_string())
            })
            .collect()
    }

    pub fn tip(&self) -> Result<&Block, String> {
        self.blocks.last().ok_or_else(|| "chain is empty".to_string())
    }

    pub fn height(&self) -> u64 {
        self.blocks.last().map(|block| block.height).unwrap_or(0)
    }

    pub fn finalized_height(&self) -> u64 {
        self.height().saturating_sub(self.meta.finality_depth)
    }

    pub fn local_address(&self) -> Result<Address, String> {
        Ok(address_of(&self.signing_key()?.verifying_key()))
    }

    pub fn balance(&self, address: &Address) -> u128 {
        self.state.get(address).balance
    }

    /// Circulating native supply, and the fixed cap. Both are base units.
    pub fn total_supply(&self) -> u128 {
        self.state.total_supply()
    }

    pub fn push_tx(&mut self, tx: Tx) -> Result<(), String> {
        tx.check_signature()?;
        if self.mempool.iter().any(|existing| existing.signature == tx.signature) {
            return Ok(());
        }
        if self.mempool.len() >= 500 {
            return Err("mempool is full".into());
        }
        self.preflight(&tx)?;
        self.mempool.push(tx);
        Ok(())
    }

    pub fn produce(&mut self, now_ms: u64) -> Result<Option<Block>, String> {
        let validators = self.validators()?;
        if validators.is_empty() {
            return Err("no validators configured".into());
        }
        let slot = now_ms.saturating_sub(self.meta.genesis_ms) / self.meta.block_time_ms.max(1);
        let index = (slot as usize) % validators.len();
        let local = self.signing_key()?.verifying_key().to_bytes();
        if validators[index].to_bytes() != local {
            return Ok(None);
        }
        if self.tip()?.time_ms / self.meta.block_time_ms.max(1) == now_ms / self.meta.block_time_ms.max(1)
            && self.height() > 0
        {
            return Ok(None);
        }
        let parent = self.tip()?.hash()?;
        let proposer = address_of(&validators[index]);
        let mut next_state = self.state.clone();
        let validator_addresses: Vec<Address> = validators.iter().map(address_of).collect();
        let mut included = Vec::new();
        let pending = std::mem::take(&mut self.mempool);
        for tx in pending {
            if included.len() >= MAX_TXS {
                self.mempool.push(tx);
                continue;
            }
            match next_state.apply_tx(&tx, &proposer, now_ms, &validator_addresses) {
                Ok(()) => included.push(tx),
                Err(_) => self.mempool.push(tx),
            }
        }
        if self.meta.block_reward > 0 {
            pay_block_reward(&mut next_state, &proposer, self.meta.block_reward)?;
        }
        next_state.check_supply()?;
        let block = seal(
            &self.signing_key()?,
            self.height() + 1,
            parent,
            now_ms,
            index as u32,
            included,
            next_state.root(),
        );
        self.state = next_state;
        self.persist_and_store(block.clone())?;
        Ok(Some(block))
    }

    pub fn side_blocks(&self) -> usize {
        self.extras.len()
    }

    pub fn accept_block(&mut self, block: Block) -> Result<(), String> {
        if self.knows(&block)? {
            return Ok(());
        }
        let validators = self.validators()?;
        check_proposer(&self.meta, &validators, &block)?;
        let tip = self.tip()?.hash()?;
        if block.parent_hash()? == tip && block.height == self.height() + 1 {
            self.stage_block(block.clone())?;
            self.persist_and_store(block)?;
            return self.try_switch();
        }
        if block.height == 0 {
            return Err("genesis already exists".into());
        }
        self.note_conflict(&block)?;
        self.remember_extra(block);
        self.try_switch()
    }

    pub fn scheduled_proposer(&self, now_ms: u64) -> usize {
        let slot = now_ms.saturating_sub(self.meta.genesis_ms) / self.meta.block_time_ms.max(1);
        slot as usize % self.meta.validators.len().max(1)
    }

    /// Adds a validator before any block after genesis. The slot schedule uses the set size, so joining later would make old blocks fail replay.
    pub fn join_validator(&mut self, public_hex: &str) -> Result<(), String> {
        if self.height() > 0 {
            return Err("validators join at genesis, before the first block".into());
        }
        self.add_validator(public_hex)
    }

    /// Copies a genesis directory and keeps this key as the local signer. The public key must already be in that validator set.
    pub fn open_joined(dir: &Path, source: &Path, key: &SigningKey) -> Result<Self, String> {
        fs::create_dir_all(dir).map_err(|err| err.to_string())?;
        let meta_path = dir.join("meta.json");
        if !meta_path.exists() {
            let raw = fs::read(source.join("meta.json")).map_err(|err| err.to_string())?;
            let mut meta: NodeMeta = serde_json::from_slice(&raw).map_err(|err| err.to_string())?;
            let public = encode_hex(key.verifying_key().as_bytes());
            if !meta.validators.iter().any(|validator| validator == &public) {
                return Err("this key is not in the genesis validator set".into());
            }
            meta.secret_hex = encode_hex(&key.to_bytes());
            meta.reorgs = 0;
            fs::write(&meta_path, serde_json::to_vec_pretty(&meta).map_err(|err| err.to_string())?)
                .map_err(|err| err.to_string())?;
            fs::copy(source.join("blocks.jsonl"), dir.join("blocks.jsonl")).map_err(|err| err.to_string())?;
        }
        let meta: NodeMeta = serde_json::from_slice(&fs::read(&meta_path).map_err(|err| err.to_string())?)
            .map_err(|err| err.to_string())?;
        let mut chain = Self {
            dir: dir.to_path_buf(),
            meta,
            blocks: Vec::new(),
            state: State::default(),
            mempool: Vec::new(),
            extras: Vec::new(),
            votes: Vec::new(),
            slashes: Vec::new(),
        };
        chain.replay()?;
        chain.load_evidence()?;
        Ok(chain)
    }

    pub fn add_validator(&mut self, public_hex: &str) -> Result<(), String> {
        let bytes = crate::codec::parse_bytes32(public_hex)?;
        VerifyingKey::from_bytes(&bytes).map_err(|err| err.to_string())?;
        let text = encode_hex(&bytes);
        if self.meta.validators.iter().any(|validator| validator == &text) {
            return self.write_meta();
        }
        self.meta.validators.push(text);
        self.write_meta()
    }

    pub fn cast_vote(&mut self, height: u64) -> Result<(), String> {
        let block = self
            .blocks
            .iter()
            .find(|block| block.height == height)
            .ok_or_else(|| "block not found".to_string())?;
        let hash = block.hash()?;
        let local = self.signing_key()?;
        let index = self.validator_index(&local.verifying_key())?;
        let message = crate::keys::vote_message(height, &hash, index);
        let signature = crate::keys::sign(&local, &message);
        self.accept_vote(Vote {
            height,
            block: encode_hex(&hash),
            validator: index,
            signature: encode_hex(&signature.to_bytes()),
        })
    }

    pub fn accept_vote(&mut self, vote: Vote) -> Result<(), String> {
        let validators = self.validators()?;
        check_vote(&validators, &vote)?;
        if !self.known_hash_at(vote.height, &vote.block)? {
            return Err("vote is for an unknown block".into());
        }
        let prior_block = self
            .votes
            .iter()
            .find(|prior| prior.validator == vote.validator && prior.height == vote.height)
            .map(|prior| prior.block.clone());
        if let Some(prior_block) = prior_block {
            if prior_block != vote.block {
                self.note_vote_equivocation(&vote, &prior_block)?;
                return Err("validator equivocated".into());
            }
            return Ok(());
        }
        self.votes.push(vote);
        self.save_json("votes.json", &self.votes)?;
        Ok(())
    }

    pub fn vote_finalized_height(&self) -> u64 {
        let quorum = self.meta.validators.len() / 2 + 1;
        let mut finalized = 0;
        for block in &self.blocks {
            let Ok(hash) = block.hash() else { break };
            let hash = encode_hex(&hash);
            let votes = self.votes.iter().filter(|vote| vote.height == block.height && vote.block == hash).count();
            if block.height == 0 || votes >= quorum {
                finalized = block.height;
            } else {
                break;
            }
        }
        finalized
    }

    fn stage_block(&mut self, block: Block) -> Result<(), String> {
        let validators = self.validators()?;
        let parent = self.tip()?.clone();
        apply_block(&self.meta, &validators, &mut self.state, &parent, &block)?;
        let mempool = std::mem::take(&mut self.mempool);
        self.mempool = mempool.into_iter().filter(|tx| self.preflight(tx).is_ok()).collect();
        Ok(())
    }

    fn knows(&self, block: &Block) -> Result<bool, String> {
        let hash = block.hash()?;
        for existing in self.blocks.iter().chain(self.extras.iter()) {
            if existing.hash()? == hash {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn remember_extra(&mut self, block: Block) {
        if self.extras.len() >= 256 {
            self.extras.remove(0);
        }
        self.extras.push(block);
    }

    fn try_switch(&mut self) -> Result<(), String> {
        let best = self.heaviest_allowed()?;
        let best_tip = encode_hex(&best.last().ok_or_else(|| "chain is empty".to_string())?.hash()?);
        let current_tip = encode_hex(&self.tip()?.hash()?);
        if best_tip == current_tip {
            return Ok(());
        }
        let shared = shared_prefix(&self.blocks, &best);
        if shared == self.blocks.len() {
            for block in best.iter().skip(shared).cloned() {
                self.stage_block(block.clone())?;
                self.persist_and_store(block)?;
            }
            self.forget_included(&best)?;
            return Ok(());
        }
        let (blocks, state) = replay_blocks(&self.meta, &best)?;
        let mut kept = Vec::new();
        let mut seen = HashSet::new();
        for block in self.blocks.iter().chain(self.extras.iter()) {
            let hash = encode_hex(&block.hash()?);
            if blocks.iter().any(|chosen| chosen.hash().ok().map(|value| encode_hex(&value)) == Some(hash.clone())) {
                continue;
            }
            if seen.insert(hash) {
                kept.push(block.clone());
            }
        }
        self.blocks = blocks;
        self.state = state;
        self.extras = kept;
        self.trim_extras();
        self.meta.reorgs = self.meta.reorgs.saturating_add(1);
        self.write_meta()?;
        self.rewrite_blocks()?;
        let mempool = std::mem::take(&mut self.mempool);
        self.mempool = mempool.into_iter().filter(|tx| self.preflight(tx).is_ok()).collect();
        self.reapply_slashes()?;
        Ok(())
    }

    fn heaviest_allowed(&self) -> Result<Vec<Block>, String> {
        let map = self.block_index()?;
        let genesis = encode_hex(&self.blocks.first().ok_or_else(|| "chain is empty".to_string())?.hash()?);
        let mut best = self.blocks.clone();
        for block in map.values() {
            let Some(path) = path_from_genesis(&map, block) else {
                continue;
            };
            if path.is_empty() || encode_hex(&path[0].hash()?) != genesis {
                continue;
            }
            if !self.reorg_allowed(&path) {
                continue;
            }
            if path.last().map(|item| item.height).unwrap_or(0) > best.last().map(|item| item.height).unwrap_or(0) {
                best = path;
            }
        }
        Ok(best)
    }

    fn reorg_allowed(&self, path: &[Block]) -> bool {
        let shared = shared_prefix(&self.blocks, path);
        if shared == self.blocks.len() {
            return true;
        }
        if shared == 0 {
            return false;
        }
        self.blocks[shared - 1].height >= self.finalized_height()
    }

    fn block_index(&self) -> Result<HashMap<String, Block>, String> {
        let mut map = HashMap::new();
        for block in self.blocks.iter().chain(self.extras.iter()) {
            map.insert(encode_hex(&block.hash()?), block.clone());
        }
        Ok(map)
    }

    fn forget_included(&mut self, chosen: &[Block]) -> Result<(), String> {
        let mut hashes = HashSet::new();
        for block in chosen {
            hashes.insert(encode_hex(&block.hash()?));
        }
        self.extras.retain(|block| block.hash().ok().map(|hash| !hashes.contains(&encode_hex(&hash))).unwrap_or(true));
        Ok(())
    }

    fn trim_extras(&mut self) {
        if self.extras.len() > 256 {
            let extra = self.extras.len() - 256;
            self.extras.drain(0..extra);
        }
    }

    fn write_meta(&self) -> Result<(), String> {
        fs::write(
            self.dir.join("meta.json"),
            serde_json::to_vec_pretty(&self.meta).map_err(|err| err.to_string())?,
        )
        .map_err(|err| err.to_string())
    }

    fn rewrite_blocks(&self) -> Result<(), String> {
        let mut body = String::new();
        for block in &self.blocks {
            body.push_str(&serde_json::to_string(block).map_err(|err| err.to_string())?);
            body.push('\n');
        }
        fs::write(self.dir.join("blocks.jsonl"), body).map_err(|err| err.to_string())
    }

    fn preflight(&self, tx: &Tx) -> Result<(), String> {
        tx.check_signature()?;
        let account = self.state.get(&tx.sender()?);
        if tx.nonce < account.nonce {
            return Err("nonce already used".into());
        }
        if !tx.data.is_empty() {
            let raw = crate::codec::decode_hex(&tx.data)?;
            if raw.len() > 24 * 1024 {
                return Err("payload exceeds 24 KiB".into());
            }
        }
        let to = tx.to_address()?;
        let withdraw = to == STAKE_ADDRESS && stake_selector(&tx.data) == Some(2);
        let spend = if withdraw {
            tx.fee
        } else {
            tx.amount.checked_add(tx.fee).ok_or_else(|| "amount overflow".to_string())?
        };
        if account.balance < spend && tx.nonce == account.nonce {
            return Err("insufficient balance".into());
        }
        Ok(())
    }

    fn persist_and_store(&mut self, block: Block) -> Result<(), String> {
        let path = self.dir.join("blocks.jsonl");
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map_err(|err| err.to_string())?;
        let line = serde_json::to_string(&block).map_err(|err| err.to_string())?;
        writeln!(file, "{line}").map_err(|err| err.to_string())?;
        self.blocks.push(block);
        Ok(())
    }

    fn replay(&mut self) -> Result<(), String> {
        let path = self.dir.join("blocks.jsonl");
        if !path.exists() {
            return Err("meta exists without blocks".into());
        }
        let file = fs::File::open(path).map_err(|err| err.to_string())?;
        let reader = BufReader::new(file);
        for line in reader.lines() {
            let line = line.map_err(|err| err.to_string())?;
            if line.trim().is_empty() {
                continue;
            }
            let block: Block = serde_json::from_str(&line).map_err(|err| err.to_string())?;
            if block.height == 0 && self.blocks.is_empty() {
                let validators = self.validators()?;
                block.check_signature(&validators[0])?;
                let faucet = address_of(&validators[0]);
                self.state.credit(&faucet, GENESIS_SUPPLY_UNITS)?;
                if encode_hex(&self.state.root()) != block.state_root {
                    return Err("genesis state root mismatch".into());
                }
                self.blocks.push(block);
                continue;
            }
            self.stage_block(block.clone())?;
            self.blocks.push(block);
        }
        Ok(())
    }

    fn load_evidence(&mut self) -> Result<(), String> {
        self.votes = read_json(&self.dir.join("votes.json"))?;
        self.slashes = read_json(&self.dir.join("slashes.json"))?;
        self.reapply_slashes()
    }

    fn note_conflict(&mut self, block: &Block) -> Result<(), String> {
        let hash = encode_hex(&block.hash()?);
        let mut conflict = None;
        for other in self.blocks.iter().chain(self.extras.iter()) {
            if other.height == block.height && other.proposer == block.proposer {
                let other_hash = encode_hex(&other.hash()?);
                if other_hash != hash {
                    conflict = Some(other_hash);
                    break;
                }
            }
        }
        if let Some(other_hash) = conflict {
            self.slash(block.proposer, block.height, &other_hash, &hash)?;
        }
        Ok(())
    }

    fn note_vote_equivocation(&mut self, vote: &Vote, prior_hash: &str) -> Result<(), String> {
        self.slash(vote.validator, vote.height, prior_hash, &vote.block)
    }

    fn slash(&mut self, proposer: u32, height: u64, kept: &str, dropped: &str) -> Result<(), String> {
        if self.slashes.iter().any(|slash| slash.height == height && slash.proposer == proposer) {
            return Ok(());
        }
        let validators = self.validators()?;
        let key = validators.get(proposer as usize).ok_or_else(|| "unknown proposer".to_string())?;
        let address = address_of(key);
        let amount = self.balance(&address) / 10;
        self.debit_validator(proposer, amount)?;
        self.slashes.push(Slash {
            height,
            proposer,
            amount,
            kept: kept.to_string(),
            dropped: dropped.to_string(),
        });
        self.save_json("slashes.json", &self.slashes)
    }

    fn reapply_slashes(&mut self) -> Result<(), String> {
        for slash in self.slashes.clone() {
            self.debit_validator(slash.proposer, slash.amount)?;
        }
        Ok(())
    }

    fn debit_validator(&mut self, index: u32, amount: u128) -> Result<(), String> {
        if amount == 0 {
            return Ok(());
        }
        let validators = self.validators()?;
        let key = validators.get(index as usize).ok_or_else(|| "unknown validator".to_string())?;
        let address = address_of(key);
        let mut account = self.state.get(&address);
        let take = amount.min(account.balance);
        account.balance -= take;
        self.state.accounts.insert(encode_hex(&address), account);
        Ok(())
    }

    fn validator_index(&self, key: &VerifyingKey) -> Result<u32, String> {
        let encoded = encode_hex(key.as_bytes());
        self.meta
            .validators
            .iter()
            .position(|validator| validator == &encoded)
            .map(|index| index as u32)
            .ok_or_else(|| "local key is not a validator".to_string())
    }

    fn known_hash_at(&self, height: u64, hash: &str) -> Result<bool, String> {
        for block in self.blocks.iter().chain(self.extras.iter()) {
            if block.height == height && encode_hex(&block.hash()?) == hash {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn save_json<T: Serialize>(&self, name: &str, value: &T) -> Result<(), String> {
        fs::write(self.dir.join(name), serde_json::to_vec(value).map_err(|err| err.to_string())?)
            .map_err(|err| err.to_string())
    }
}

fn check_proposer(meta: &NodeMeta, validators: &[VerifyingKey], block: &Block) -> Result<(), String> {
    let index = block.proposer as usize;
    let key = validators.get(index).ok_or_else(|| "unknown proposer".to_string())?;
    block.check_signature(key)?;
    let expected = (block.time_ms.saturating_sub(meta.genesis_ms) / meta.block_time_ms.max(1)) as usize % validators.len();
    if expected != index {
        return Err("proposer is not scheduled for this slot".into());
    }
    Ok(())
}

fn apply_block(
    meta: &NodeMeta,
    validators: &[VerifyingKey],
    state: &mut State,
    parent: &Block,
    block: &Block,
) -> Result<(), String> {
    if block.parent_hash()? != parent.hash()? {
        return Err("block does not extend the tip".into());
    }
    if block.height != parent.height + 1 {
        return Err("unexpected block height".into());
    }
    check_proposer(meta, validators, block)?;
    let proposer = address_of(&validators[block.proposer as usize]);
    let validator_addresses: Vec<Address> = validators.iter().map(address_of).collect();
    let mut next_state = state.clone();
    for tx in &block.txs {
        next_state.apply_tx(tx, &proposer, block.time_ms, &validator_addresses)?;
    }
    if meta.block_reward > 0 {
        pay_block_reward(&mut next_state, &proposer, meta.block_reward)?;
    }
    next_state.check_supply()?;
    if encode_hex(&next_state.root()) != block.state_root {
        return Err("state root mismatch".into());
    }
    *state = next_state;
    Ok(())
}

/// Pays a block reward from the treasury reserve instead of minting. The reserve is funded from the
/// fixed genesis allocation, so a block reward moves existing coins and never inflates the supply.
fn pay_block_reward(state: &mut State, proposer: &Address, amount: u128) -> Result<(), String> {
    let reserve = state.get(&TREASURY_ADDRESS);
    if reserve.balance < amount {
        return Err("the treasury reserve cannot cover the block reward".into());
    }
    let mut reserve_account = reserve;
    reserve_account.balance -= amount;
    state.accounts.insert(encode_hex(&TREASURY_ADDRESS), reserve_account);
    state.credit(proposer, amount)
}

fn replay_blocks(meta: &NodeMeta, blocks: &[Block]) -> Result<(Vec<Block>, State), String> {
    let validators = validator_keys(meta)?;
    let mut state = State::default();
    let mut out = Vec::new();
    for block in blocks {
        if out.is_empty() {
            if block.height != 0 {
                return Err("replay did not start at genesis".into());
            }
            block.check_signature(validators.first().ok_or_else(|| "no validators configured".to_string())?)?;
            state.credit(&address_of(&validators[0]), GENESIS_SUPPLY_UNITS)?;
            if encode_hex(&state.root()) != block.state_root {
                return Err("genesis state root mismatch".into());
            }
            out.push(block.clone());
            continue;
        }
        apply_block(meta, &validators, &mut state, out.last().expect("genesis"), block)?;
        out.push(block.clone());
    }
    Ok((out, state))
}

fn validator_keys(meta: &NodeMeta) -> Result<Vec<VerifyingKey>, String> {
    meta.validators
        .iter()
        .map(|hex_key| {
            let bytes = crate::codec::parse_bytes32(hex_key)?;
            VerifyingKey::from_bytes(&bytes).map_err(|err| err.to_string())
        })
        .collect()
}

fn shared_prefix(left: &[Block], right: &[Block]) -> usize {
    let mut count = 0;
    while count < left.len() && count < right.len() {
        let Ok(a) = left[count].hash() else { break };
        let Ok(b) = right[count].hash() else { break };
        if a != b {
            break;
        }
        count += 1;
    }
    count
}

fn path_from_genesis(map: &HashMap<String, Block>, start: &Block) -> Option<Vec<Block>> {
    let mut seq = Vec::new();
    let mut current = start.clone();
    for _ in 0..10_000 {
        let parent = current.parent.clone();
        let height = current.height;
        seq.push(current);
        if height == 0 {
            seq.reverse();
            return Some(seq);
        }
        current = map.get(&parent)?.clone();
    }
    None
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Vec<T>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    serde_json::from_slice(&fs::read(path).map_err(|err| err.to_string())?).map_err(|err| err.to_string())
}

fn check_vote(validators: &[VerifyingKey], vote: &Vote) -> Result<(), String> {
    let key = validators.get(vote.validator as usize).ok_or_else(|| "unknown validator".to_string())?;
    let hash = crate::codec::parse_hash(&vote.block)?;
    let message = crate::keys::vote_message(vote.height, &hash, vote.validator);
    let raw = crate::codec::decode_hex(&vote.signature)?;
    if raw.len() != 64 {
        return Err("vote signature must be 64 bytes".into());
    }
    let mut bytes = [0u8; 64];
    bytes.copy_from_slice(&raw);
    let signature = Signature::from_bytes(&bytes);
    if !crate::keys::verify(key, &message, &signature) {
        return Err("bad vote signature".into());
    }
    Ok(())
}

pub fn unix_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
