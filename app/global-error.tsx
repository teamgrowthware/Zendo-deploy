"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0A0A0A", color: "#FFFFFF", fontFamily: "Outfit, sans-serif" }}>
        <main style={{ maxWidth: 480, margin: "0 auto", padding: "80px 16px" }}>
          <h1 style={{ fontSize: 32 }}>Zendo needs a reload</h1>
          <p>The page hit an error. Open the wallet again. A failed screen does not rewrite the ledger by itself.</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, background: "#C8FF00", color: "#0A0A0A", border: 0, borderRadius: 999, padding: "8px 16px", fontWeight: 700 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
