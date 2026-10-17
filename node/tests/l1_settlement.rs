use std::time::{SystemTime, UNIX_EPOCH};

use zendo_node::chain::Chain;
use zendo_node::codec::encode_hex;
use zendo_node::contracts::curve_bytecode;
use zendo_node::keys::{address_of, generate_signing_key};
use zendo_node::state::{stake_payload, STAKE_ADDRESS, TREASURY_ADDRESS};
use zendo_node::tx::{sign_contract, sign_tx, Tx};
use zendo_node::units::{CREATE_FEE, LAUNCH_MARKER, SUPPLY_CAP};
use zendo_node::vm::{contract_address, ZERO_ADDRESS};

fn temp_dir() -> std::path::PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("zendo-settle-{nanos}"));
    let _ = std::fs::remove_dir_all(&path);
    path
}

fn produce_next(chain: &mut Chain) {
    let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
    chain.produce(when).unwrap().expect("scheduled proposer");
}

fn receipt(chain: &Chain, id: &str) -> Option<u64> {
    chain
        .blocks
        .iter()
        .find(|block| block.txs.iter().any(|tx| tx.id_checked().map(|value| value == id).unwrap_or(false)))
        .map(|block| block.height)
}

#[test]
fn a_submitted_transfer_settles_and_the_receipt_resolves() {
    let dir = temp_dir();
    let mut chain = Chain::open_or_create(&dir, "zendo-1", 1_000).unwrap();
    let faucet = chain.signing_key().unwrap();
    let user_key = generate_signing_key();
    let user = address_of(&user_key.verifying_key());

    let fund = sign_tx(&faucet, 0, user, 1_000, 1);
    chain.push_tx(fund).unwrap();
    produce_next(&mut chain);
    assert_eq!(chain.balance(&user), 1_000);

    let target_key = generate_signing_key();
    let target = address_of(&target_key.verifying_key());
    let tx = sign_tx(&user_key, 0, target, 250, 2);
    let id = tx.id_checked().unwrap();

    let wire = serde_json::to_string(&tx).unwrap();
    let decoded: Tx = serde_json::from_str(&wire).unwrap();
    assert_eq!(decoded, tx);
    chain.push_tx(decoded).unwrap();
    produce_next(&mut chain);

    assert_eq!(chain.balance(&target), 250);
    assert_eq!(chain.balance(&user), 748);
    let height = receipt(&chain, &id).expect("receipt should resolve to a block");
    assert_eq!(height, 2);
    assert!(height <= chain.height());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_submitted_stake_creates_a_bond_on_chain() {
    let dir = temp_dir();
    let mut chain = Chain::open_or_create(&dir, "zendo-1", 1_000).unwrap();
    let faucet = chain.signing_key().unwrap();
    let user_key = generate_signing_key();
    let user = address_of(&user_key.verifying_key());

    chain.push_tx(sign_tx(&faucet, 0, user, 500, 1)).unwrap();
    produce_next(&mut chain);

    let delegate = sign_contract(&user_key, 0, STAKE_ADDRESS, 100, 1, &stake_payload(1, 0));
    chain.push_tx(delegate).unwrap();
    produce_next(&mut chain);

    assert_eq!(chain.state.bonds(), vec![(encode_hex(&user), 0, 100)]);
    assert_eq!(chain.balance(&user), 399);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_tampered_transaction_is_rejected_by_the_node() {    let dir = temp_dir();
    let mut chain = Chain::open_or_create(&dir, "zendo-1", 1_000).unwrap();
    let stranger = generate_signing_key();
    let victim = address_of(&chain.signing_key().unwrap().verifying_key());
    let mut tx = sign_tx(&stranger, 0, victim, 5, 1);
    tx.amount = 5_000;
    assert!(chain.push_tx(tx).is_err());
    assert_eq!(chain.mempool.len(), 0);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_launchpad_create_charges_the_fee_into_the_treasury_without_minting() {
    let dir = temp_dir();
    let mut chain = Chain::open_or_create(&dir, "zendo-1", 1_000).unwrap();
    let faucet = chain.signing_key().unwrap();
    let creator_key = generate_signing_key();
    let creator = address_of(&creator_key.verifying_key());

    chain.push_tx(sign_tx(&faucet, 0, creator, 1_000_000_000_000_000_000, 1)).unwrap();
    produce_next(&mut chain);

    let mut payload = vec![LAUNCH_MARKER];
    payload.extend_from_slice(&curve_bytecode());
    let coin = contract_address(&creator, 0);
    let before = chain.state.total_supply();

    // A deploy below the flat fee is dropped by the node, so a coin cannot be created for free.
    let cheap = sign_contract(&creator_key, 0, ZERO_ADDRESS, CREATE_FEE - 1, 10_000, &payload);
    chain.push_tx(cheap).unwrap();
    produce_next(&mut chain);
    assert!(chain.state.code(&coin).is_empty(), "an underpaid launch must not deploy");
    assert_eq!(chain.balance(&TREASURY_ADDRESS), 0);

    // The full fee deploys the curve program and routes the fee to the treasury, never the contract.
    let deploy = sign_contract(&creator_key, 0, ZERO_ADDRESS, CREATE_FEE, 10_000, &payload);
    chain.push_tx(deploy).unwrap();
    produce_next(&mut chain);

    assert!(!chain.state.code(&coin).is_empty(), "the coin program should be stored");
    assert_eq!(chain.balance(&TREASURY_ADDRESS), CREATE_FEE);
    assert_eq!(chain.balance(&coin), 0, "the new contract must not keep the fee");
    assert_eq!(chain.state.total_supply(), before);
    assert!(chain.state.total_supply() <= SUPPLY_CAP);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_block_reward_never_mints_and_stops_when_the_treasury_is_empty() {
    let dir = temp_dir();
    let mut chain = Chain::open_or_create(&dir, "zendo-1", 1_000).unwrap();
    let faucet = chain.signing_key().unwrap();
    let creator_key = generate_signing_key();
    let creator = address_of(&creator_key.verifying_key());

    chain.push_tx(sign_tx(&faucet, 0, creator, 1_000_000_000_000_000_000, 1)).unwrap();
    produce_next(&mut chain);

    // Fund the treasury with exactly one launchpad creation fee.
    let mut payload = vec![LAUNCH_MARKER];
    payload.extend_from_slice(&curve_bytecode());
    let deploy = sign_contract(&creator_key, 0, ZERO_ADDRESS, CREATE_FEE, 10_000, &payload);
    chain.push_tx(deploy).unwrap();
    produce_next(&mut chain);
    assert_eq!(chain.balance(&TREASURY_ADDRESS), CREATE_FEE);

    // A reward equal to the reserve is paid without inflating the supply and drains the reserve.
    let before = chain.state.total_supply();
    chain.meta.block_reward = CREATE_FEE;
    produce_next(&mut chain);
    assert_eq!(chain.balance(&TREASURY_ADDRESS), 0);
    assert_eq!(chain.state.total_supply(), before);
    assert!(chain.state.total_supply() <= SUPPLY_CAP);

    // With an empty reserve the next block reward must fail, and no coins may be minted.
    let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
    assert!(chain.produce(when).is_err(), "an empty treasury must stop the reward, not mint");
    assert_eq!(chain.state.total_supply(), before);
    assert!(chain.state.total_supply() <= SUPPLY_CAP);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn signing_vectors_match_the_typescript_l1_signer() {
    use ed25519_dalek::SigningKey;
    use zendo_node::keys::tx_message;

    let key = SigningKey::from_bytes(&[7u8; 32]);
    assert_eq!(
        encode_hex(key.verifying_key().as_bytes()),
        "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c"
    );
    assert_eq!(encode_hex(&address_of(&key.verifying_key())), "fe812c12f3ab4ce6ac5db69ac352f906cb1b11ef");
    let to = [0x11u8; 20];
    let message = tx_message(&key.verifying_key(), 3, &to, 250, 2);
    assert_eq!(
        encode_hex(&message),
        "a55a747611a7ac20c91d7147b4616c225d2ed2388314d88d3bd7ece872734ef8"
    );
}
