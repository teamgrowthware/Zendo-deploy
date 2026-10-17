use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::block::Block;
use crate::chain::{unix_ms, Chain, Vote};
use crate::peers::PeerBook;
use crate::tx::Tx;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NetMsg {
    Hello {
        height: u64,
        tip: String,
        listen: String,
        #[serde(default)]
        region: String,
    },
    Peers { addrs: Vec<String> },
    Transactions { txs: Vec<Tx> },
    Block { block: Block },
    Vote { vote: Vote },
}

pub fn listen(
    chain_slot: Arc<Mutex<Chain>>,
    book: Arc<Mutex<PeerBook>>,
    bind: std::net::SocketAddr,
) -> Result<std::net::SocketAddr, String> {
    let listener = TcpListener::bind(bind).map_err(|err| err.to_string())?;
    let local = listener.local_addr().map_err(|err| err.to_string())?;
    thread::spawn(move || {
        for incoming in listener.incoming() {
            let Ok(stream) = incoming else { continue };
            let slot = chain_slot.clone();
            let peers = book.clone();
            thread::spawn(move || {
                let _ = session(slot, peers, stream, None);
            });
        }
    });
    Ok(local)
}

pub fn exchange(chain_slot: Arc<Mutex<Chain>>, book: Arc<Mutex<PeerBook>>, peer: std::net::SocketAddr) -> Result<(), String> {
    let started = std::time::Instant::now();
    let stream = TcpStream::connect_timeout(&peer, Duration::from_secs(2)).map_err(|err| err.to_string())?;
    let rtt = started.elapsed().as_millis().max(1) as u64;
    {
        let mut peers = book.lock().map_err(|err| err.to_string())?;
        peers.note_rtt(peer, rtt);
    }
    session(chain_slot, book, stream, Some(peer))
}

pub fn broadcast(peers: &[std::net::SocketAddr], message: &NetMsg) {
    for peer in peers {
        if let Ok(mut stream) = TcpStream::connect_timeout(peer, Duration::from_millis(400)) {
            let _ = send(&mut stream, message);
        }
    }
}

fn session(
    chain_slot: Arc<Mutex<Chain>>,
    book: Arc<Mutex<PeerBook>>,
    stream: TcpStream,
    dialed: Option<std::net::SocketAddr>,
) -> Result<(), String> {
    stream.set_read_timeout(Some(Duration::from_millis(800))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(2))).ok();
    let mut write_half = stream.try_clone().map_err(|err| err.to_string())?;
    let (height, tip, listen_addr, advertised, region) = {
        let chain = chain_slot.lock().map_err(|err| err.to_string())?;
        let peers = book.lock().map_err(|err| err.to_string())?;
        (
            chain.height(),
            crate::codec::encode_hex(&chain.tip()?.hash()?),
            peers.self_addr().to_string(),
            peers.advertise(),
            peers.region().to_string(),
        )
    };
    send(
        &mut write_half,
        &NetMsg::Hello {
            height,
            tip,
            listen: listen_addr,
            region,
        },
    )?;
    send(&mut write_half, &NetMsg::Peers { addrs: advertised })?;
    let reader = BufReader::new(stream);
    for line in reader.lines() {
        let line = match line {
            Ok(line) => line,
            Err(err) if err.kind() == std::io::ErrorKind::TimedOut || err.kind() == std::io::ErrorKind::WouldBlock => break,
            Err(err) => return Err(err.to_string()),
        };
        if line.trim().is_empty() {
            continue;
        }
        let message: NetMsg = serde_json::from_str(&line).map_err(|err| err.to_string())?;
        match message {
            NetMsg::Hello {
                height: remote_height,
                tip: remote_tip,
                listen,
                region,
            } => {
                remember(&book, &listen, dialed, remote_height, &remote_tip, &region)?;
                if remote_height < height {
                    let chain = chain_slot.lock().map_err(|err| err.to_string())?;
                    for block in chain.blocks.iter().skip(remote_height as usize + 1) {
                        send(&mut write_half, &NetMsg::Block { block: block.clone() })?;
                    }
                }
            }
            NetMsg::Peers { addrs } => {
                let mut peers = book.lock().map_err(|err| err.to_string())?;
                peers.learn(&addrs, unix_ms());
            }
            NetMsg::Transactions { txs } => {
                let mut chain = chain_slot.lock().map_err(|err| err.to_string())?;
                for tx in txs {
                    let _ = chain.push_tx(tx);
                }
            }
            NetMsg::Block { block } => {
                let mut chain = chain_slot.lock().map_err(|err| err.to_string())?;
                let _ = chain.accept_block(block);
            }
            NetMsg::Vote { vote } => {
                let mut chain = chain_slot.lock().map_err(|err| err.to_string())?;
                let _ = chain.accept_vote(vote);
            }
        }
    }
    Ok(())
}

fn remember(
    book: &Arc<Mutex<PeerBook>>,
    listen: &str,
    dialed: Option<std::net::SocketAddr>,
    height: u64,
    tip: &str,
    region: &str,
) -> Result<(), String> {
    let mut peers = book.lock().map_err(|err| err.to_string())?;
    let now = unix_ms();
    if let Ok(addr) = listen.parse::<std::net::SocketAddr>() {
        peers.observe(addr, height, tip, now, region);
    } else if let Some(addr) = dialed {
        peers.observe(addr, height, tip, now, region);
    }
    Ok(())
}

pub fn send(stream: &mut TcpStream, message: &NetMsg) -> Result<(), String> {
    let line = serde_json::to_string(message).map_err(|err| err.to_string())?;
    writeln!(stream, "{line}").map_err(|err| err.to_string())
}
