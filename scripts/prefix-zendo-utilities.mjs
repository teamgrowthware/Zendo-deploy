import fs from "fs";
import path from "path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = path.resolve(import.meta.dirname, "..");
const CLASS_TOKEN =
  /^(?:(?:[a-z][a-z0-9-]*(?:-\[[^\]]+\])?|\[[^\]]+\]):)*!?-?(?:[a-z][a-z0-9-]*(?:\.[0-9]+)?|\[[^\]]+\])(?:\/[a-z0-9.%]+)?(?:\[[^\]]+\])?$/;
const POINTER_UTILITY = new Set(["pointer", "default", "text", "move", "wait", "not-allowed"]);
const BARE = new Set([
  "relative", "absolute", "fixed", "sticky", "static", "block", "flex", "grid", "inline",
  "hidden", "table", "contents", "truncate", "uppercase", "lowercase", "italic", "underline",
  "antialiased", "collapse", "visible", "invisible", "grow", "shrink", "isolate", "transform",
  "border", "rounded", "shadow", "transition", "group", "peer", "container", "sr-only",
]);
const MARKERS = new Set(["group", "peer"]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "zendo-utilities.css") continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(name)) out.push(full);
  }
  return out;
}

function splitVariant(token) {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[") depth++;
    else if (c === "]") depth = Math.max(0, depth - 1);
    else if (c === ":" && depth === 0) last = i;
  }
  if (last < 0) return { variants: "", utility: token };
  return { variants: token.slice(0, last + 1), utility: token.slice(last + 1) };
}

function baseUtility(token) {
  let { utility } = splitVariant(token);
  if (utility.startsWith("!")) utility = utility.slice(1);
  if (utility.startsWith("-")) utility = utility.slice(1);
  if (utility.startsWith("zendo-")) return null;
  return utility;
}

function prefixToken(token) {
  const { variants, utility } = splitVariant(token);
  let u = utility;
  let bang = "";
  let minus = "";
  if (u.startsWith("!")) {
    bang = "!";
    u = u.slice(1);
  }
  if (u.startsWith("-")) {
    minus = "-";
    u = u.slice(1);
  }
  if (u.startsWith("zendo-")) return token;
  return `${variants}${bang}${minus}zendo-${u}`;
}

function isClassToken(token) {
  return CLASS_TOKEN.test(token);
}

function isClassList(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 900) return false;
  const tokens = trimmed.split(/\s+/);
  if (!tokens.every(isClassToken)) return false;
  return tokens.some((token) => /[-:[\]]/.test(token) || BARE.has(baseUtility(token) || token));
}

function unprefixToken(token) {
  const { variants, utility } = splitVariant(token);
  let bang = "";
  let minus = "";
  let name = utility;
  if (name.startsWith("!")) {
    bang = "!";
    name = name.slice(1);
  }
  if (name.startsWith("-")) {
    minus = "-";
    name = name.slice(1);
  }
  if (name.startsWith("zendo-")) name = name.slice("zendo-".length);
  if (POINTER_UTILITY.has(name) || name === "bg-dark" || name === "text-dark" || name === "shadow-soft") return null;
  return `${variants}${bang}${minus}${name}`;
}

function collectTokens(value, into) {
  if (!isClassList(value)) return;
  for (const token of value.trim().split(/\s+/)) {
    const raw = unprefixToken(token);
    if (raw) into.add(raw);
  }
}

function skipComment(source, i) {
  if (source[i] === "/" && source[i + 1] === "/") {
    const end = source.indexOf("\n", i);
    return end < 0 ? source.length : end;
  }
  if (source[i] === "/" && source[i + 1] === "*") {
    const end = source.indexOf("*/", i + 2);
    return end < 0 ? source.length : end + 2;
  }
  return i;
}

function scanStrings(source, onString) {
  let i = 0;
  while (i < source.length) {
    const skipped = skipComment(source, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const c = source[i];
    if (c === '"' || c === "'") {
      i++;
      let value = "";
      while (i < source.length) {
        if (source[i] === "\\") {
          value += source[i] + (source[i + 1] || "");
          i += 2;
          continue;
        }
        if (source[i] === c) break;
        value += source[i];
        i++;
      }
      onString(value);
      i++;
      continue;
    }
    if (c === "`") {
      i++;
      let value = "";
      while (i < source.length) {
        if (source[i] === "\\") {
          value += source[i] + (source[i + 1] || "");
          i += 2;
          continue;
        }
        if (source[i] === "$" && source[i + 1] === "{") {
          onString(value);
          i += 2;
          let depth = 1;
          while (i < source.length && depth) {
            const nested = skipComment(source, i);
            if (nested !== i) {
              i = nested;
              continue;
            }
            const n = source[i];
            if (n === '"' || n === "'" || n === "`") {
              let end = i;
              const walker = {
                on(value2) {
                  onString(value2);
                },
              };
              end = consumeStringLike(source, i, walker.on);
              i = end;
              continue;
            }
            if (n === "{") depth++;
            else if (n === "}") depth--;
            if (depth) i++;
          }
          if (source[i] === "}") i++;
          value = "";
          continue;
        }
        if (source[i] === "`") {
          onString(value);
          i++;
          break;
        }
        value += source[i];
        i++;
      }
      continue;
    }
    i++;
  }
}

function consumeStringLike(source, i, onString) {
  const c = source[i];
  if (c !== '"' && c !== "'" && c !== "`") return i;
  if (c !== "`") {
    i++;
    let value = "";
    while (i < source.length) {
      if (source[i] === "\\") {
        value += source[i] + (source[i + 1] || "");
        i += 2;
        continue;
      }
      if (source[i] === c) break;
      value += source[i];
      i++;
    }
    onString(value);
    return i + 1;
  }
  i++;
  let value = "";
  while (i < source.length) {
    if (source[i] === "\\") {
      value += source[i] + (source[i + 1] || "");
      i += 2;
      continue;
    }
    if (source[i] === "$" && source[i + 1] === "{") {
      onString(value);
      i += 2;
      let depth = 1;
      while (i < source.length && depth) {
        const nested = skipComment(source, i);
        if (nested !== i) {
          i = nested;
          continue;
        }
        const n = source[i];
        if (n === '"' || n === "'" || n === "`") {
          i = consumeStringLike(source, i, onString);
          continue;
        }
        if (n === "{") depth++;
        else if (n === "}") depth--;
        if (depth) i++;
      }
      if (source[i] === "}") i++;
      value = "";
      continue;
    }
    if (source[i] === "`") {
      onString(value);
      return i + 1;
    }
    value += source[i];
    i++;
  }
  return i;
}

function rewriteSource(source, valid) {
  let out = "";
  let i = 0;
  function takeQuoted(quote) {
    const quoteAt = i;
    i++;
    let value = "";
    while (i < source.length) {
      if (source[i] === "\\") {
        value += source[i] + (source[i + 1] || "");
        i += 2;
        continue;
      }
      if (source[i] === quote) break;
      value += source[i];
      i++;
    }
    i++;
    return quote + rewriteValue(value, valid, source, quoteAt) + quote;
  }
  function takeTemplate() {
    let text = "`";
    i++;
    let value = "";
    let valueAt = i;
    while (i < source.length) {
      if (source[i] === "\\") {
        value += source[i] + (source[i + 1] || "");
        i += 2;
        continue;
      }
      if (source[i] === "$" && source[i + 1] === "{") {
        text += rewriteValue(value, valid, source, valueAt) + "${";
        i += 2;
        let depth = 1;
        while (i < source.length && depth) {
          const skipped = skipComment(source, i);
          if (skipped !== i) {
            text += source.slice(i, skipped);
            i = skipped;
            continue;
          }
          const c = source[i];
          if (c === '"' || c === "'") {
            text += takeQuoted(c);
            continue;
          }
          if (c === "`") {
            text += takeTemplate();
            continue;
          }
          if (c === "{") depth++;
          else if (c === "}") depth--;
          if (depth) {
            text += c;
            i++;
          }
        }
        text += "}";
        i++;
        value = "";
        valueAt = i;
        continue;
      }
      if (source[i] === "`") {
        text += rewriteValue(value, valid, source, valueAt) + "`";
        i++;
        return text;
      }
      value += source[i];
      i++;
    }
    return text;
  }
  while (i < source.length) {
    const skipped = skipComment(source, i);
    if (skipped !== i) {
      out += source.slice(i, skipped);
      i = skipped;
      continue;
    }
    const c = source[i];
    if (c === '"' || c === "'") {
      out += takeQuoted(c);
      continue;
    }
    if (c === "`") {
      out += takeTemplate();
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function rewriteValue(value, valid, source, index) {
  if (!isClassList(value)) return value;
  const tokens = value.trim().split(/\s+/);
  const bareOnly = tokens.length === 1 && !/[-:[\]/]/.test(tokens[0]);
  if (bareOnly) {
    const before = source.slice(Math.max(0, index - 48), index);
    if (!/className\s*=\s*(?:\{`?|`)?\s*$/.test(before) && !/\bcn\(\s*$/.test(before) && !/\bcva\(\s*$/.test(before)) return value;
  }
  return value.replace(/(\s*)(\S+)/g, (full, space, token) => {
    if (!isClassToken(token)) return full;
    const utility = baseUtility(token);
    if (!utility || (!valid.has(utility) && !MARKERS.has(utility))) return full;
    return space + prefixToken(token);
  });
}

function escapeCss(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

function prefixCss(css, utilities) {
  const sorted = [...utilities].sort((a, b) => b.length - a.length);
  for (const utility of sorted) {
    const body = escapeCss(utility).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<=\\.|\\\\:)-?${body}(?![A-Za-z0-9_-])`, "g");
    css = css.replace(re, (match) => (match.startsWith("-") ? `-zendo-${match.slice(1)}` : `zendo-${match}`));
  }
  return css.replaceAll(":where(.group)", ":where(.zendo-group)").replaceAll(":where(.peer)", ":where(.zendo-peer)");
}

function stripLayer(css, name) {
  const needle = `@layer ${name}`;
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf(needle, i);
    if (at < 0) {
      out += css.slice(i);
      break;
    }
    const after = css.slice(at + needle.length).match(/^\s*\{/);
    if (!after) {
      out += css.slice(i, at + needle.length);
      i = at + needle.length;
      continue;
    }
    out += css.slice(i, at);
    let j = at + needle.length + after[0].length;
    let depth = 1;
    while (j < css.length && depth) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    i = j;
  }
  return out;
}

const files = [...walk(path.join(root, "app")), ...walk(path.join(root, "components"))];
const tokens = new Set();
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  scanStrings(source, (value) => collectTokens(value, tokens));
}

const theme = fs
  .readFileSync(path.join(root, "app/globals.css"), "utf8")
  .split("html {")[0]
  .replace('@import "tailwindcss";', '@import "tailwindcss" source(none);')
  .replace('@import "./zendo-utilities.css";\n', "");
const listed = [...tokens].join(" ");
const input = `${theme}\n@source inline(${JSON.stringify(listed)});\n`;
const compiled = await postcss([tailwind()]).process(input, { from: path.join(root, "app/zendo-probe.css") });
let css = compiled.css;

const valid = new Set();
const missed = [];
for (const token of tokens) {
  const utility = baseUtility(token);
  if (!utility) continue;
  const body = escapeCss(utility).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<=\\.|\\\\:)-?${body}(?![A-Za-z0-9_-])`);
  if (re.test(css) || MARKERS.has(utility)) valid.add(utility);
  else missed.push(utility);
}

css = stripLayer(prefixCss(css, valid), "base");
fs.writeFileSync(path.join(root, "app/zendo-utilities.css"), css);

let changed = 0;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const next = rewriteSource(source, valid);
  if (next !== source) {
    fs.writeFileSync(file, next);
    changed++;
  }
}

const globalsPath = path.join(root, "app/globals.css");
let globals = fs.readFileSync(globalsPath, "utf8");
if (!globals.includes("./zendo-utilities.css")) {
  globals = globals.replace('@import "tailwindcss";', '@import "tailwindcss";\n@import "./zendo-utilities.css";');
  fs.writeFileSync(globalsPath, globals);
}

console.log(JSON.stringify({ files: files.length, tokens: tokens.size, utilities: valid.size, changed, missed: [...new Set(missed)].sort() }, null, 2));
