import { EMOJIS } from "./seed";
import { ZendoError } from "./errors";

export function emailOf(value: unknown): string {
  if (typeof value !== "string") throw new ZendoError("Enter an email address.");
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    throw new ZendoError("Enter a valid email address.");
  }
  return email;
}

export function passwordOf(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 72) {
    throw new ZendoError("Use a password of 8 to 72 characters.");
  }
  if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) {
    throw new ZendoError("Use at least one letter and one number in the password.");
  }
  return value;
}

export function pinOf(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) {
    throw new ZendoError("The PIN is 4 digits.");
  }
  return value;
}

export function nameOf(value: unknown): string {
  if (typeof value !== "string") throw new ZendoError("Enter a display name.");
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 32) throw new ZendoError("Display names are 2 to 32 characters.");
  if (/[\u0000-\u001f]/.test(name)) throw new ZendoError("That display name is not allowed.");
  return name;
}

export function textOf(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") throw new ZendoError(`Enter ${label}.`);
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < min || text.length > max) {
    throw new ZendoError(`${label} must be ${min} to ${max} characters.`);
  }
  return text;
}

export function symbolOf(value: unknown): string {
  if (typeof value !== "string") throw new ZendoError("Enter a ticker.");
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(symbol)) {
    throw new ZendoError("Tickers are 2 to 8 letters or numbers, starting with a letter.");
  }
  if (symbol === "ZCOIN" || symbol === "ZENDO") throw new ZendoError("That ticker is reserved.");
  return symbol;
}

export function emojiOf(value: unknown): string {
  if (typeof value !== "string" || !EMOJIS.includes(value as (typeof EMOJIS)[number])) {
    throw new ZendoError("Pick an icon from the set.");
  }
  return value;
}

export function hueOf(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 78;
  return Math.max(0, Math.min(360, Math.round(n)));
}

export function addressOf(value: unknown): string {
  if (typeof value !== "string" || !/^znd1[0-9a-f]{38}$/.test(value)) {
    throw new ZendoError("Enter a Zendo address that starts with znd1.");
  }
  return value;
}

export function sideOf(value: unknown): "buy" | "sell" {
  if (value !== "buy" && value !== "sell") throw new ZendoError("Choose buy or sell.");
  return value;
}

export function choiceOf(value: unknown): "yes" | "no" | "abstain" {
  if (value !== "yes" && value !== "no" && value !== "abstain") {
    throw new ZendoError("Vote yes, no, or abstain.");
  }
  return value;
}
