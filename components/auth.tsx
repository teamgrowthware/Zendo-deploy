"use client";

import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { EMOJIS, safeNext } from "@/lib/seed";
import { api } from "@/lib/sdk";
import { generateClientPhrase, identityFromPhrase, signProof, toHex, type BrowserIdentity } from "@/lib/l1/browser";
import { Button, Field, Input, Panel } from "./ui";
import { CopyButton, Logo } from "./chrome";

function AuthCard({ title, body, children, compactBranding = false }: { title: string; body: string; children: React.ReactNode; compactBranding?: boolean }) {
  return (
    <div className={`zendo-auth-card zendo-bg-dark zendo-mx-auto zendo-grid zendo-w-full zendo-max-w-lg zendo-gap-6 zendo-px-4 zendo-py-12${compactBranding ? " zendo-auth-card-compact-branding" : ""}`}>
      <div className="zendo-auth-card-logo"><Logo /></div>
      <div>
        <h1 className="zendo-font-syne zendo-font-display zendo-text-4xl zendo-font-bold zendo-tracking-tight zendo-text-lime">{title}</h1>
        <p className="zendo-mt-2 zendo-text-sm zendo-leading-6 zendo-text-muted">{body}</p>
      </div>
      <Panel className="zendo-border-gold">{children}</Panel>
    </div>
  );
}

function PasswordField({ value, onChange, label, autoComplete }: { value: string; onChange: (value: string) => void; label: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <div className="zendo-relative">
        <Input type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="zendo-pointer zendo-absolute zendo-right-3 zendo-top-2.5 zendo-text-muted" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((current) => !current)}>
          {show ? <EyeOff className="zendo-h-5 zendo-w-5" /> : <Eye className="zendo-h-5 zendo-w-5" />}
        </button>
      </div>
    </Field>
  );
}

export function PinPad({ onComplete, busy }: { onComplete: (pin: string) => void; busy?: boolean }) {
  const [pin, setPin] = useState("");
  function press(digit: string) {
    if (busy) return;
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4) onComplete(next);
  }
  return (
    <div className="zendo-grid zendo-justify-items-center zendo-gap-4">
      <div className="zendo-flex zendo-gap-3" aria-label="PIN progress">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className={`zendo-h-3 zendo-w-3 zendo-rounded-full ${index < pin.length ? "zendo-bg-lime" : "zendo-bg-line"}`} />
        ))}
      </div>
      <div className="zendo-grid zendo-grid-cols-3 zendo-gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button key={digit} type="button" className={`zendo-h-14 zendo-w-16 zendo-rounded-2xl zendo-bg-panel-2 zendo-text-lg zendo-font-semibold hover:zendo-bg-white/5 ${busy ? "zendo-wait" : "zendo-pointer"}`} onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
        <button type="button" className={`zendo-h-14 zendo-w-16 zendo-rounded-2xl zendo-text-sm zendo-text-muted ${busy ? "zendo-wait" : "zendo-pointer"}`} onClick={() => setPin("")}>Clear</button>
        <button type="button" className={`zendo-h-14 zendo-w-16 zendo-rounded-2xl zendo-bg-panel-2 zendo-text-lg zendo-font-semibold ${busy ? "zendo-wait" : "zendo-pointer"}`} onClick={() => press("0")}>0</button>
        <button type="button" className={`zendo-h-14 zendo-w-16 zendo-rounded-2xl zendo-text-sm zendo-text-muted ${busy ? "zendo-wait" : "zendo-pointer"}`} onClick={() => setPin((current) => current.slice(0, -1))}>Del</button>
      </div>
    </div>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "phrase" | "quiz" | "pin">("form");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ displayName: "", email: "", password: "", agree: false });
  const [pendingId, setPendingId] = useState("");
  const [challenge, setChallenge] = useState("");
  const [words, setWords] = useState<string[]>([]);
  const [quiz, setQuiz] = useState<number[]>([]);
  const [picks, setPicks] = useState(["", "", ""]);
  const [saved, setSaved] = useState(false);
  const identity = useRef<BrowserIdentity | null>(null);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.agree) {
      setError("Accept the terms and privacy policy to create an account.");
      return;
    }
    setBusy(true);
    try {
      const referral = localStorage.getItem("zendo_ref") || undefined;
      const list = await fetch("/bip39-english.txt").then((response) => response.text());
      const wordlist = list.split(/\s+/).filter(Boolean);
      const phrase = generateClientPhrase(wordlist);
      const wallet = identityFromPhrase(form.email.trim().toLowerCase(), phrase.join(" "));
      const indexes: number[] = [];
      while (indexes.length < 3) {
        const index = Math.floor(Math.random() * phrase.length);
        if (!indexes.includes(index)) indexes.push(index);
      }
      const result = await api<{ pendingId: string; challenge: string }>("/api/auth/signup-start", {
        method: "POST",
        body: JSON.stringify({ displayName: form.displayName, email: form.email, password: form.password, referral }),
      });
      identity.current = wallet;
      setPendingId(result.pendingId);
      setChallenge(result.challenge);
      setWords(phrase);
      setQuiz(indexes.sort((a, b) => a - b));
      setPicks(["", "", ""]);
      setStep("phrase");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start signup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPhrase(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const wallet = identity.current;
      if (!wallet) throw new Error("The wallet key left this screen. Start again.");
      const correct = quiz.every((index, position) => picks[position].trim().toLowerCase() === words[index]);
      if (!correct) throw new Error("Those words did not match.");
      const signature = signProof(wallet, "zendo-signup", challenge);
      await api("/api/auth/commit-seed", {
        method: "POST",
        body: JSON.stringify({ pendingId, publicKey: toHex(wallet.publicKey), signature }),
      });
      setStep("pin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Those words did not match.");
    } finally {
      setBusy(false);
    }
  }

  async function savePin(pin: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/set-pin", { method: "POST", body: JSON.stringify({ pendingId, pin }) });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the PIN.");
      setBusy(false);
    }
  }

  if (step === "phrase") {
    return (
      <AuthCard title="Write down the 12 words" body="These words were made on this device and never sent to Zendo. They are the only way back in if you lose the password and PIN.">
        <div className="zendo-grid zendo-grid-cols-2 zendo-gap-2 zendo-sm:zendo-grid-cols-3">
          {words.map((word, index) => (
            <div key={`${word}-${index}`} className="zendo-rounded-xl zendo-border zendo-border-line zendo-bg-ink zendo-px-3 zendo-py-2 zendo-text-sm">
              <span className="zendo-mr-2 zendo-text-xs zendo-text-muted">{index + 1}</span>
              {word}
            </div>
          ))}
        </div>
        <div className="zendo-mt-4 zendo-flex zendo-flex-wrap zendo-gap-2">
          <CopyButton value={words.join(" ")} label="Copy phrase" />
          <button
            type="button"
            className="zendo-pointer zendo-rounded-lg zendo-border zendo-border-line zendo-px-2 zendo-py-1 zendo-text-xs zendo-text-muted"
            onClick={() => {
              const blob = new Blob([`${words.join(" ")}\n\nZendo recovery phrase. Keep this offline.\n`], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "zendo-recovery-phrase.txt";
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download .txt
          </button>
        </div>
        <label className="zendo-mt-4 zendo-flex zendo-items-start zendo-gap-2 zendo-text-sm zendo-text-muted">
          <input type="checkbox" className="zendo-mt-1" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
          I stored these 12 words somewhere only I control.
        </label>
        {error ? <p className="zendo-mt-3 zendo-text-sm zendo-text-coral">{error}</p> : null}
        <Button className="zendo-mt-4 zendo-w-full" disabled={!saved} onClick={() => setStep("quiz")}>I stored the phrase</Button>
      </AuthCard>
    );
  }

  if (step === "quiz") {
    return (
      <AuthCard title="Confirm three words" body="Enter the words in the positions below. This checks that the phrase left the screen with you.">
        <form className="zendo-grid zendo-gap-3" onSubmit={confirmPhrase}>
          {quiz.map((index, position) => (
            <Field key={index} label={`Word ${index + 1}`}>
              <Input value={picks[position]} autoComplete="off" onChange={(event) => setPicks((current) => current.map((item, i) => (i === position ? event.target.value : item)))} />
            </Field>
          ))}
          {error ? <p className="zendo-text-sm zendo-text-coral">{error}</p> : null}
          <div className="zendo-flex zendo-gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("phrase")}>Show phrase</Button>
            <Button type="submit" disabled={busy} className="zendo-flex-1">{busy ? "Checking…" : "Confirm phrase"}</Button>
          </div>
        </form>
      </AuthCard>
    );
  }

  if (step === "pin") {
    return (
      <AuthCard title="Set a 4-digit PIN" body="You'll enter this after your password. It stays on this device's session, not in an email.">
        <PinPad busy={busy} onComplete={savePin} />
        {error ? <p className="zendo-mt-4 zendo-text-center zendo-text-sm zendo-text-coral">{error}</p> : null}
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your wallet" body="Email and password open the account. A 12-word phrase made on this device recovers it and signs your transactions. A PIN locks the session.">
      <form className="zendo-grid zendo-gap-4" onSubmit={start}>
        <Field label="Display name">
          <Input value={form.displayName} onChange={(event) => { const displayName = event.target.value; setForm((current) => ({ ...current, displayName })); }} required />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" value={form.email} onChange={(event) => { const email = event.target.value; setForm((current) => ({ ...current, email })); }} required />
        </Field>
        <PasswordField label="Password" autoComplete="new-password" value={form.password} onChange={(password) => setForm((current) => ({ ...current, password }))} />
        <p className="zendo-text-xs zendo-text-muted">Use 8 or more characters, with a letter and a number.</p>
        <label className="zendo-flex zendo-items-start zendo-gap-2 zendo-text-sm zendo-text-muted">
          <input type="checkbox" className="zendo-mt-1" checked={form.agree} onChange={(event) => { const agree = event.target.checked; setForm((current) => ({ ...current, agree })); }} />
          <span>I agree to the <Link href="/terms" className="zendo-text-lime">terms</Link> and <Link href="/privacy" className="zendo-text-lime">privacy policy</Link>. The <Link href="/whitepaper" className="zendo-text-lime">white paper</Link> describes the 12-word phrase, the PIN, and the closed faucet.</span>
        </label>
        {error ? <p className="zendo-text-sm zendo-text-coral">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Sign Up"}</Button>
        <div className="zendo-flex zendo-flex-wrap zendo-gap-3 zendo-text-sm">
          <Link href="/signin" className="zendo-text-lime">Log In</Link>
          <Link href="/forgot-password" className="zendo-text-lime">Forgot Password</Link>
          <Link href="/recover" className="zendo-text-lime">Recover Account</Link>
        </div>
        <p className="zendo-text-sm zendo-text-muted">New to the chain? <Link href="/onboarding" className="zendo-text-lime">Read the onboarding guide</Link> before you store the phrase.</p>
      </form>
      <span className="zendo-sr-only">{EMOJIS[0]}</span>
    </AuthCard>
  );
}

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = useMemo(() => safeNext(params.get("next")), [params]);
  const destination = next === "/app/settings" ? "Profile" : next === "/app" ? "Wallet" : null;
  const title = destination || "Sign in";
  const body = destination === "Wallet"
    ? "Sign in to access your Zendo wallet."
    : destination === "Profile"
      ? "Sign in to view and manage your profile."
      : "Password first, then the PIN. Each person has their own wallet address.";
  const [step, setStep] = useState<"password" | "pin">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ displayName: string }>("/api/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) });
      setName(result.displayName);
      setStep("pin");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not sign in.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function finish(pin: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/pin", { method: "POST", body: JSON.stringify({ pin }) });
      toast.success("Signed in");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "PIN failed.");
      setBusy(false);
    }
  }

  if (step === "pin") {
    return (
      <AuthCard title={`PIN for ${name}`} body="Four digits. Five misses pause entry for five minutes." compactBranding={Boolean(destination)}>
        <PinPad busy={busy} onComplete={finish} />
        {error ? <p className="zendo-mt-4 zendo-text-center zendo-text-sm zendo-text-coral">{error}</p> : null}
      </AuthCard>
    );
  }

  return (
    <AuthCard title={title} body={body} compactBranding={Boolean(destination)}>
      <form className="zendo-grid zendo-gap-4" onSubmit={submit}>
        <Field label="Email">
          <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <PasswordField label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
        {error ? <p className="zendo-text-sm zendo-text-coral">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? "Checking…" : "Log In"}</Button>
        <div className="zendo-flex zendo-justify-between zendo-text-sm">
          <Link href="/forgot-password" className="zendo-text-lime">Forgot Password</Link>
          <Link href="/recover" className="zendo-text-muted">Recover Account</Link>
        </div>
      </form>
    </AuthCard>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ link: string | null }>("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });
      setLink(result.link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue a reset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Forgot Password" body="This chain has no mail server, so a matching account shows the reset link here. It expires in 30 minutes. The PIN stays the same.">
      {link === undefined ? (
        <form className="zendo-grid zendo-gap-4" onSubmit={submit}>
          <Field label="Email">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>
          {error ? <p className="zendo-text-sm zendo-text-coral">{error}</p> : null}
          <Button type="submit" disabled={busy}>{busy ? "Looking up…" : "Create reset link"}</Button>
        </form>
      ) : (
        <div className="zendo-grid zendo-gap-3 zendo-text-sm">
          {link ? (
            <>
              <p>Reset link for this chain:</p>
              <a href={link} className="zendo-break-all zendo-text-lime">{link}</a>
              <CopyButton value={link} label="Copy link" />
            </>
          ) : (
            <p className="zendo-text-muted">If that email has an account, the link would appear here. Check the spelling, or recover with the 12 words.</p>
          )}
          <Link href="/recover" className="zendo-text-lime">Recover Account</Link>
        </div>
      )}
    </AuthCard>
  );
}

export function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Choose a new password" body="Your PIN does not change. Sign in with the new password and the existing PIN.">
      {done ? (
        <Link href="/signin" className="zendo-text-lime">Password updated. Sign in.</Link>
      ) : (
        <form className="zendo-grid zendo-gap-4" onSubmit={submit}>
          <PasswordField label="New password" autoComplete="new-password" value={password} onChange={setPassword} />
          {error ? <p className="zendo-text-sm zendo-text-coral">{error}</p> : null}
          <Button type="submit" disabled={busy || !token}>{busy ? "Saving…" : "Update password"}</Button>
          {!token ? <p className="zendo-text-sm zendo-text-coral">This page needs a reset token.</p> : null}
        </form>
      )}
    </AuthCard>
  );
}

export function RecoverForm() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", phrase: "", password: "", pin: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { pendingId, challenge } = await api<{ pendingId: string; challenge: string | null }>("/api/auth/recover-start", {
        method: "POST",
        body: JSON.stringify({ email: form.email }),
      });
      if (!challenge) throw new Error("That email and recovery phrase do not match an account with an on-chain key.");
      const wallet = identityFromPhrase(form.email.trim().toLowerCase(), form.phrase);
      const signature = signProof(wallet, "zendo-recover", challenge);
      await api("/api/auth/recover-proof", {
        method: "POST",
        body: JSON.stringify({ pendingId, signature, password: form.password, pin: form.pin }),
      });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed.");
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Recover with 12 words" body="The phrase is checked on this device and never sent to Zendo. This replaces the password and PIN. The wallet address stays the same, because you still hold the same key.">
      <form className="zendo-grid zendo-gap-4" onSubmit={submit}>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(event) => { const email = event.target.value; setForm((current) => ({ ...current, email })); }} required />
        </Field>
        <Field label="Recovery phrase" hint="Twelve words, in order.">
          <textarea className="zendo-min-h-24 zendo-w-full zendo-rounded-xl zendo-border zendo-border-line zendo-bg-ink zendo-px-3 zendo-py-2 zendo-text-sm" value={form.phrase} onChange={(event) => { const phrase = event.target.value; setForm((current) => ({ ...current, phrase })); }} />
        </Field>
        <PasswordField label="New password" autoComplete="new-password" value={form.password} onChange={(password) => setForm((current) => ({ ...current, password }))} />
        <Field label="New 4-digit PIN">
          <Input inputMode="numeric" maxLength={4} value={form.pin} onChange={(event) => { const pin = event.target.value.replace(/\D/g, "").slice(0, 4); setForm((current) => ({ ...current, pin })); }} required />
        </Field>
        {error ? <p className="zendo-text-sm zendo-text-coral">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? "Restoring…" : "Recover Account"}</Button>
      </form>
    </AuthCard>
  );
}
