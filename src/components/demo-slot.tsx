"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Round = { symbols: string[]; payout: string; balance: string; outcome: string; bet: string; rtpPercent: string };
const symbolGlyph: Record<string, string> = { CROWN: "♛", ORCHID: "✿", JADE: "◆", COIN: "◉", MOON: "◐" };

type Props = { username: string; balance: string; currency: string; maintenanceMode: boolean; gameEnabled: boolean; rtpPercent: string; minBet: string; maxBet: string };

export function DemoSlot({ username, balance, currency, maintenanceMode, gameEnabled, rtpPercent, minBet, maxBet }: Props) {
  const router = useRouter();
  const [bet, setBet] = useState("10.00");
  const [round, setRound] = useState<Round | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function spin() {
    setBusy(true); setError(""); setRound(null);
    try {
      const response = await fetch("/api/games/demo-slot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: bet, requestId: crypto.randomUUID() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The round could not be completed.");
      setRound(result.round); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The round could not be completed."); }
    finally { setBusy(false); }
  }

  return <main className="page-shell"><div className="game-page-shell">
    <header className="lobby-header"><Link className="lobby-label" href="/">‹ Casino portal <span aria-hidden="true">/</span> lobby</Link><span className="header-user">{username}</span></header>
    <section className="slot-stage surface">
      <div className="slot-topline"><div><p className="eyebrow">Demo game · server settled</p><h1 className="page-title">Jade Reels</h1></div><div className="slot-wallet"><span>Wallet balance</span><strong>{currency} {round?.balance ?? balance}</strong></div></div>
      <p className="slot-intro">A local demo only. No real-money deposits, payment processor, sportsbook feed, or game aggregator is connected.</p>
      <div className={`reel-window ${busy ? "reel-spinning" : ""}`} aria-live="polite" aria-label={round ? `Result: ${round.symbols.join(", ")}` : "Slot reels"}>
        {(round?.symbols ?? ["CROWN", "JADE", "COIN"]).map((symbol, index) => <div className="reel-cell" key={`${symbol}-${index}`}><span>{symbolGlyph[symbol] ?? "◆"}</span><small>{symbol}</small></div>)}
      </div>
      {round && <div className={`round-result ${Number(round.payout) > 0 ? "round-win" : ""}`} role="status"><strong>{round.outcome}</strong><span>{Number(round.payout) > 0 ? `Payout: ${currency} ${round.payout}` : "No payout this round"}</span></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {maintenanceMode && <p className="maintenance-banner" role="status">Game is paused during maintenance.</p>}
      {!gameEnabled && <p className="maintenance-banner" role="status">Jade Reels is disabled by the administrator.</p>}
      <div className="slot-controls">
        <label className="field"><span className="field-label">Bet amount ({currency})</span><input className="field-input" type="number" min={minBet} max={maxBet} step="0.01" value={bet} onChange={(event) => setBet(event.target.value)} disabled={busy || maintenanceMode || !gameEnabled} /></label>
        <button className="primary-button spin-button" type="button" onClick={spin} disabled={busy || maintenanceMode || !gameEnabled}>{busy ? "Spinning…" : "Spin reels"}</button>
      </div>
      <div className="paytable"><span><strong>Configured RTP</strong> · {rtpPercent}%</span><span><strong>Allowed bet</strong> · {currency} {minBet}–{maxBet}</span><span>Outcomes and payouts are generated on the server.</span></div>
    </section>
    <p className="page-note">Demo credits have no cash value. Displayed RTP is a configuration target, not a guarantee of short-run results or a regulatory certification.</p>
  </div></main>;
}
