export const CONTACT_EMAIL = "zendo2026@proton.me";

/**
 * The operator account is seeded from `lib/seed.ts`. The values below are disposable development
 * defaults: production refuses to boot with them. Set ZENDO_OPERATOR_PHRASE, ZENDO_OPERATOR_PASSWORD
 * and ZENDO_OPERATOR_PIN in the environment for a real deployment.
 */
const BUILD_PHASE =
  process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";

function required(name: string, fallback: string): string {
  const value = (process.env[name] || "").trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production" && !BUILD_PHASE) {
    throw new Error(`Set ${name} before starting in production. The repository default is for development and tests only.`);
  }
  return fallback;
}

const DEV_OPERATOR_PHRASE = [
  "ocean",
  "vintage",
  "glue",
  "ritual",
  "canyon",
  "muffin",
  "holiday",
  "story",
  "velvet",
  "anchor",
  "picnic",
  "zone",
];

export const ZENDO_OPERATOR = {
  email: "operator@zendo.dev",
  displayName: "Zendo Operator",
  get password(): string {
    return required("ZENDO_OPERATOR_PASSWORD", "Harbor-Lamp-42");
  },
  get pin(): string {
    return required("ZENDO_OPERATOR_PIN", "2580");
  },
  get phrase(): string[] {
    const raw = (process.env.ZENDO_OPERATOR_PHRASE || "").trim();
    if (raw) return raw.split(/\s+/);
    if (process.env.NODE_ENV === "production" && !BUILD_PHASE) {
      throw new Error("Set ZENDO_OPERATOR_PHRASE before starting in production. The repository default is for development and tests only.");
    }
    return [...DEV_OPERATOR_PHRASE];
  },
};

export const EMOJIS = ["🐸", "🍜", "🐱", "👻", "🔥", "🌙", "🪙", "🐉", "🎲", "🌊", "⚡", "🍄", "🐧", "🦁", "🎯", "🪐", "🍀", "👾", "🦊", "🌵"] as const;

export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app";
  return value;
}
