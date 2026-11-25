"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LogoutButton } from "@/components/logout-button";

type Settings = { selfServiceDepositEnabled: boolean; selfServiceWithdrawEnabled: boolean; maintenanceMode: boolean; agentContactLink: string };
type HistoryItem = { id: string; type: string; amount: string; status: string; note: string | null; createdAt: string };
type Props = { username: string; role: string; balance: string; currency: string; demoSlotEnabled: boolean; settings: Settings; history: HistoryItem[] };

const labels: Record<string, string> = { DEPOSIT: "Deposit", WITHDRAW: "Withdrawal", BET: "Game bet", WIN: "Game win", ADJUSTMENT: "Admin adjustment" };

export function LobbyDashboard({ username, role, balance, currency, demoSlotEnabled, settings, history }: Props) {
  const router = useRouter();
  const [modalType, setModalType] = useState<"DEPOSIT" | "WITHDRAW" | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    if (!modalType) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/wallet/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: modalType, amount, note }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request could not be submitted.");
      setMessage(`${modalType === "DEPOSIT" ? "Deposit" : "Withdrawal"} request submitted for admin review.`);
      setModalType(null); setAmount(""); setNote(""); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Request could not be submitted."); }
    finally { setBusy(false); }
  }

  return (
    <main className="page-shell">
      <div className="lobby-shell lobby-wide">
        <header className="lobby-header">
          <div className="lobby-label">Casino portal <span aria-hidden="true">/</span> lobby</div>
          <nav className="header-actions" aria-label="Account navigation">
            {role === "ADMIN" && <Link className="text-link" href="/admin">Admin panel</Link>}
            <span className="header-user">{username}</span>
            <LogoutButton />
          </nav>
        </header>

        <section className="wallet-bar surface" aria-label="Wallet and account actions">
          <div><span className="eyebrow">Available wallet</span><strong className="wallet-bar-amount">{currency} {balance}</strong><span className="wallet-bar-caption">Balance updates after approved requests and completed rounds</span></div>
          <div className="wallet-actions">
            {settings.maintenanceMode ? <button className="secondary-button" type="button" disabled>Wallet actions paused</button> : <>
              {settings.selfServiceDepositEnabled ? <button className="primary-button" type="button" onClick={() => { setModalType("DEPOSIT"); setError(""); }}>Deposit</button> : <a className="secondary-button" href={settings.agentContactLink} target="_blank" rel="noopener noreferrer">Contact agent · deposit</a>}
              {settings.selfServiceWithdrawEnabled ? <button className="secondary-button" type="button" onClick={() => { setModalType("WITHDRAW"); setError(""); }}>Withdraw</button> : <a className="secondary-button" href={settings.agentContactLink} target="_blank" rel="noopener noreferrer">Contact agent · withdraw</a>}
            </>}
          </div>
        </section>
        {settings.maintenanceMode && <div className="maintenance-banner" role="status"><strong>Maintenance mode</strong><span>Wallet requests and games are temporarily paused. Contact the agent for assistance.</span><a href={settings.agentContactLink} target="_blank" rel="noopener noreferrer">Contact agent</a></div>}
        {message && <p className="success-banner" role="status">{message}</p>}

        <section className="lobby-intro" aria-labelledby="lobby-title">
          <div><p className="eyebrow">Player lobby</p><h1 className="lobby-title" id="lobby-title">Good evening, {username}.</h1><p className="lobby-subtitle">Choose a demo table. Every round is settled against your wallet ledger.</p></div>
          <span className="status-chip"><span className="status-dot" aria-hidden="true" />Account active</span>
        </section>

        <section className="game-grid" aria-label="Games">
          <Link className="game-card game-card-featured" href={settings.maintenanceMode || !demoSlotEnabled ? "#games" : "/games/demo-slot"} aria-disabled={settings.maintenanceMode || !demoSlotEnabled} onClick={(event) => (settings.maintenanceMode || !demoSlotEnabled) && event.preventDefault()}>
            <div className="game-art slot-art" aria-hidden="true"><span>♛</span><span>◆</span><span>♛</span></div>
            <div className="game-card-body"><span className="game-tag">{demoSlotEnabled ? "PLAYABLE DEMO" : "DISABLED BY ADMIN"}</span><h2>Jade Reels</h2><p>A three-reel slot with server-set outcomes and wallet-backed rounds.</p><span className="game-cta">{settings.maintenanceMode ? "Temporarily paused" : demoSlotEnabled ? "Play demo slot →" : "Currently unavailable"}</span></div>
          </Link>
          <article className="game-card">
            <div className="game-art dice-art" aria-hidden="true"><span className="die">4</span><span className="die">6</span></div>
            <div className="game-card-body"><span className="game-tag muted-tag">COMING SOON</span><h2>Jade Dice</h2><p>A mock high-low table card. Gameplay will be added in a later phase.</p><span className="game-cta disabled-cta">Demo soon</span></div>
          </article>
          <article className="game-card">
            <div className="game-art crash-art" aria-hidden="true"><span className="crash-line">↗</span><span className="crash-mark">×</span></div>
            <div className="game-card-body"><span className="game-tag muted-tag">COMING SOON</span><h2>Jade Flight</h2><p>A mock crash-game card. No third-party aggregator or payment service is connected.</p><span className="game-cta disabled-cta">Demo soon</span></div>
          </article>
        </section>

        <section className="surface history-panel" aria-labelledby="history-title">
          <div className="section-heading"><div><p className="eyebrow">Wallet ledger</p><h2 id="history-title">Recent transactions</h2></div><span className="history-count">Latest {history.length}</span></div>
          {history.length ? <div className="history-list">
            {history.map((item) => <article className="history-row" key={item.id}>
              <div className="history-main"><span className={`history-marker marker-${item.type.toLowerCase()}`} aria-hidden="true" /><div><strong>{labels[item.type] ?? item.type}</strong><span className="history-note">{item.note?.startsWith("{") ? "Jade Reels demo round" : item.note ?? "—"}</span></div></div>
              <div className="history-amount-wrap"><strong className={item.amount.startsWith("-") || item.type === "WITHDRAW" ? "amount-negative" : "amount-positive"}>{item.amount.startsWith("-") || item.type === "WITHDRAW" ? "−" : "+"}{currency} {item.amount.replace(/^-/, "")}</strong><span className={`transaction-status status-${item.status.toLowerCase()}`}>{item.status}</span></div>
              <time className="history-date" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
            </article>)}
          </div> : <div className="empty-state"><strong>No transactions yet</strong><span>Your bets, wins, wallet requests, and admin adjustments will appear here.</span></div>}
        </section>
      </div>

      {modalType && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModalType(null); }}>
        <section className="request-modal surface" role="dialog" aria-modal="true" aria-labelledby="request-title">
          <button className="modal-close" type="button" aria-label="Close request" onClick={() => setModalType(null)}>×</button>
          <p className="eyebrow">Wallet request</p><h2 id="request-title">Request a {modalType === "DEPOSIT" ? "deposit" : "withdrawal"}</h2>
          <p className="lede">This request remains pending until an administrator reviews it. Your wallet balance will not change before approval.</p>
          <form className="form-stack" onSubmit={submitRequest}>
            <label className="field"><span className="field-label">Amount (THB)</span><input className="field-input" type="number" min="0.01" max="9999999999999999.99" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" autoFocus /></label>
            <label className="field"><span className="field-label">Note (optional)</span><input className="field-input" maxLength={240} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reference or short note" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</button>
          </form>
        </section>
      </div>}
    </main>
  );
}
