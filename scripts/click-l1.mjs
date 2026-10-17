// Requires puppeteer-core and Chrome at /usr/bin/google-chrome.
// NODE is fine: node scripts/click-l1.mjs
import puppeteer from "puppeteer-core";

const base = process.env.ZENDO_BASE || "http://127.0.0.1:38471";
const steps = [];

function note(ok, name, detail) {
  steps.push({ ok, name, detail });
  console.log(`${ok ? "ok" : "fail"}  ${name}: ${detail}`);
}

async function submitNear(page, label) {
  await page.evaluate((label) => {
    const match = [...document.querySelectorAll("label")].find((el) => (el.innerText || "").trim().startsWith(label));
    const form = match && match.closest("form");
    if (!form) throw new Error(`no form for ${label}`);
    form.requestSubmit();
  }, label);
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 80)));
}

async function fillLabel(page, label, value) {
  const marked = await page.evaluate((label) => {
    document.querySelectorAll("[data-fill]").forEach((el) => el.removeAttribute("data-fill"));
    const match = [...document.querySelectorAll("label")].find((el) => (el.textContent || "").trim().startsWith(label));
    const input = match && match.querySelector("input, textarea");
    if (!input) return false;
    input.setAttribute("data-fill", "1");
    return true;
  }, label);
  if (!marked) throw new Error(`missing field ${label}`);
  const handle = await page.$("[data-fill='1']");
  await handle.click({ clickCount: 3 });
  await handle.type(value, { delay: 8 });
}

async function open(page, path) {
  const response = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const status = response ? response.status() : 0;
  await page.waitForFunction(() => !document.body.innerText.includes("Loading") && !document.body.innerText.includes("Opening Zendo L-1 Network"), { timeout: 8000 }).catch(() => {});
  const text = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  const crashed = /Application error|Unhandled Runtime Error|This page could not be found/i.test(text);
  return { status, text, crashed };
}

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

let page;
const pageErrors = [];
try {
  page = await browser.newPage();
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(msg.text());
  });
  await page.setViewport({ width: 1280, height: 900 });
  page.setDefaultTimeout(20000);

  const health = await fetch(`${base}/api/health`).then((res) => res.json());
  note(health.network === "zendo-1" && health.ok === true, "health", JSON.stringify(health));

  const routes = [
    ["/", "Zendo"],
    ["/zcoin", "ZendoCoin"],
    ["/launchpad", "Launchpad"],
    ["/launchpad/create", "Create"],
    ["/explorer", "Explorer"],
    ["/explorer/consensus", "Consensus"],
    ["/explorer/blocks", "Blocks"],
    ["/explorer/txs", "Transaction"],
    ["/explorer/validators", "Validator"],
    ["/explorer/staking", "Stak"],
    ["/explorer/stats", "Zendo"],
    ["/explorer/contracts", "Contract"],
    ["/explorer/addresses", "Address"],
    ["/market", "Market"],
    ["/governance", "Governance"],
    ["/governance/prop_fee", "fee"],
    ["/grants", "Grant"],
    ["/bridge", "bridge"],
    ["/assets", "asset"],
    ["/download", "ZendoDeployL1.zip"],
    ["/developers", "Developer"],
    ["/whitepaper", "Zendo"],
    ["/faq", "Zendo"],
    ["/about", "Zendo"],
    ["/contact", "Zendo"],
    ["/privacy", "Zendo"],
    ["/terms", "Zendo"],
    ["/signup", "Sign"],
    ["/forgot-password", "password"],
    ["/recover", "phrase"],
    ["/learn", "Zendo"],
    ["/onboarding", "Zendo"],
    ["/contracts", "Zendo"],
    ["/cross-platform", "Zendo"],
    ["/search", "Search"],
    ["/watch", "White paper"],
    ["/signin", "Sign in"],
  ];
  for (const [path, needle] of routes) {
    const view = await open(page, path);
    note(view.status === 200 && !view.crashed && view.text.toLowerCase().includes(needle.toLowerCase()), path, `status ${view.status}`);
  }

  await page.setViewport({ width: 390, height: 844 });
  const mobile = await open(page, "/");
  note(mobile.status === 200 && !mobile.crashed, "mobile home", `status ${mobile.status}`);
  await page.setViewport({ width: 1280, height: 900 });

  await open(page, "/signup");
  await fillLabel(page, "Display name", "Click Check");
  await fillLabel(page, "Email", "click-check@zendo.dev");
  await fillLabel(page, "Password", "Harbor-Lamp-42");
  await settle(page);
  await submitNear(page, "Email");
  await page.waitForFunction(() => document.body.innerText.includes("Accept the terms"), { timeout: 10000 });
  note(true, "signup terms error", "terms required");

  await open(page, "/signin");
  await fillLabel(page, "Email", "operator@zendo.dev");
  await fillLabel(page, "Password", "not-the-password");
  await settle(page);
  await submitNear(page, "Email");
  await page.waitForFunction(() => document.body.innerText.includes("Email or password is wrong."), { timeout: 10000 });
  note(true, "signin error", "rejected");

  await open(page, "/signin");
  await fillLabel(page, "Email", "operator@zendo.dev");
  await fillLabel(page, "Password", "Harbor-Lamp-42");
  await settle(page);
  await submitNear(page, "Email");
  await page.waitForFunction(() => document.body.innerText.includes("PIN for"), { timeout: 15000 });
  for (const digit of ["2", "5", "8", "0"]) {
    await page.evaluate((digit) => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === digit);
      if (!button) throw new Error(`PIN ${digit} missing`);
      button.click();
    }, digit);
  }
  await page.waitForFunction(() => location.pathname.startsWith("/app"), { timeout: 20000 });
  const wallet = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  note(!/Application error/i.test(wallet) && /Z/i.test(wallet), "signed-in wallet", page.url());

  const appRoutes = ["/app/send", "/app/stake", "/app/bridge", "/app/social", "/app/support", "/app/settings", "/app/admin", "/launchpad/create"];
  for (const path of appRoutes) {
    const view = await open(page, path);
    note(view.status === 200 && !view.crashed, path, `status ${view.status}`);
  }

  const dest = `znd1${"c".repeat(38)}`;
  await open(page, "/app/send");
  await page.waitForFunction(() => document.body.innerText.includes("Network fee is 0.001"), { timeout: 15000 });
  await fillLabel(page, "Recipient", dest);
  await fillLabel(page, "Amount", "0.01");
  await settle(page);
  await submitNear(page, "Recipient");
  await page.waitForFunction(() => location.pathname.startsWith("/explorer/tx/"), { timeout: 20000 });
  const receipt = await page.evaluate(() => document.body.innerText.slice(0, 2500));
  note(/0\.001/.test(receipt) && /ZCOIN|ZCoin|transfer/i.test(receipt), "send gas", page.url());

  const ticker = `L${Date.now().toString(36).slice(-5).toUpperCase()}`.replace(/[^A-Z0-9]/g, "X").slice(0, 8);
  await open(page, "/launchpad/create");
  await page.waitForFunction(() => document.body.innerText.includes("0.2 ZCoin"), { timeout: 15000 });
  await fillLabel(page, "Name", "L1 Gas Coin");
  await fillLabel(page, "Ticker", ticker);
  await fillLabel(page, "Description", "A coin created on zendo-1 to check the creation fee.");
  await settle(page);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === "Create Coin");
    if (!button) throw new Error("Create Coin missing");
    button.click();
  });
  await page.waitForFunction(() => location.pathname.startsWith("/launchpad/") && !location.pathname.endsWith("/create"), { timeout: 20000 });
  await page.waitForFunction(() => document.body.innerText.includes("You pay (ZCoin)"), { timeout: 20000 });
  note(true, "create coin", `${ticker} ${page.url()}`);

  await fillLabel(page, "You pay (ZCoin)", "0.05");
  await settle(page);
  await page.waitForFunction(() => document.body.innerText.includes("0.0005") || document.body.innerText.toLowerCase().includes("fee"), { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === "Buy");
    if (!button) throw new Error("Buy missing");
    button.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("Buy included") || document.body.innerText.includes("You hold"), { timeout: 20000 });
  const trade = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  note(/Buy included|You hold/i.test(trade), "trade gas", ticker);

  await open(page, "/app/stake");
  await page.waitForFunction(() => document.body.innerText.includes("Delegate"), { timeout: 15000 });
  const marked = await page.evaluate(() => {
    const input = document.querySelector("input[placeholder='Amount']");
    if (!input) return false;
    input.setAttribute("data-fill", "1");
    return true;
  });
  if (!marked) note(false, "delegate", "no amount box");
  else {
    const handle = await page.$("[data-fill='1']");
    await handle.click({ clickCount: 3 });
    await handle.type("1", { delay: 20 });
    const stakeResult = await page.evaluate(() => new Promise((resolve) => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === "Delegate");
      if (!button) {
        resolve("Delegate missing");
        return;
      }
      button.click();
      const start = Date.now();
      const timer = setInterval(() => {
        const text = document.body.innerText;
        if (text.includes("Delegated to")) {
          clearInterval(timer);
          resolve("included");
        } else if (text.includes("Could not delegate") || Date.now() - start > 8000) {
          clearInterval(timer);
          const claim = text.indexOf("Claimable");
          resolve(text.slice(claim, claim + 500));
        }
      }, 100);
    }));
    note(stakeResult === "included", "delegate", stakeResult);
  }

  await open(page, "/governance");
  await page.waitForFunction(() => document.body.innerText.includes("Vote Yes"), { timeout: 15000 });
  const vote = await page.evaluate(() => new Promise((resolve) => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === "Vote Yes");
    if (!button) {
      resolve("missing");
      return;
    }
    button.click();
    const start = Date.now();
    const timer = setInterval(() => {
      const text = document.body.innerText;
      if (text.includes("Vote recorded")) {
        clearInterval(timer);
        resolve("recorded");
      } else if (text.includes("Vote failed") || Date.now() - start > 8000) {
        clearInterval(timer);
        resolve(text.includes("Vote failed") ? "failed" : "quiet");
      }
    }, 100);
  }));
  note(vote === "recorded", "governance vote", vote);

  const bridge = await open(page, "/app/bridge");
  note(bridge.status === 200 && /Polygon|Withdraw/.test(bridge.text), "bridge desk", `status ${bridge.status}`);
  const desk = await open(page, "/app/admin");
  note(desk.status === 200 && /Account|health|Operator/.test(desk.text), "operator desk", `status ${desk.status}`);

  await page.setViewport({ width: 390, height: 844 });
  const phoneWallet = await open(page, "/app");
  note(phoneWallet.status === 200 && !phoneWallet.crashed, "mobile wallet", page.url());

  const deploy = await fetch(`${base}/ZendoDeployL1.zip`, { method: "HEAD" });
  const disposition = deploy.headers.get("content-disposition") || "";
  note(deploy.status === 200 && disposition.includes("filename=ZendoDeployL1.zip") && !disposition.includes("filename=\""), "deploy zip", disposition);
  const noisy = pageErrors.filter((line) => !/favicon|Download the React DevTools|404|401 \(Unauthorized\)|data-fill/.test(line));
  note(noisy.length === 0, "console", noisy.slice(0, 3).join(" | ") || "clean");
} catch (err) {
  note(false, "click run", err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}

const failed = steps.filter((step) => !step.ok);
console.log(`click ${steps.length - failed.length}/${steps.length}`);
if (failed.length) process.exit(1);
