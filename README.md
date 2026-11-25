# Casino Portal — Phase 2 local demo

A plain-local Next.js App Router + TypeScript + Tailwind + PostgreSQL/Prisma portal with authentication, admin settings, a wallet-request review queue, ledger-backed balance adjustments, and one server-settled demo slot. This is not a real-money product: no payment processor or third-party game aggregator is connected.

## Requirements

- Node.js 24.x (Prisma 7 also supports Node 20.19+ or 22.12+)
- Docker Desktop with Compose, or a separately managed PostgreSQL database
- Windows PowerShell commands use `npm.cmd` because this computer blocks the `npm.ps1` shim under its current PowerShell execution policy.

## Local setup (PowerShell)

```powershell
# Create .env only for a fresh checkout; keep it private and out of version control
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste the generated value into SESSION_SECRET in .env

# Start this project's PostgreSQL service (Docker Desktop must be running)
docker compose up -d db

npm.cmd install
npm.cmd run db:generate
npm.cmd exec -- prisma db push
npm.cmd run db:seed
npm.cmd run dev
```

Open `http://localhost:3000`. For an existing Phase 1 database, keep the current `.env` and run `npm.cmd run db:generate` followed by `npm.cmd exec -- prisma db push`; the Phase 2 settings use Prisma field mappings to preserve the existing deposit/withdraw/contact values, and Prisma adds the `maintenanceMode` field. To stop the local database, use `docker compose down` (this retains the named data volume); do not use `-v` unless you intend to erase local database data.

Default seed credentials: **admin / admin123**. Change this password before any shared or internet-facing deployment. The seed does not overwrite the password of an existing `admin` account.

## Routes and behavior

- `/register`, `/login`: Phase 1 registration/login; secure HTTP-only session cookie.
- `/`: protected player lobby with wallet bar, mock Slot/Dice/Crash cards, contact-agent fallback, deposit/withdraw request modals, and the latest 20 transactions.
- `/games/demo-slot`: playable local demo. Server generates outcomes; each bet debit and any win credit are done atomically with `Wallet` updates and `BET`/`WIN` ledger rows. A unique per-user spin reference makes retries idempotent.
- `/admin`: ADMIN-only, responsive back office with dashboard period filters, turnover/payout/net/deposit/withdrawal/player metrics, searchable player operations (balance adjustments with remarks, lock/unlock, password reset with session revocation), a pending request queue, and an operator-attributed fund ledger that keeps rejected decisions visible.
- `/admin` game controls: database-backed `GameConfig` entries (including seeded Jade Reels, Jade Dice, and Jade Flight defaults), RTP (80%–99%), enable state, and min/max bets. Each changed field is recorded with its previous/new value, operator, and timestamp in `GameConfigAudit`.
- `/games/demo-slot`: shows the saved Jade Reels RTP and bet limits; disabled or maintenance-mode games cannot be played. The API independently enforces game status and bet bounds and settles demo outcomes server-side.
- `/api/wallet/requests`: submits pending player deposit/withdraw requests. Submitting a request does not change balance; admin approval settles it atomically, and rejection leaves the balance unchanged.
- `/api/admin/settings`, `/api/admin/adjustments`, `/api/admin/requests/[id]`, `/api/admin/players/[id]`, `/api/admin/players/[id]/password`, `/api/admin/games/[gameKey]`: administrator-only APIs with role checks, input validation, operator attribution, and auditable changes.
- `/api/games/demo-slot`: authenticated player game endpoint. Wallet writes are conditional/atomic and ledgered in a serializable database transaction.
- `/api/auth/logout`, `/api/auth/me`: sign out and profile/settings API.

All monetary fields remain PostgreSQL `DECIMAL(18,2)`/Prisma `Decimal`; user-entered amounts are validated as decimal strings. Debit operations check sufficient funds as part of the update to prevent concurrent overspending. Admin adjustment notes and request decisions are recorded on the transaction ledger. Player account locks and password resets bump a session version to invalidate existing player tokens.

The agent URL accepts HTTPS only. Self-service request and game endpoints are blocked during maintenance. Disabled self-service actions display the configured contact-agent link. Demo credits have no cash value; this application does not implement real payment processing, game-provider callbacks, a third-party aggregator, KYC, or production compliance controls.

## Structure

```text
prisma/
  schema.prisma                 includes GameConfig and GameConfigAudit
  seed.ts                        demo game defaults; preserves saved game config
src/
  app/
    (auth)/{login,register}/page.tsx
    (lobby)/page.tsx
    admin/page.tsx
    games/demo-slot/page.tsx
    api/auth/{register,login,logout,me}/route.ts
    api/admin/{settings,adjustments,requests/[id],games/[gameKey],players/[id]}/route.ts
    api/admin/players/[id]/password/route.ts
    api/wallet/requests/route.ts
    api/games/demo-slot/route.ts
  components/{auth-form,logout-button,lobby-dashboard,admin-console,demo-slot}.tsx
  generated/prisma/          generated by `db:generate`
  lib/{admin,prisma,session,validation}.ts
compose.yaml
```

The app reads the active user from the database on requests, so banned accounts are denied even if a signed cookie has not expired. `SESSION_SECRET` must be a unique value of at least 32 characters per environment. For any internet-facing deployment, replace the demo admin credential and complete a separate security/compliance review.
