import { readFileSync } from "fs";
import { randomInt } from "crypto";
import { wordlistPath } from "./paths";
import { ZendoError } from "./errors";

let cache: string[] | null = null;

export function wordlist(): string[] {
  if (!cache) {
    const words = readFileSync(wordlistPath(), "utf8")
      .trim()
      .split(/\n/)
      .map((word) => word.trim())
      .filter(Boolean);
    if (words.length !== 2048) {
      throw new Error("The BIP-39 English wordlist is missing or incomplete.");
    }
    cache = words;
  }
  return cache;
}

export function generatePhrase(): string[] {
  const words = wordlist();
  const used = new Set<number>();
  const phrase: string[] = [];
  while (phrase.length < 12) {
    const index = randomInt(0, words.length);
    if (used.has(index)) continue;
    used.add(index);
    phrase.push(words[index]);
  }
  return phrase;
}

export function normalizePhrase(input: string[] | string): string[] {
  const parts = Array.isArray(input) ? input : input.trim().split(/\s+/);
  const words = parts.map((word) => word.trim().toLowerCase()).filter(Boolean);
  if (words.length !== 12) {
    throw new ZendoError("Enter all 12 recovery words, in order, separated by spaces.");
  }
  const known = new Set(wordlist());
  for (const word of words) {
    if (!known.has(word)) throw new ZendoError(`"${word}" is not a recovery word.`);
  }
  return words;
}

export function phraseText(words: string[]): string {
  return words.join(" ");
}
