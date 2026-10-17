import { createHash, randomBytes, randomInt } from "crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function nid(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function txHash(payload: string): string {
  return `0x${sha256(`${payload}:${randomBytes(8).toString("hex")}`)}`;
}

export function addressFromLabel(label: string): string {
  return `znd1${sha256(`zendo:${label}`).slice(0, 38)}`;
}

export function addressFromPhrase(phrase: string): string {
  return `znd1${sha256(`zendo-wallet:${phrase}`).slice(0, 38)}`;
}

export function phraseHash(phrase: string): string {
  return sha256(`zendo-seed:${phrase}`);
}

export function randomHex(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export function pickIndexes(length: number, count: number): number[] {
  const chosen = new Set<number>();
  while (chosen.size < count) chosen.add(randomInt(0, length));
  return [...chosen].sort((a, b) => a - b);
}
