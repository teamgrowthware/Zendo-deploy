# ZendoCoin on Polygon mainnet

ZendoCoin is the fixed-supply token. The ticker is `$ZCoin`. Decimals are 18. Supply is 1,000,000,000. This package deploys it on Polygon mainnet only, chain id 137.

The phone archive is `ZendoCoin-Polygon_Mainnet.zip`.

## Allocations

| Holder | Role | Amount | Polygon wallet |
| --- | --- | --- | --- |
| Louis Conner | Co-founder and President | 200,000,000 | `0x18a0730008034177b40F1172aA5953a37dAE7102` |
| Prabhat Agrawal | Founder | 50,000,000 | `0xD319679625599303393084671a3AdaB52ea999B3` |
| Pratyaksh Lutare | Founder | 50,000,000 | `0x3336a52Cd82F01956147aed641F35694a235fbc9` |
| Public allocation | Liquid at launch | 700,000,000 | The deployer wallet, unless `POLYGON_ADDR_PUBLIC` is set |

Founder wallets and amounts are written into `ZendoCoinVesting`. They cannot be changed after deployment. Louis Conner's role, Co-founder and President, is stored on the vesting contract as `LOUIS_ROLE`.

## Vesting

The clock starts at the Polygon block that deploys the contracts.

- For 120 days, including the cliff day, a founder cannot release any $ZCoin.
- At each 365-day anniversary, 25% of that founder's own allocation unlocks.
- After four years, 100% is unlocked.
- A founder calls `release()` on the vesting contract. That pays only their own unlocked balance. One founder cannot take another's coins.
- There is no admin key that can move the locked coins or change a founder wallet.

Year-one amounts: Louis Conner 50,000,000; Prabhat Agrawal 12,500,000; Pratyaksh Lutare 12,500,000.

## Contracts

- `contracts/ZendoCoin.sol` mints 1,000,000,000 $ZCoin once. It refuses every chain except 137.
- `contracts/ZendoCoinVesting.sol` holds the 300,000,000 founder allocation.
- `contracts/ZendoCoinLaunch.sol` deploys both in one transaction, sends 300,000,000 to vesting, and sends 700,000,000 to the public allocation wallet.

Solidity 0.8.24, optimizer on, 200 runs, Cancun. The creation bytecode is in `artifacts/ZendoCoinLaunch.json`.

## Deploy

From this folder, on a computer that can pay Polygon gas in POL:

```bash
npm install ethers
node script/deploy.mjs
POLYGON_RPC_URL=https://polygon-rpc.example POLYGON_ADDR_PUBLIC=0xYourPublicWallet DEPLOYER_PRIVATE_KEY=0xYourKey node script/deploy.mjs --broadcast
```

Leave `POLYGON_ADDR_PUBLIC` unset to send the 700,000,000 public allocation to the deployer. The script checks that the RPC is chain id 137 and does not print the private key. Do not commit that key.

In this repository the same script is `polygon/scripts/deploy.mjs`.

`forge test` in this folder runs the vesting schedule, the cliff, the founder roles, and the chain-id check.

The logo in `brand/zendocoin-logo.png` is the ZendoCoin mark: gold shield, gold bolt, ZendoCoin wordmark.
