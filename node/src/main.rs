use std::env;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

static STOP: AtomicBool = AtomicBool::new(false);

extern "C" fn handle_stop(_: libc::c_int) {
    STOP.store(true, Ordering::Relaxed);
}

fn arm_stop() {
    unsafe {
        libc::signal(libc::SIGTERM, handle_stop as libc::sighandler_t);
        libc::signal(libc::SIGINT, handle_stop as libc::sighandler_t);
    }
}

use zendo_node::chain::{unix_ms, Chain};
use zendo_node::codec::{encode_hex, parse_address};
use zendo_node::gossip::{self, NetMsg};
use zendo_node::keys::generate_signing_key;
use zendo_node::peers::PeerBook;
use zendo_node::rpc;
use zendo_node::state::{stake_payload, STAKE_ADDRESS};
use zendo_node::tx::{sign_contract, sign_tx};

fn main() {
    if let Err(err) = run() {
        eprintln!("zendo-node: {err}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    match args.next().as_deref() {
        Some("keygen") => {
            let key = generate_signing_key();
            println!("{}", encode_hex(&key.to_bytes()));
            println!("{}", encode_hex(key.verifying_key().as_bytes()));
            Ok(())
        }
        Some("run") => run_node(args.collect()),
        Some("transfer") => transfer(args.collect()),
        Some("stake") => stake(args.collect(), 1),
        Some("unstake") => stake(args.collect(), 2),
        Some("call") => call_contract(args.collect()),
        Some("enroll") => enroll(args.collect()),
        Some("join") => join_chain(args.collect()),
        Some("help") | None => {
            println!(
                "zendo-node run --data <dir> --listen <addr> --rpc <addr> [--peer <addr> ...] [--region <name>]\n\
                 zendo-node enroll --data <dir> --public <64 hex chars>\n\
                 zendo-node join --data <dir> --from <genesis dir> --secret <64 hex chars>\n\
                 zendo-node transfer --data <dir> --to <address> --amount <u128> --fee <u128>\n\
                 zendo-node stake --data <dir> --validator <index> --amount <u128> --fee <u128>\n\
                 zendo-node unstake --data <dir> --validator <index> --amount <u128> --fee <u128>\n\
                 zendo-node call --data <dir> --to <address> --payload <hex> [--from <address>] [--gas <u128>]\n\
                 zendo-node keygen\n\
                 White paper for this release: docs/whitepaper-body.html"
            );
            Ok(())
        }
        Some(other) => Err(format!("unknown command {other}")),
    }
}

fn flag(args: &[String], name: &str) -> Option<String> {
    args.windows(2).find(|pair| pair[0] == name).map(|pair| pair[1].clone())
}

fn flags(args: &[String], name: &str) -> Vec<String> {
    args.windows(2)
        .filter(|pair| pair[0] == name)
        .map(|pair| pair[1].clone())
        .collect()
}

fn run_node(args: Vec<String>) -> Result<(), String> {
    let data = PathBuf::from(flag(&args, "--data").unwrap_or_else(|| "node-data".into()));
    let listen: SocketAddr = flag(&args, "--listen")
        .unwrap_or_else(|| "127.0.0.1:47110".into())
        .parse()
        .map_err(|err| format!("listen address: {err}"))?;
    let rpc_addr: SocketAddr = flag(&args, "--rpc")
        .unwrap_or_else(|| "127.0.0.1:47111".into())
        .parse()
        .map_err(|err| format!("rpc address: {err}"))?;
    let seeds: Vec<SocketAddr> = flags(&args, "--peer")
        .iter()
        .map(|value| value.parse().map_err(|err| format!("peer address: {err}")))
        .collect::<Result<_, _>>()?;
    let chain = Arc::new(Mutex::new(Chain::open_or_create(&data, "zendo-1", 2_000)?));
    let book = Arc::new(Mutex::new(PeerBook::new(listen)));
    {
        let mut peers = book.lock().map_err(|err| err.to_string())?;
        if let Some(region) = flag(&args, "--region") {
            peers.set_region(&region)?;
        }
        for seed in &seeds {
            peers.add_seed(*seed);
        }
    }
    let bound = gossip::listen(chain.clone(), book.clone(), listen)?;
    book.lock().map_err(|err| err.to_string())?.set_self(bound);
    rpc::serve(chain.clone(), book.clone(), rpc_addr)?;
    println!("zendo-node listening on {bound}, rpc on {rpc_addr}");
    arm_stop();
    let dial_chain = chain.clone();
    let dial_book = book.clone();
    thread::spawn(move || loop {
        let targets = dial_book.lock().map(|peers| peers.dial_list()).unwrap_or_default();
        for addr in targets {
            if gossip::exchange(dial_chain.clone(), dial_book.clone(), addr).is_err() {
                if let Ok(mut peers) = dial_book.lock() {
                    peers.note_failure(addr);
                }
            }
        }
        thread::sleep(Duration::from_secs(2));
    });
    loop {
        if STOP.load(Ordering::Relaxed) {
            println!("zendo-node stopping");
            return Ok(());
        }
        let produced = {
            let mut chain = chain.lock().map_err(|err| err.to_string())?;
            chain.produce(unix_ms())?
        };
        if let Some(block) = produced {
            println!("produced block {}", block.height);
            let targets = book.lock().map(|peers| peers.dial_list()).unwrap_or_default();
            gossip::broadcast(&targets, &NetMsg::Block { block });
        }
        thread::sleep(Duration::from_millis(500));
    }
}

fn transfer(args: Vec<String>) -> Result<(), String> {
    let data = PathBuf::from(flag(&args, "--data").ok_or("pass --data")?);
    let to = parse_address(&flag(&args, "--to").ok_or("pass --to")?)?;
    let amount: u128 = flag(&args, "--amount")
        .ok_or("pass --amount")?
        .parse()
        .map_err(|err| format!("amount: {err}"))?;
    let fee: u128 = flag(&args, "--fee").unwrap_or_else(|| "1".into()).parse().map_err(|err| format!("fee: {err}"))?;
    let mut chain = Chain::open_or_create(&data, "zendo-1", 2_000)?;
    let key = chain.signing_key()?;
    let nonce = chain.state.get(&chain.local_address()?).nonce;
    let tx = sign_tx(&key, nonce, to, amount, fee);
    chain.push_tx(tx)?;
    let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
    let block = chain.produce(when)?;
    match block {
        Some(block) => println!("included transfer of {amount} in block {}", block.height),
        None => println!("queued transfer of {amount}; this key is not the proposer for that slot"),
    }
    Ok(())
}

fn enroll(args: Vec<String>) -> Result<(), String> {
    let data = PathBuf::from(flag(&args, "--data").ok_or("pass --data")?);
    let public = flag(&args, "--public").ok_or("pass --public")?;
    let mut chain = Chain::open_or_create(&data, "zendo-1", 2_000)?;
    chain.join_validator(&public)?;
    println!("enrolled {public}");
    Ok(())
}

fn join_chain(args: Vec<String>) -> Result<(), String> {
    let data = PathBuf::from(flag(&args, "--data").ok_or("pass --data")?);
    let source = PathBuf::from(flag(&args, "--from").ok_or("pass --from")?);
    let secret = flag(&args, "--secret").ok_or("pass --secret")?;
    let bytes = zendo_node::codec::parse_bytes32(&secret)?;
    let key = ed25519_dalek::SigningKey::from_bytes(&bytes);
    let chain = Chain::open_joined(&data, &source, &key)?;
    println!("joined {} at height {}", chain.meta.chain_id, chain.height());
    Ok(())
}

fn stake(args: Vec<String>, selector: u8) -> Result<(), String> {
    let data = PathBuf::from(flag(&args, "--data").ok_or("pass --data")?);
    let validator: u32 = flag(&args, "--validator")
        .ok_or("pass --validator")?
        .parse()
        .map_err(|err| format!("validator: {err}"))?;
    let amount: u128 = flag(&args, "--amount")
        .ok_or("pass --amount")?
        .parse()
        .map_err(|err| format!("amount: {err}"))?;
    let fee: u128 = flag(&args, "--fee").unwrap_or_else(|| "1".into()).parse().map_err(|err| format!("fee: {err}"))?;
    let mut chain = Chain::open_or_create(&data, "zendo-1", 2_000)?;
    let key = chain.signing_key()?;
    let nonce = chain.state.get(&chain.local_address()?).nonce;
    let payload = stake_payload(selector, validator);
    let tx = sign_contract(&key, nonce, STAKE_ADDRESS, amount, fee, &payload);
    chain.push_tx(tx)?;
    let when = chain.meta.genesis_ms + chain.meta.block_time_ms * (chain.height() + 1);
    let verb = if selector == 1 { "delegation" } else { "withdrawal" };
    match chain.produce(when)? {
        Some(block) if block.txs.iter().any(|tx| tx.nonce == nonce) => println!("included {verb} of {amount} in block {}", block.height),
        Some(block) => println!("block {} did not include the {verb}", block.height),
        None => println!("queued {verb} of {amount}; this key is not the proposer for that slot"),
    }
    Ok(())
}

fn call_contract(args: Vec<String>) -> Result<(), String> {
    let data_dir = PathBuf::from(flag(&args, "--data").ok_or("pass --data")?);
    let to = parse_address(&flag(&args, "--to").ok_or("pass --to")?)?;
    let payload = flag(&args, "--payload").unwrap_or_default();
    let raw = if payload.is_empty() {
        Vec::new()
    } else {
        zendo_node::codec::decode_hex(&payload)?
    };
    let gas: u64 = flag(&args, "--gas").unwrap_or_else(|| "1000000".into()).parse().map_err(|err| format!("gas: {err}"))?;
    let chain = Chain::open_or_create(&data_dir, "zendo-1", 2_000)?;
    let from = match flag(&args, "--from") {
        Some(text) => parse_address(&text)?,
        None => chain.local_address()?,
    };
    let sim = chain.state.simulate_call(&from, &to, 0, gas, &raw, unix_ms());
    println!(
        "{}",
        serde_json::json!({
            "status": sim.status,
            "gasUsed": sim.gas_used,
            "returnData": encode_hex(&sim.return_data),
            "reason": sim.reason,
        })
    );
    Ok(())
}
