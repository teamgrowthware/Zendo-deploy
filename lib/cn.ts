import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const marker = new Set(["pointer", "default", "text", "move", "wait", "not-allowed"]);

const twMerge = extendTailwindMerge({
  experimentalParseClassName({ className, parseClassName }) {
    const parts = className.split(":");
    let last = parts[parts.length - 1] ?? "";
    let bang = "";
    let minus = "";
    if (last.startsWith("!")) {
      bang = "!";
      last = last.slice(1);
    }
    if (last.startsWith("-")) {
      minus = "-";
      last = last.slice(1);
    }
    if (!last.startsWith("zendo-")) return parseClassName(className);
    const rest = last.slice("zendo-".length);
    if (!bang && !minus && marker.has(rest)) {
      return {
        modifiers: [],
        hasImportantModifier: false,
        baseClassName: className,
        maybePostfixModifierPosition: undefined,
        isExternal: true,
      };
    }
    parts[parts.length - 1] = `${bang}${minus}${rest}`;
    return parseClassName(parts.join(":"));
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
