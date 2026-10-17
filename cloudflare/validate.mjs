const ACTIONS = new Set(["transfer", "withdraw", "deposit", "scan", "session"]);

export function validateEdgeEnvelope(input) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { ok: false, action: null, errors: ["Body must be a JSON object."] };
  }
  const action = input.action;
  if (!ACTIONS.has(action)) errors.push("Action must be transfer, withdraw, deposit, scan, or session.");
  if (action === "withdraw") {
    if (typeof input.recipient !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(input.recipient)) {
      errors.push("Polygon recipient must be a 0x address.");
    }
    if (!positiveAmount(input.amount)) errors.push("Amount must be greater than zero.");
  }
  if (action === "deposit") {
    if (typeof input.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) {
      errors.push("Deposit needs a Polygon transaction hash.");
    }
  }
  if (action === "transfer") {
    if (typeof input.to !== "string" || !/^znd1[0-9a-f]{38}$/.test(input.to)) errors.push("Transfer needs a znd1 address.");
    if (!positiveAmount(input.amount)) errors.push("Amount must be greater than zero.");
  }
  return { ok: errors.length === 0, action: typeof action === "string" ? action : null, errors };
}

function positiveAmount(value) {
  return typeof value === "string" && /^\d+(\.\d+)?$/.test(value) && Number(value) > 0;
}
