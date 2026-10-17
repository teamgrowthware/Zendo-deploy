# Hosted Investor Demo preparation

This guide prepares, but does not deploy, the hosted Android investor demo.
The Android WebView must open one approved public HTTPS Zendo origin. The
Next.js frontend and `/api/*` handlers run on that same origin, so the existing
HTTP-only `SameSite=Lax` session cookies remain first-party.

## Required host environment

Set these only in the host's secret manager or untracked environment file:

- `ZENDO_PUBLIC_ORIGIN` — the exact approved `https://` origin.
- `ZENDO_JWT_SECRET` — at least 32 characters; use the same value for all app processes.
- `ZENDO_DATABASE_URL` — hosted PostgreSQL connection URL.
- `ZENDO_SECURE_COOKIES=1`.

`ZENDO_REDIS_URL` is optional for this single-instance investor demo.
`ZENDO_L1_RPC` must remain unset unless a separately approved local node proxy
is being operated; login, profile, and basic database-backed wallet views do
not require it.

Never put any of these values in source, the APK, or a `NEXT_PUBLIC_*` value.

## Hosted PostgreSQL setup

After the hosted PostgreSQL database and `ZENDO_DATABASE_URL` are available,
run the following from the repository on a trusted deployment worker:

```sh
npm ci
npm run db:migrate
npm run build
npm run host-check
```

`db:migrate` records checksums in `zendo_schema_migrations`; it is safe to run
again and refuses a changed applied migration. PostgreSQL stores the durable
documents, balances, replay guards, transfers, and chain indexes. A restart
uses the same database; it does not rely on the container filesystem.

## Android hosted build

After the domain is approved, set `ZENDO_NODE_URL` to the same exact public
HTTPS origin, with no path, query, credentials, localhost, emulator address,
private LAN host, or asset-loader host. Then build the `hostedDemo` variant.
The pre-build validation rejects invalid origins.

The hosted wrapper has no bundled `www` assets. It opens the configured origin
with `zendo_app=android`, hides the editable browser bar, and keeps WebView
navigations on that exact origin. This preserves same-origin `/api/*` calls and
secure first-party cookies.

Do not build, sign, deploy, or distribute this variant until the domain,
PostgreSQL URL, and server-side secrets have been approved.
