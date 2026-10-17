use crate::external_registry::ExternalAsset;
use crate::state_machine::{Machine, Observation, Transaction};

/// The oracle only reads observations. It cannot sign or broadcast an external transaction.
pub fn ingest(machine: &mut Machine, observations: Vec<Observation>) -> Result<String, String> {
    let receipt = machine.apply(Transaction::Observe { observations })?;
    eprintln!(
        "{{\"component\":\"oracle\",\"ingested\":{},\"minted\":{},\"burned\":{},\"quarantined\":{}}}",
        machine.state.metrics.ingested, machine.state.metrics.minted, machine.state.metrics.burned, machine.state.metrics.quarantined
    );
    Ok(receipt.summary)
}

pub fn sources_for(asset: &ExternalAsset) -> Result<(), String> {
    if asset.rpcs.len() < usize::from(asset.min_sources) && !asset.rpcs.is_empty() {
        return Err("Configured RPC count is below the minimum independent sources.".into());
    }
    let mut hosts = std::collections::BTreeSet::new();
    for rpc in &asset.rpcs {
        hosts.insert(rpc.trim_start_matches("https://").trim_start_matches("http://").split('/').next().unwrap_or(rpc).to_lowercase());
    }
    if !asset.rpcs.is_empty() && hosts.len() < usize::from(asset.min_sources) {
        return Err("RPC hosts are not independent.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::external_registry::example_registry;
    use crate::state_machine::{Machine, Observation, Transaction};

    #[test]
    fn oracle_mints_only_after_two_sources_agree() {
        let mut machine = Machine::new("znd111111111111111111111111111111111111111");
        let account = "znd122222222222222222222222222222222222222".to_string();
        machine.apply(Transaction::CreateAccount { address: account.clone() }).unwrap();
        let asset = example_registry(1).assets.remove(0);
        machine.apply(Transaction::RegisterAsset { admin: true, asset }).unwrap();
        let row = Observation {
            source: "https://one.example".into(),
            asset_id: "ethereum.slot.0001".into(),
            kind: "deposit".into(),
            tx_hash: "0xaa".into(),
            log_index: 0,
            block_number: 10,
            head_number: 40,
            topic: format!("0x{:064x}", 1),
            token: format!("0x{:040x}", 1),
            amount: 7,
            zendo_account: account.clone(),
        };
        let mut other = row.clone();
        other.source = "https://two.example".into();
        ingest(&mut machine, vec![row, other]).unwrap();
        assert_eq!(machine.balance(&account, "syn:ethereum.slot.0001"), 7);
    }
}
