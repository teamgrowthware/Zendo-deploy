import path from "path";

export function dataDir(): string {
  return process.env.ZENDO_DATA_DIR || path.join(process.cwd(), "data");
}

export function configPath(): string {
  return process.env.ZENDO_CONFIG || path.join(process.cwd(), "zendo-blockchain.toml");
}

export function wordlistPath(): string {
  return path.join(process.cwd(), "lib", "bip39-english.txt");
}
