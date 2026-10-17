use std::collections::BTreeMap;
use std::net::SocketAddr;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PeerRecord {
    pub addr: SocketAddr,
    pub height: u64,
    pub tip: String,
    pub last_seen_ms: u64,
    pub failures: u32,
    pub seed: bool,
    /// Round trip of the last successful dial, in milliseconds. Zero means it has not been measured.
    pub rtt_ms: u64,
    /// Label from the peer's hello message. It is not an input to fork choice.
    pub region: String,
}

#[derive(Clone, Debug)]
pub struct PeerBook {
    self_addr: SocketAddr,
    region: String,
    peers: BTreeMap<String, PeerRecord>,
}

impl PeerBook {
    pub fn new(self_addr: SocketAddr) -> Self {
        Self {
            self_addr,
            region: String::new(),
            peers: BTreeMap::new(),
        }
    }

    pub fn set_region(&mut self, region: &str) -> Result<(), String> {
        if region.len() > 32 || !region.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') {
            return Err("region must be at most 32 letters, numbers, or hyphens".into());
        }
        self.region = region.to_string();
        Ok(())
    }

    pub fn region(&self) -> &str {
        &self.region
    }

    pub fn set_self(&mut self, addr: SocketAddr) {
        self.self_addr = addr;
        self.peers.remove(&addr.to_string());
    }

    pub fn self_addr(&self) -> SocketAddr {
        self.self_addr
    }

    pub fn add_seed(&mut self, addr: SocketAddr) {
        if !usable(addr) || addr == self.self_addr {
            return;
        }
        let record = self.peers.entry(addr.to_string()).or_insert(PeerRecord {
            addr,
            height: 0,
            tip: String::new(),
            last_seen_ms: 0,
            failures: 0,
            seed: true,
            rtt_ms: 0,
            region: String::new(),
        });
        record.seed = true;
    }

    pub fn observe(&mut self, addr: SocketAddr, height: u64, tip: &str, now_ms: u64, region: &str) {
        if !usable(addr) || addr == self.self_addr {
            return;
        }
        let record = self.peers.entry(addr.to_string()).or_insert(PeerRecord {
            addr,
            height: 0,
            tip: String::new(),
            last_seen_ms: 0,
            failures: 0,
            seed: false,
            rtt_ms: 0,
            region: String::new(),
        });
        record.height = height;
        record.tip = tip.to_string();
        record.last_seen_ms = now_ms;
        record.failures = 0;
        if !region.is_empty() {
            record.region = region.to_string();
        }
    }

    pub fn note_rtt(&mut self, addr: SocketAddr, rtt_ms: u64) {
        if let Some(record) = self.peers.get_mut(&addr.to_string()) {
            record.rtt_ms = rtt_ms.max(1);
        }
    }

    pub fn note_failure(&mut self, addr: SocketAddr) {
        if let Some(record) = self.peers.get_mut(&addr.to_string()) {
            record.failures = record.failures.saturating_add(1);
        }
    }

    pub fn learn(&mut self, addrs: &[String], now_ms: u64) -> usize {
        let mut added = 0;
        for text in addrs.iter().take(32) {
            if self.peers.len() >= 64 {
                break;
            }
            let Ok(addr) = text.parse::<SocketAddr>() else {
                continue;
            };
            if !usable(addr) || addr == self.self_addr || self.peers.contains_key(&addr.to_string()) {
                continue;
            }
            self.peers.insert(
                addr.to_string(),
                PeerRecord {
                    addr,
                    height: 0,
                    tip: String::new(),
                    last_seen_ms: now_ms,
                    failures: 0,
                    seed: false,
                    rtt_ms: 0,
                    region: String::new(),
                },
            );
            added += 1;
        }
        added
    }

    pub fn dial_list(&self) -> Vec<SocketAddr> {
        let mut peers: Vec<_> = self.peers.values().filter(|peer| peer.failures < 5).cloned().collect();
        peers.sort_by(|left, right| {
            left.failures
                .cmp(&right.failures)
                .then_with(|| rtt_rank(left.rtt_ms).cmp(&rtt_rank(right.rtt_ms)))
                .then_with(|| left.addr.to_string().cmp(&right.addr.to_string()))
        });
        peers.into_iter().take(16).map(|peer| peer.addr).collect()
    }

    pub fn advertise(&self) -> Vec<String> {
        let mut addrs = vec![self.self_addr.to_string()];
        for key in self.peers.keys().take(31) {
            addrs.push(key.clone());
        }
        addrs
    }

    pub fn records(&self) -> Vec<PeerRecord> {
        self.peers.values().cloned().collect()
    }
}

fn rtt_rank(rtt_ms: u64) -> u64 {
    if rtt_ms == 0 {
        u64::MAX
    } else {
        rtt_ms
    }
}

fn usable(addr: SocketAddr) -> bool {
    addr.port() != 0 && !addr.ip().is_unspecified() && !addr.ip().is_multicast()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn addr(port: u16) -> SocketAddr {
        format!("127.0.0.1:{port}").parse().unwrap()
    }

    #[test]
    fn discovery_keeps_seeds_and_drops_self() {
        let mut book = PeerBook::new(addr(1));
        book.add_seed(addr(1));
        book.add_seed(addr(2));
        book.learn(
            &["not-an-addr".into(), "0.0.0.0:9".into(), "127.0.0.1:0".into(), "127.0.0.1:3".into()],
            10,
        );
        let dial = book.dial_list();
        assert!(dial.contains(&addr(2)));
        assert!(dial.contains(&addr(3)));
        assert!(!dial.contains(&addr(1)));
        assert_eq!(book.advertise()[0], "127.0.0.1:1");
        book.note_failure(addr(2));
        book.observe(addr(2), 4, "abc", 20, "us-east");
        let seen = book.records().into_iter().find(|peer| peer.addr == addr(2)).unwrap();
        assert_eq!(seen.height, 4);
        assert_eq!(seen.failures, 0);
        assert_eq!(seen.region, "us-east");
        assert!(seen.seed);
    }

    #[test]
    fn dial_order_prefers_a_measured_faster_peer() {
        let mut book = PeerBook::new(addr(1));
        book.add_seed(addr(9));
        book.add_seed(addr(3));
        book.add_seed(addr(5));
        book.note_rtt(addr(9), 40);
        book.note_rtt(addr(3), 4);
        let dial = book.dial_list();
        assert_eq!(dial[0], addr(3));
        assert_eq!(dial[1], addr(9));
        assert_eq!(dial[2], addr(5));
    }
}
