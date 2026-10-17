use std::env;
use std::fs;
use std::path::PathBuf;

use zendo_chain::api::serve;
use zendo_chain::external_registry::{example_registry, validate_asset, Registry};
use zendo_chain::ledger::{Replica, Writer};
use zendo_chain::oracles::sources_for;
use zendo_chain::state_machine::Transaction;

fn main() {
    let mut args = env::args().skip(1);
    let command = args.next().unwrap_or_else(|| "help".into());
    let result = match command.as_str() {
        "writer" => writer(args),
        "replica" => replica(args),
        "assets" => assets(args),
        "verify" => verify(),
        _ => {
            println!(
                "zendo-chain writer --data <dir> --bind 127.0.0.1:47221\nzendo-chain replica --log <blocks.jsonl>\nzendo-chain assets validate|expand --registry <file>\nzendo-chain verify"
            );
            Ok(())
        }
    };
    if let Err(err) = result {
        eprintln!("{err}");
        std::process::exit(1);
    }
}

fn writer(mut args: impl Iterator<Item = String>) -> Result<(), String> {
    let list: Vec<String> = args.by_ref().collect();
    let data = take(&list, "--data").unwrap_or_else(|| "data/zendo-chain".into());
    let bind = take(&list, "--bind").unwrap_or_else(|| "127.0.0.1:47221".into());
    let registry = take(&list, "--registry").unwrap_or_else(|| "zendo-chain/config/external-assets.json".into());
    let treasury = env::var("ZENDO_TREASURY").unwrap_or_else(|_| "znd111111111111111111111111111111111111111".into());
    let mut node = Writer::open(PathBuf::from(&data).as_path(), &treasury)?;
    if node.machine.state.registry.is_empty() {
        if let Ok(text) = fs::read_to_string(&registry) {
            let file: Registry = serde_json::from_str(&text).map_err(|err| err.to_string())?;
            for asset in file.assets {
                sources_for(&asset)?;
                node.commit(Transaction::RegisterAsset { admin: true, asset })?;
            }
        }
    }
    let token = env::var("ZENDO_CHAIN_ADMIN_TOKEN").ok();
    serve(&mut node, &bind, token)
}

fn replica(args: impl Iterator<Item = String>) -> Result<(), String> {
    let list: Vec<String> = args.collect();
    let log = take(&list, "--log").ok_or("Pass --log <blocks.jsonl>.")?;
    let treasury = env::var("ZENDO_TREASURY").unwrap_or_else(|_| "znd111111111111111111111111111111111111111".into());
    let node = Replica::follow(PathBuf::from(log).as_path(), &treasury)?;
    println!("{{\"height\":{},\"accounts\":{},\"assets\":{}}}", node.machine.state.height, node.machine.state.accounts.len(), node.machine.state.registry.len());
    Ok(())
}

fn assets(args: impl Iterator<Item = String>) -> Result<(), String> {
    let list: Vec<String> = args.collect();
    let action = list.first().map(String::as_str).unwrap_or("validate");
    let registry = take(&list, "--registry").unwrap_or_else(|| "zendo-chain/config/external-assets.json".into());
    if action == "expand" {
        let count: usize = take(&list, "--count").unwrap_or_else(|| "1500".into()).parse().map_err(|_| "Bad count.")?;
        let file = example_registry(count);
        fs::write(&registry, serde_json::to_string_pretty(&file).map_err(|err| err.to_string())?).map_err(|err| err.to_string())?;
        println!("Wrote {count} assets to {registry}");
        return Ok(());
    }
    let text = fs::read_to_string(&registry).map_err(|err| err.to_string())?;
    let file: Registry = serde_json::from_str(&text).map_err(|err| err.to_string())?;
    for asset in &file.assets {
        validate_asset(asset)?;
        sources_for(asset)?;
    }
    println!("Validated {} assets.", file.assets.len());
    Ok(())
}

fn verify() -> Result<(), String> {
    let mut body = String::new();
    std::io::Read::read_to_string(&mut std::io::stdin(), &mut body).map_err(|err| err.to_string())?;
    let tx: Transaction = serde_json::from_str(&body).map_err(|err| err.to_string())?;
    let mut machine = zendo_chain::state_machine::Machine::new("znd111111111111111111111111111111111111111");
    if let Transaction::Observe { observations } = &tx {
        if let Some(first) = observations.first() {
            machine.apply(Transaction::CreateAccount { address: first.zendo_account.clone() }).ok();
        }
    }
    let receipt = machine.apply(tx)?;
    println!("{}", serde_json::to_string(&receipt).map_err(|err| err.to_string())?);
    Ok(())
}

fn take(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|item| item == name).and_then(|index| args.get(index + 1).cloned())
}
