use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use zendo_node::chain::Chain;
use zendo_node::codec::encode_hex;
use zendo_node::gossip;
use zendo_node::keys::{address_of, generate_signing_key};
use zendo_node::peers::PeerBook;
use zendo_node::tx::{sign_contract, sign_tx};
use zendo_node::vm::contract_address;

fn temp_dir() -> std::path::PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("zendo-node-{nanos}"));
    let _ = std::fs::remove_dir_all(&path);
    path
}

#[test]
fn genesis_pays_the_validator_and_a_transfer_moves_coins() {
    let dir = temp_dir();
    let mut chain = Chain::open_or_create(&dir, "test", 1_000).unwrap();
    let start = chain.balance(&chain.local_address().unwrap());
    assert_eq!(start, 1000000000000000000000000000u128);
    let recipient_key = generate_signing_key();
    let recipient = address_of(&recipient_key.verifying_key());
    let key = chain.signing_key().unwrap();
    let tx = sign_tx(&key, 0, recipient, 25, 1);
    chain.push_tx(tx).unwrap();
    let now = chain.meta.genesis_ms + chain.meta.block_time_ms;
    let block = chain.produce(now).unwrap().expect("validator should produce");
    assert_eq!(block.height, 1);
    assert_eq!(block.txs.len(), 1);
    assert_eq!(chain.balance(&recipient), 25);
    assert_eq!(chain.balance(&chain.local_address().unwrap()), start - 25);
    let reopened = Chain::open_or_create(&dir, "test", 1_000).unwrap();
    assert_eq!(reopened.height(), 1);
    assert_eq!(reopened.balance(&recipient), 25);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn bad_signature_and_overspend_are_rejected() {
    let dir = temp_dir();
    let mut chain = Chain::open_or_create(&dir, "test", 1_000).unwrap();
    let stranger = generate_signing_key();
    let sender = chain.signing_key().unwrap();
    let to = address_of(&sender.verifying_key());
    let tx = sign_tx(&stranger, 0, to, 5, 1);
    assert!(chain.push_tx(tx).is_err());
    let key = chain.signing_key().unwrap();
    let too_much = sign_tx(&key, 0, address_of(&stranger.verifying_key()), u128::MAX, 1);
    assert!(chain.push_tx(too_much).is_err());
    assert!(encode_hex(&chain.tip().unwrap().hash().unwrap()).len() == 64);
    let _ = std::fs::remove_dir_all(&dir);
}

fn copy_genesis(from: &std::path::Path, to: &std::path::Path) {
    std::fs::create_dir_all(to).unwrap();
    std::fs::copy(from.join("meta.json"), to.join("meta.json")).unwrap();
    std::fs::copy(from.join("blocks.jsonl"), to.join("blocks.jsonl")).unwrap();
}

fn produce_n(chain: &mut Chain, count: u64) {
    let start = chain.height();
    for step in 1..=count {
        let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (start + step);
        chain.produce(when).unwrap().expect("scheduled proposer");
    }
}

#[test]
fn a_longer_unfinalized_fork_replaces_the_tip() {
    let genesis = temp_dir();
    let mut base = Chain::open_or_create(&genesis, "test", 1_000).unwrap();
    let snap = temp_dir();
    copy_genesis(&genesis, &snap);
    produce_n(&mut base, 2);

    let mut longer = Chain::open_or_create(&snap, "test", 1_000).unwrap();
    let key = longer.signing_key().unwrap();
    let recipient = address_of(&generate_signing_key().verifying_key());
    longer.push_tx(sign_tx(&key, 0, recipient, 7, 1)).unwrap();
    produce_n(&mut longer, 3);
    assert_eq!(longer.balance(&recipient), 7);

    for block in longer.blocks.iter().skip(1).cloned() {
        base.accept_block(block).unwrap();
    }
    assert_eq!(base.height(), 3);
    assert_eq!(base.balance(&recipient), 7);
    assert_eq!(base.meta.reorgs, 1);
    let reopened = Chain::open_or_create(&genesis, "test", 1_000).unwrap();
    assert_eq!(reopened.height(), 3);
    assert_eq!(reopened.balance(&recipient), 7);
    assert_eq!(reopened.meta.reorgs, 1);
    let _ = std::fs::remove_dir_all(&genesis);
    let _ = std::fs::remove_dir_all(&snap);
}

#[test]
fn blocks_can_arrive_out_of_order_and_finalized_history_stays() {
    let genesis = temp_dir();
    let mut base = Chain::open_or_create(&genesis, "test", 1_000).unwrap();
    let pure = temp_dir();
    copy_genesis(&genesis, &pure);
    let snap = temp_dir();
    copy_genesis(&pure, &snap);
    let mut other = Chain::open_or_create(&snap, "test", 1_000).unwrap();
    produce_n(&mut other, 2);
    let second = other.blocks[2].clone();
    let first = other.blocks[1].clone();
    base.accept_block(second).unwrap();
    assert_eq!(base.height(), 0);
    base.accept_block(first).unwrap();
    assert_eq!(base.height(), 2);
    assert_eq!(base.meta.reorgs, 0);

    produce_n(&mut base, 2);
    assert_eq!(base.height(), 4);
    let fork_dir = temp_dir();
    copy_genesis(&pure, &fork_dir);
    let mut forbidden = Chain::open_or_create(&fork_dir, "test", 1_000).unwrap();
    let key = forbidden.signing_key().unwrap();
    let recipient = address_of(&generate_signing_key().verifying_key());
    forbidden.push_tx(sign_tx(&key, 0, recipient, 3, 1)).unwrap();
    produce_n(&mut forbidden, 5);
    for block in forbidden.blocks.iter().skip(1).cloned() {
        base.accept_block(block).unwrap();
    }
    assert_eq!(base.height(), 4);
    assert_eq!(base.balance(&recipient), 0);
    assert!(base.side_blocks() > 0);
    let _ = std::fs::remove_dir_all(&genesis);
    let _ = std::fs::remove_dir_all(&pure);
    let _ = std::fs::remove_dir_all(&snap);
    let _ = std::fs::remove_dir_all(&fork_dir);
}

#[test]
fn two_nodes_learn_each_others_listen_address() {
    let left_dir = temp_dir();
    let right_dir = temp_dir();
    let left = Arc::new(Mutex::new(Chain::open_or_create(&left_dir, "test", 1_000).unwrap()));
    let right = Arc::new(Mutex::new(Chain::open_or_create(&right_dir, "test", 1_000).unwrap()));
    let left_book = Arc::new(Mutex::new(PeerBook::new("127.0.0.1:1".parse().unwrap())));
    let right_book = Arc::new(Mutex::new(PeerBook::new("127.0.0.1:1".parse().unwrap())));
    let left_addr = gossip::listen(left.clone(), left_book.clone(), "127.0.0.1:0".parse().unwrap()).unwrap();
    let right_addr = gossip::listen(right, right_book.clone(), "127.0.0.1:0".parse().unwrap()).unwrap();
    left_book.lock().unwrap().set_self(left_addr);
    right_book.lock().unwrap().set_self(right_addr);
    gossip::exchange(left, left_book.clone(), right_addr).unwrap();
    let left_seen = left_book.lock().unwrap().records();
    let right_seen = right_book.lock().unwrap().records();
    assert!(left_seen.iter().any(|peer| peer.addr == right_addr));
    assert!(right_seen.iter().any(|peer| peer.addr == left_addr));
    let _ = std::fs::remove_dir_all(&left_dir);
    let _ = std::fs::remove_dir_all(&right_dir);
}

#[test]
fn contracts_persist_storage_and_reverts_only_charge_gas() {
    let dir = temp_dir();
    let mut chain = Chain::open_or_create(&dir, "test", 1_000).unwrap();
    let user_key = generate_signing_key();
    let user = address_of(&user_key.verifying_key());
    let faucet = chain.signing_key().unwrap();
    chain.push_tx(sign_tx(&faucet, 0, user, 100_000, 1)).unwrap();
    produce_n(&mut chain, 1);
    assert_eq!(chain.balance(&user), 100_000);

    let mut code = Vec::new();
    for value in [0u64, 1, 0] {
        let raw = value.to_be_bytes();
        let start = raw.iter().position(|byte| *byte != 0).unwrap_or(raw.len() - 1);
        code.push(0x01);
        code.push((raw.len() - start) as u8);
        code.extend_from_slice(&raw[start..]);
        if value == 0 && code.len() == 3 {
            code.push(0x0c);
        } else if value == 1 {
            code.push(0x02);
        }
    }
    code.push(0x0d);
    code.push(0x00);
    let counter = contract_address(&user, 0);
    chain.push_tx(sign_contract(&user_key, 0, [0u8; 20], 0, 10_000, &code)).unwrap();
    chain.push_tx(sign_tx(&user_key, 1, counter, 0, 10_000)).unwrap();
    produce_n(&mut chain, 1);
    let slot = encode_hex(&[0u8; 32]);
    let mut two = [0u8; 32];
    two[31] = 2;
    assert_eq!(chain.state.code(&counter), encode_hex(&code));
    assert_eq!(chain.state.storage_at(&counter, &slot), encode_hex(&two));
    assert_eq!(chain.balance(&user), 100_000 - 261 * 2);

    let reverting = contract_address(&user, 2);
    chain.push_tx(sign_contract(&user_key, 2, [0u8; 20], 0, 90, &[0x13])).unwrap();
    chain.push_tx(sign_contract(&user_key, 3, [0u8; 20], 0, 80, &[0xff])).unwrap();
    produce_n(&mut chain, 1);
    assert_eq!(chain.state.code(&reverting), "");
    assert_eq!(chain.balance(&user), 100_000 - 261 * 2 - 80);
    let reopened = Chain::open_or_create(&dir, "test", 1_000).unwrap();
    assert_eq!(reopened.state.storage_at(&counter, &slot), encode_hex(&two));
    assert_eq!(reopened.balance(&user), chain.balance(&user));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn equivocation_is_slashed_votes_finalize_and_reward_survives_reopen() {
    let genesis = temp_dir();
    let mut base = Chain::open_or_create(&genesis, "test", 1_000).unwrap();
    let snap = temp_dir();
    copy_genesis(&genesis, &snap);
    produce_n(&mut base, 1);
    let address = base.local_address().unwrap();
    let before = base.balance(&address);
    let mut other = Chain::open_or_create(&snap, "test", 1_000).unwrap();
    let key = other.signing_key().unwrap();
    let recipient = address_of(&generate_signing_key().verifying_key());
    other.push_tx(sign_tx(&key, 0, recipient, 9, 1)).unwrap();
    produce_n(&mut other, 1);
    base.accept_block(other.blocks[1].clone()).unwrap();
    assert_eq!(base.slashes.len(), 1);
    assert_eq!(base.slashes[0].amount, before / 10);
    assert_eq!(base.balance(&address), before - before / 10);
    base.cast_vote(1).unwrap();
    assert_eq!(base.vote_finalized_height(), 1);
    let err = base.accept_vote(signed_vote(&base, 1, &encode_hex(&other.blocks[1].hash().unwrap()))).unwrap_err();
    assert!(err.contains("equivocated"));
    assert_eq!(base.slashes.len(), 1);

    let extra = generate_signing_key();
    base.add_validator(&encode_hex(extra.verifying_key().as_bytes())).unwrap();
    let foreign_slot = base.meta.genesis_ms + base.meta.block_time_ms * 3;
    assert_eq!(base.scheduled_proposer(foreign_slot), 1);
    assert!(base.produce(foreign_slot).unwrap().is_none());

    let rewarded = temp_dir();
    let mut payer = Chain::open_or_create(&rewarded, "test", 1_000).unwrap();
    payer.meta.block_reward = 5;
    let current = payer.meta.validators[0].clone();
    payer.add_validator(&current).unwrap();
    let key = payer.signing_key().unwrap();
    let local = payer.local_address().unwrap();
    // Fund the treasury reserve with a real transfer so replay reproduces the block reward.
    payer.push_tx(sign_tx(&key, 0, zendo_node::state::TREASURY_ADDRESS, 100, 1)).unwrap();
    let start = payer.balance(&local);
    produce_n(&mut payer, 1);
    assert_eq!(payer.balance(&local), start - 95);
    assert_eq!(payer.balance(&zendo_node::state::TREASURY_ADDRESS), 95);
    assert_eq!(payer.total_supply(), 1_000_000_000_000_000_000_000_000_000u128);
    let reopened = Chain::open_or_create(&rewarded, "test", 1_000).unwrap();
    assert_eq!(reopened.meta.block_reward, 5);
    assert_eq!(reopened.balance(&reopened.local_address().unwrap()), start - 95);
    let _ = std::fs::remove_dir_all(&genesis);
    let _ = std::fs::remove_dir_all(&snap);
    let _ = std::fs::remove_dir_all(&rewarded);
}

#[test]
fn delegation_bonds_coins_and_a_short_validator_balance_blocks_withdrawal() {
    use zendo_node::state::{stake_payload, STAKE_ADDRESS};

    let dir = temp_dir();
    let mut chain = Chain::open_or_create(&dir, "test", 1_000).unwrap();
    let user_key = generate_signing_key();
    let user = address_of(&user_key.verifying_key());
    let faucet = chain.signing_key().unwrap();
    chain.push_tx(sign_tx(&faucet, 0, user, 500, 1)).unwrap();
    let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
    chain.produce(when).unwrap().expect("fund");
    chain
        .push_tx(sign_contract(&user_key, 0, STAKE_ADDRESS, 100, 1, &stake_payload(1, 0)))
        .unwrap();
    let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
    let delegated = chain.produce(when).unwrap().expect("delegate");
    assert_eq!(delegated.txs.len(), 1);
    assert_eq!(chain.state.bonds(), vec![(encode_hex(&user), 0, 100)]);
    assert_eq!(chain.balance(&user), 399);

    let withdraw = stake_payload(2, 0);
    chain.push_tx(sign_contract(&user_key, 1, STAKE_ADDRESS, 40, 1, &withdraw)).unwrap();
    let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
    chain.produce(when).unwrap().expect("withdraw");
    assert_eq!(chain.state.bonds(), vec![(encode_hex(&user), 0, 60)]);
    assert_eq!(chain.balance(&user), 438);
    let reopened = Chain::open_or_create(&dir, "test", 1_000).unwrap();
    assert_eq!(reopened.state.bonds(), vec![(encode_hex(&user), 0, 60)]);

    let mut draft = reopened.state.clone();
    let validator = reopened.local_address().unwrap();
    let mut account = draft.get(&validator);
    account.balance = 10;
    draft.accounts.insert(encode_hex(&validator), account);
    let too_much = sign_contract(&user_key, 2, STAKE_ADDRESS, 60, 1, &withdraw);
    let addresses: Vec<_> = reopened.validators().unwrap().iter().map(address_of).collect();
    let err = draft.apply_tx(&too_much, &validator, 1, &addresses).unwrap_err();
    assert!(err.contains("slash"), "{err}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_joined_validator_keeps_finalizing_when_the_other_is_quiet() {
    let a_dir = temp_dir();
    let mut first = Chain::open_or_create(&a_dir, "test", 1_000).unwrap();
    let second_key = generate_signing_key();
    first.join_validator(&encode_hex(second_key.verifying_key().as_bytes())).unwrap();
    let b_dir = temp_dir();
    let mut second = Chain::open_joined(&b_dir, &a_dir, &second_key).unwrap();
    for slot in [2u64, 4, 6] {
        let when = first.meta.genesis_ms + first.meta.block_time_ms * slot;
        assert!(second.produce(when).unwrap().is_none());
        let block = first.produce(when).unwrap().expect("first validator slot");
        second.accept_block(block).unwrap();
    }
    assert_eq!(first.height(), 3);
    assert_eq!(second.height(), 3);
    assert_eq!(second.finalized_height(), 1);
    assert_eq!(second.vote_finalized_height(), 0);
    let when = first.meta.genesis_ms + first.meta.block_time_ms * 7;
    assert!(first.produce(when).unwrap().is_none());
    let block = second.produce(when).unwrap().expect("second validator slot");
    first.accept_block(block).unwrap();
    assert_eq!(first.height(), 4);
    assert_eq!(first.finalized_height(), 2);
    first.cast_vote(1).unwrap();
    assert_eq!(first.vote_finalized_height(), 0);
    let reopened = Chain::open_or_create(&a_dir, "test", 1_000).unwrap();
    assert_eq!(reopened.height(), 4);
    assert_eq!(reopened.validators().unwrap().len(), 2);
    let _ = std::fs::remove_dir_all(&a_dir);
    let _ = std::fs::remove_dir_all(&b_dir);
}

#[test]
fn the_deployer_can_replace_code_and_roll_it_back() {
    let dir = temp_dir();
    let mut chain = Chain::open_or_create(&dir, "test", 1_000).unwrap();
    let user_key = generate_signing_key();
    let user = address_of(&user_key.verifying_key());
    let faucet = chain.signing_key().unwrap();
    chain.push_tx(sign_tx(&faucet, 0, user, 50_000, 1)).unwrap();
    let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
    chain.produce(when).unwrap().expect("fund");

    let v1 = vec![0x01, 0x01, 0x07, 0x14];
    let v2 = vec![0x01, 0x01, 0x09, 0x14];
    let contract = contract_address(&user, 0);
    chain.push_tx(sign_contract(&user_key, 0, [0u8; 20], 0, 1_000, &v1)).unwrap();
    let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
    chain.produce(when).unwrap().expect("deploy");
    assert_eq!(chain.state.code(&contract), encode_hex(&v1));
    assert_eq!(chain.state.get(&contract).admin, encode_hex(&user));

    let mut upgrade = vec![0xA1];
    upgrade.extend_from_slice(&v2);
    chain.push_tx(sign_contract(&user_key, 1, contract, 0, 1_000, &upgrade)).unwrap();
    let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
    chain.produce(when).unwrap().expect("upgrade");
    assert_eq!(chain.state.code(&contract), encode_hex(&v2));
    assert_eq!(chain.state.get(&contract).history, vec![encode_hex(&v1)]);

    let stranger = chain.signing_key().unwrap();
    chain.push_tx(sign_contract(&stranger, 1, contract, 0, 1_000, &upgrade)).unwrap();
    let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
    let rejected = chain.produce(when).unwrap().expect("empty slot");
    assert!(rejected.txs.is_empty());
    assert_eq!(chain.state.code(&contract), encode_hex(&v2));

    chain.push_tx(sign_contract(&user_key, 2, contract, 0, 1_000, &[0xA2])).unwrap();
    let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
    chain.produce(when).unwrap().expect("rollback");
    assert_eq!(chain.state.code(&contract), encode_hex(&v1));
    assert!(chain.state.get(&contract).history.is_empty());
    let reopened = Chain::open_or_create(&dir, "test", 1_000).unwrap();
    assert_eq!(reopened.state.code(&contract), encode_hex(&v1));
    let _ = std::fs::remove_dir_all(&dir);
}

fn signed_vote(chain: &zendo_node::chain::Chain, height: u64, block: &str) -> zendo_node::chain::Vote {
    use zendo_node::keys::{sign, vote_message};
    let hash = zendo_node::codec::parse_hash(block).unwrap();
    let key = chain.signing_key().unwrap();
    let signature = sign(&key, &vote_message(height, &hash, 0));
    zendo_node::chain::Vote {
        height,
        block: block.to_string(),
        validator: 0,
        signature: encode_hex(&signature.to_bytes()),
    }
}

