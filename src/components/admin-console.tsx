"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { LogoutButton } from "@/components/logout-button";

type Section = "overview" | "players" | "funds" | "reports" | "games" | "system";
type Settings = { selfServiceDepositEnabled: boolean; selfServiceWithdrawEnabled: boolean; maintenanceMode: boolean; agentContactLink: string };
type Player = { id: string; username: string; displayName: string | null; contact: string | null; status: "ACTIVE" | "BANNED"; balance: string; currency: string; createdAt: string; lastActivityAt: string | null };
type WalletRequest = { id: string; username: string; type: "DEPOSIT" | "WITHDRAW"; amount: string; currency: string; note: string | null; createdAt: string };
type LedgerRow = { id: string; username: string; userId: string; type: string; amount: string; balanceBefore: string; balanceAfter: string; status: string; note: string | null; operator: string; createdAt: string };
type Game = { gameKey: string; name: string; rtpPercent: string; isEnabled: boolean; minBet: string; maxBet: string };
type GameAudit = { id: string; gameKey: string; configField: string; oldValue: string | null; newValue: string; actor: string; createdAt: string };
type Summary = { turnover: string; payouts: string; net: string; deposits: string; withdrawals: string; activePlayers: number; registeredPlayers: number };
type Props = { username: string; period: string; settings: Settings; summary: Summary; players: Player[]; requests: WalletRequest[]; ledger: LedgerRow[]; games: Game[]; gameAudits: GameAudit[] };
type GameDraft = { rtpPercent: string; isEnabled: boolean; minBet: string; maxBet: string };

const sections: { id: Section; label: string; index: string; group: string }[] = [
  { id: "overview", label: "Overview / Dashboard", index: "01", group: "Operations" },
  { id: "players", label: "Player List", index: "02", group: "Operations" },
  { id: "funds", label: "Fund In/Out Log", index: "03", group: "Finance" },
  { id: "reports", label: "Reports · Win/Loss & Ledger", index: "04", group: "Finance" },
  { id: "games", label: "Game & RTP Settings", index: "05", group: "Platform" },
  { id: "system", label: "System Toggles", index: "06", group: "Platform" }
];
const currency = (value: string, code = "THB") => `${code} ${value.replace(/^-/, "")}`;
const prettyDate = (value: string | null) => value ? new Date(value).toLocaleString() : "No sign-in recorded";
const statusText = (status: Player["status"]) => status === "ACTIVE" ? "Active" : "Locked";

export function AdminConsole({ username, period: initialPeriod, settings: initialSettings, summary, players, requests: initialRequests, ledger, games: initialGames, gameAudits }: Props) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("overview");
  const [period, setPeriod] = useState(initialPeriod);
  const [settings, setSettings] = useState(initialSettings);
  const [contactDraft, setContactDraft] = useState(initialSettings.agentContactLink);
  const [requests, setRequests] = useState(initialRequests);
  const [games, setGames] = useState(initialGames);
  const [gameDrafts, setGameDrafts] = useState<Record<string, GameDraft>>(() => Object.fromEntries(initialGames.map((game) => [game.gameKey, { rtpPercent: game.rtpPercent, isEnabled: game.isEnabled, minBet: game.minBet, maxBet: game.maxBet }])));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerAction, setPlayerAction] = useState<"adjust" | "password" | null>(null);
  const [adjustment, setAdjustment] = useState({ action: "CREDIT", amount: "", note: "" });
  const [newPassword, setNewPassword] = useState("");

  const visiblePlayers = useMemo(() => players.filter((player) => {
    const matchStatus = statusFilter === "ALL" || player.status === statusFilter;
    const needle = search.trim().toLowerCase();
    const matchSearch = !needle || [player.username, player.id, player.displayName ?? "", player.contact ?? ""].some((field) => field.toLowerCase().includes(needle));
    return matchStatus && matchSearch;
  }), [players, search, statusFilter]);

  function showFeedback(message: string, isError = false) {
    setError(isError ? message : "");
    setNotice(isError ? "" : message);
  }

  async function saveSettings(next: Settings, key: string) {
    setBusy(key); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Settings could not be saved.");
      setSettings(result.settings); setContactDraft(result.settings.agentContactLink); showFeedback("System settings saved."); router.refresh();
    } catch (reason) { showFeedback(reason instanceof Error ? reason.message : "Settings could not be saved.", true); }
    finally { setBusy(""); }
  }

  function toggleSetting(key: "selfServiceDepositEnabled" | "selfServiceWithdrawEnabled" | "maintenanceMode") {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next); void saveSettings(next, key);
  }

  async function decideRequest(id: string, action: "APPROVE" | "REJECT") {
    setBusy(`request:${id}`); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/requests/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request could not be processed.");
      setRequests((items) => items.filter((item) => item.id !== id)); showFeedback(`Wallet request ${result.result.status.toLowerCase()}.`); router.refresh();
    } catch (reason) { showFeedback(reason instanceof Error ? reason.message : "Request could not be processed.", true); }
    finally { setBusy(""); }
  }

  async function togglePlayer(player: Player) {
    const status = player.status === "ACTIVE" ? "BANNED" : "ACTIVE";
    setBusy(`player:${player.id}`); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/players/${player.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Player status could not be changed.");
      showFeedback(`${player.username} is now ${status === "ACTIVE" ? "active" : "locked"}.`); router.refresh();
    } catch (reason) { showFeedback(reason instanceof Error ? reason.message : "Player status could not be changed.", true); }
    finally { setBusy(""); }
  }

  async function submitPlayerAction(event: FormEvent) {
    event.preventDefault();
    if (!selectedPlayer || !playerAction) return;
    setBusy("player-action"); setError(""); setNotice("");
    try {
      const endpoint = playerAction === "adjust" ? "/api/admin/adjustments" : `/api/admin/players/${selectedPlayer.id}/password`;
      const body = playerAction === "adjust" ? { username: selectedPlayer.username, ...adjustment } : { password: newPassword };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Player action could not be completed.");
      const message = playerAction === "adjust" ? `${adjustment.action === "CREDIT" ? "Credited" : "Debited"} ${selectedPlayer.currency} ${adjustment.amount} for ${selectedPlayer.username}.` : `Password reset for ${selectedPlayer.username}; existing sessions were revoked.`;
      setSelectedPlayer(null); setPlayerAction(null); setAdjustment({ action: "CREDIT", amount: "", note: "" }); setNewPassword(""); showFeedback(message); router.refresh();
    } catch (reason) { showFeedback(reason instanceof Error ? reason.message : "Player action could not be completed.", true); }
    finally { setBusy(""); }
  }

  async function saveGame(event: FormEvent, gameKey: string) {
    event.preventDefault();
    const draft = gameDrafts[gameKey];
    if (!draft) return;
    setBusy(`game:${gameKey}`); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/games/${gameKey}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Game settings could not be saved.");
      const updated: Game = { ...result.game, rtpPercent: String(result.game.rtpPercent), minBet: String(result.game.minBet), maxBet: String(result.game.maxBet) };
      setGames((items) => items.map((game) => game.gameKey === gameKey ? updated : game));
      setGameDrafts((items) => ({ ...items, [gameKey]: { rtpPercent: updated.rtpPercent, isEnabled: updated.isEnabled, minBet: updated.minBet, maxBet: updated.maxBet } }));
      showFeedback(`${updated.name} settings saved and audit logged.`); router.refresh();
    } catch (reason) { showFeedback(reason instanceof Error ? reason.message : "Game settings could not be saved.", true); }
    finally { setBusy(""); }
  }

  const current = sections.find((item) => item.id === section)!;
  const sectionGroups = ["Operations", "Finance", "Platform"];

  function LedgerTable({ rows }: { rows: LedgerRow[] }) {
    return rows.length ? <div className="bo-table-scroll"><table className="bo-table"><thead><tr><th>Player</th><th>Type</th><th>Amount</th><th>Balance change</th><th>Status</th><th>Operator</th><th>Timestamp</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
      <td><strong>{row.username}</strong><small className="bo-subcell">{row.userId.slice(0, 12)}…</small></td>
      <td><span className={`bo-type-chip type-${row.type.toLowerCase()}`}>{row.type}</span></td>
      <td className={row.amount.startsWith("-") || row.type === "WITHDRAW" ? "bo-negative" : "bo-positive"}>{row.amount.startsWith("-") || row.type === "WITHDRAW" ? "−" : "+"}{currency(row.amount, "THB")}</td>
      <td className="bo-balance-diff">{currency(row.balanceBefore)} <span>→</span> {currency(row.balanceAfter)}</td>
      <td><span className={`bo-status-pill status-${row.status.toLowerCase()}`}>{row.status}</span></td><td>{row.operator}</td><td><time dateTime={row.createdAt}>{prettyDate(row.createdAt)}</time></td>
    </tr>)}</tbody></table></div> : <div className="bo-empty"><strong>No fund decisions in this period</strong><span>Approved, completed, or rejected requests and admin adjustments will be recorded here.</span></div>;
  }

  function RequestQueue() {
    return <section className="bo-panel">
      <div className="bo-panel-heading"><div><span className="bo-kicker">Needs review</span><h2>Pending fund requests</h2></div><span className="bo-count">{requests.length} open</span></div>
      {requests.length ? <div className="bo-request-list">{requests.map((item) => <article className="bo-request-row" key={item.id}>
        <div className="bo-request-meta"><span className={`bo-type-chip type-${item.type.toLowerCase()}`}>{item.type}</span><strong>{item.username}</strong><b>{currency(item.amount, item.currency)}</b><small>{item.note || "No operator note"} · {prettyDate(item.createdAt)}</small></div>
        <div className="bo-row-actions"><button className="bo-button bo-button-quiet" type="button" onClick={() => decideRequest(item.id, "REJECT")} disabled={Boolean(busy)}>Reject</button><button className="bo-button bo-button-primary" type="button" onClick={() => decideRequest(item.id, "APPROVE")} disabled={Boolean(busy)}>{busy === `request:${item.id}` ? "Working…" : "Approve"}</button></div>
      </article>)}</div> : <div className="bo-empty"><strong>Queue clear</strong><span>New player deposit and withdrawal requests will appear here.</span></div>}
    </section>;
  }

  function MetricCard({ label, value, detail, tone = "" }: { label: string; value: string; detail: string; tone?: string }) {
    return <article className="bo-metric"><span>{label}</span><strong className={tone}>{value}</strong><small>{detail}</small></article>;
  }

  return <div className="backoffice-shell">
    <aside className="bo-sidebar" aria-label="Administration navigation">
      <Link className="bo-brand" href="/admin"><span className="bo-brand-mark" aria-hidden="true">CP</span><span><strong>CASINO PORTAL</strong><small>OPERATIONS DESK</small></span></Link>
      {sectionGroups.map((group) => <div className="bo-nav-group" key={group}><p className="bo-nav-heading">{group}</p>{sections.filter((item) => item.group === group).map((item) => <button className={`bo-nav-item ${section === item.id ? "is-active" : ""}`} key={item.id} type="button" onClick={() => setSection(item.id)} aria-current={section === item.id ? "page" : undefined}><span className="bo-nav-index">{item.index}</span><span>{item.label}</span></button>)}</div>)}
      <div className="bo-sidebar-foot"><span className="bo-live-dot" aria-hidden="true" />Local demo environment<span>Back-office access</span></div>
    </aside>

    <div className="bo-main">
      <header className="bo-topbar"><div className="bo-topbar-path"><span>ADMINISTRATION</span><i>/</i><strong>{current.label}</strong></div><div className="bo-topbar-actions"><span className="bo-admin-profile"><span className="bo-avatar">{username.slice(0, 1).toUpperCase()}</span><span><strong>{username}</strong><small>Administrator</small></span></span><Link className="bo-button bo-button-quiet" href="/">Player lobby ↗</Link><LogoutButton /></div></header>
      <main className="bo-content">
        <div className="bo-page-heading"><div><span className="bo-kicker">Operations / {current.group}</span><h1>{current.label}</h1><p>Wallet controls, player operations, and server-side game configuration.</p></div><label className="bo-period"><span>Reporting period</span><select value={period} onChange={(event) => { const next = event.target.value; setPeriod(next); router.push(`/admin?period=${next}`); }}><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All time</option></select></label></div>
        {(error || notice) && <p className={error ? "bo-alert bo-alert-error" : "bo-alert bo-alert-success"} role={error ? "alert" : "status"}>{error || notice}</p>}

        {section === "overview" && <div className="bo-section-stack">
          <div className="bo-metric-grid">
            <MetricCard label="Total turnover / bets" value={`THB ${summary.turnover}`} detail="Completed player stakes" />
            <MetricCard label="Total wins / payouts" value={`THB ${summary.payouts}`} detail="Completed demo-game payouts" />
            <MetricCard label="Net win / loss" value={`THB ${summary.net}`} detail="Turnover less payouts" tone={Number(summary.net) >= 0 ? "bo-positive" : "bo-negative"} />
            <MetricCard label="Total deposits" value={`THB ${summary.deposits}`} detail="Approved / completed requests" />
            <MetricCard label="Total withdrawals" value={`THB ${summary.withdrawals}`} detail="Approved / completed requests" />
            <MetricCard label="Players" value={`${summary.activePlayers} / ${summary.registeredPlayers}`} detail="Active / registered accounts" />
          </div>
          <div className="bo-overview-grid"><RequestQueue /><section className="bo-panel"><div className="bo-panel-heading"><div><span className="bo-kicker">Player activity</span><h2>Latest fund movements</h2></div><button className="bo-text-button" type="button" onClick={() => setSection("funds")}>Open full log →</button></div><LedgerTable rows={ledger.slice(0, 7)} /></section></div>
          <p className="bo-footnote">Summary values are calculated from settled database transactions for the selected period. This demo has no sportsbook odds feed.</p>
        </div>}

        {section === "players" && <section className="bo-panel">
          <div className="bo-panel-heading bo-panel-heading-wrap"><div><span className="bo-kicker">Accounts</span><h2>Player directory</h2><p>Search by username, ID, display name, or contact. Missing profile details are not inferred.</p></div><span className="bo-count">{visiblePlayers.length} shown / {players.length}</span></div>
          <div className="bo-filters"><label className="bo-search"><span className="sr-only">Search players</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username, ID, name, contact" /></label><label className="bo-status-filter"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All players</option><option value="ACTIVE">Active</option><option value="BANNED">Locked</option></select></label></div>
          {visiblePlayers.length ? <div className="bo-table-scroll"><table className="bo-table bo-player-table"><thead><tr><th>Username / ID</th><th>Name / Contact</th><th>Wallet</th><th>Status</th><th>Created / Last activity</th><th>Quick actions</th></tr></thead><tbody>{visiblePlayers.map((player) => <tr key={player.id}>
            <td><strong>{player.username}</strong><small className="bo-subcell" title={player.id}>{player.id.slice(0, 14)}…</small></td>
            <td><span>{player.displayName || "Not provided"}</span><small className="bo-subcell">{player.contact || "Contact not provided"}</small></td>
            <td><strong>{currency(player.balance, player.currency)}</strong></td>
            <td><span className={`bo-status-pill ${player.status === "ACTIVE" ? "status-active" : "status-locked"}`}>{statusText(player.status)}</span></td>
            <td><span>{new Date(player.createdAt).toLocaleDateString()}</span><small className="bo-subcell">{prettyDate(player.lastActivityAt)}</small></td>
            <td><div className="bo-player-actions"><button type="button" onClick={() => { setSelectedPlayer(player); setPlayerAction("adjust"); }} className="bo-mini-action">Adjust</button><button type="button" onClick={() => { setSelectedPlayer(player); setPlayerAction("password"); }} className="bo-mini-action">Reset PW</button><button type="button" disabled={busy === `player:${player.id}`} onClick={() => void togglePlayer(player)} className="bo-mini-action">{busy === `player:${player.id}` ? "Saving…" : player.status === "ACTIVE" ? "Lock" : "Unlock"}</button></div></td>
          </tr>)}</tbody></table></div> : <div className="bo-empty"><strong>No players match those filters</strong><span>Adjust the search or status filter.</span></div>}
        </section>}

        {section === "funds" && <div className="bo-section-stack"><RequestQueue /><section className="bo-panel"><div className="bo-panel-heading bo-panel-heading-wrap"><div><span className="bo-kicker">Settled wallet activity</span><h2>Fund in / out ledger</h2><p>Player, request or adjustment amount, balance movement, timestamp, and acting operator.</p></div><span className="bo-count">{ledger.length} rows · {period === "all" ? "all time" : period}</span></div><LedgerTable rows={ledger} /></section></div>}

        {section === "reports" && <div className="bo-section-stack"><div className="bo-metric-grid bo-report-metrics"><MetricCard label="Turnover" value={`THB ${summary.turnover}`} detail="Sum of completed bets" /><MetricCard label="Payouts" value={`THB ${summary.payouts}`} detail="Sum of completed wins" /><MetricCard label="Net win / loss" value={`THB ${summary.net}`} detail="Turnover − payouts" tone={Number(summary.net) >= 0 ? "bo-positive" : "bo-negative"} /><MetricCard label="Deposits" value={`THB ${summary.deposits}`} detail="Settled fund-in" /><MetricCard label="Withdrawals" value={`THB ${summary.withdrawals}`} detail="Settled fund-out" /><MetricCard label="Player accounts" value={`${summary.activePlayers} / ${summary.registeredPlayers}`} detail="Active / registered" /></div><section className="bo-panel"><div className="bo-panel-heading"><div><span className="bo-kicker">Auditable source data</span><h2>Win/loss and ledger detail</h2></div></div><LedgerTable rows={ledger} /></section><p className="bo-footnote">Figures are derived from the wallet ledger. No odds feeds, sportsbook results, or external provider data are imported.</p></div>}

        {section === "games" && <div className="bo-section-stack"><section className="bo-panel"><div className="bo-panel-heading"><div><span className="bo-kicker">Server-side game controls</span><h2>Game & RTP configuration</h2><p>RTP is used by the server payout calculation. Changes are recorded field-by-field with operator and timestamp.</p></div></div>{games.length ? <div className="bo-game-config-grid">{games.map((game) => {
          const draft = gameDrafts[game.gameKey] ?? { rtpPercent: game.rtpPercent, isEnabled: game.isEnabled, minBet: game.minBet, maxBet: game.maxBet };
          return <form className="bo-game-config" key={game.gameKey} onSubmit={(event) => void saveGame(event, game.gameKey)}>
            <div className="bo-game-title"><div><span className="bo-kicker">{game.gameKey}</span><h3>{game.name}</h3></div><label className="bo-switch-label"><input type="checkbox" role="switch" checked={draft.isEnabled} onChange={(event) => setGameDrafts((items) => ({ ...items, [game.gameKey]: { ...draft, isEnabled: event.target.checked } }))} /><span>{draft.isEnabled ? "Enabled" : "Disabled"}</span></label></div>
            <label className="bo-field"><span>RTP percent</span><div className="bo-input-suffix"><input type="number" min="80" max="99" step="0.1" required value={draft.rtpPercent} onChange={(event) => setGameDrafts((items) => ({ ...items, [game.gameKey]: { ...draft, rtpPercent: event.target.value } }))} /><b>%</b></div><small>Allowed range: 80%–99%.</small></label>
            <div className="bo-game-bets"><label className="bo-field"><span>Minimum bet · THB</span><input type="number" min="0.01" max="9999999999999999.99" step="0.01" required value={draft.minBet} onChange={(event) => setGameDrafts((items) => ({ ...items, [game.gameKey]: { ...draft, minBet: event.target.value } }))} /></label><label className="bo-field"><span>Maximum bet · THB</span><input type="number" min="0.01" max="9999999999999999.99" step="0.01" required value={draft.maxBet} onChange={(event) => setGameDrafts((items) => ({ ...items, [game.gameKey]: { ...draft, maxBet: event.target.value } }))} /></label></div>
            <div className="bo-game-footer"><small>Saved configuration: {game.rtpPercent}% · {game.isEnabled ? "live" : "disabled"}</small><button className="bo-button bo-button-primary" type="submit" disabled={Boolean(busy)}>{busy === `game:${game.gameKey}` ? "Saving…" : "Save configuration"}</button></div>
          </form>;
        })}</div> : <div className="bo-empty"><strong>No game configuration found</strong><span>Run the seed script after applying the Prisma schema to create Jade Reels defaults.</span></div>}</section>
          <section className="bo-panel"><div className="bo-panel-heading"><div><span className="bo-kicker">Configuration history</span><h2>Game setting audit log</h2></div><span className="bo-count">Latest {gameAudits.length}</span></div>{gameAudits.length ? <div className="bo-table-scroll"><table className="bo-table"><thead><tr><th>Game</th><th>Setting</th><th>Previous</th><th>New</th><th>Operator</th><th>Timestamp</th></tr></thead><tbody>{gameAudits.map((item) => <tr key={item.id}><td>{item.gameKey}</td><td>{item.configField}</td><td>{item.oldValue ?? "—"}</td><td>{item.newValue}</td><td>{item.actor}</td><td><time dateTime={item.createdAt}>{prettyDate(item.createdAt)}</time></td></tr>)}</tbody></table></div> : <div className="bo-empty"><strong>No configuration changes recorded</strong><span>Updates to RTP, enabled state, and bet limits will appear here.</span></div>}</section>
          <p className="bo-footnote">Jade Reels is a local demo only. The configured RTP scales server-calculated payouts against its fixed demo outcome distribution; short-run results will vary and this is not a certified or regulated gaming engine.</p></div>}

        {section === "system" && <section className="bo-panel bo-system-panel"><div className="bo-panel-heading"><div><span className="bo-kicker">Global player experience</span><h2>System toggles</h2><p>Changes apply immediately to lobby actions and server endpoints.</p></div></div>
          <div className="bo-system-toggles"><label className="bo-system-toggle"><span><strong>Self-service deposits</strong><small>When off, players receive the configured agent contact link instead of a request form.</small></span><input type="checkbox" role="switch" checked={settings.selfServiceDepositEnabled} onChange={() => toggleSetting("selfServiceDepositEnabled")} disabled={Boolean(busy)} /></label><label className="bo-system-toggle"><span><strong>Self-service withdrawals</strong><small>When off, players receive the configured agent contact link instead of a request form.</small></span><input type="checkbox" role="switch" checked={settings.selfServiceWithdrawEnabled} onChange={() => toggleSetting("selfServiceWithdrawEnabled")} disabled={Boolean(busy)} /></label><label className="bo-system-toggle"><span><strong>Maintenance mode</strong><small>Blocks player wallet requests and all demo-game rounds.</small></span><input type="checkbox" role="switch" checked={settings.maintenanceMode} onChange={() => toggleSetting("maintenanceMode")} disabled={Boolean(busy)} /></label></div>
          <form className="bo-contact-form" onSubmit={(event) => { event.preventDefault(); void saveSettings({ ...settings, agentContactLink: contactDraft.trim() }, "contact"); }}><label className="bo-field"><span>Agent contact link</span><input type="url" required value={contactDraft} onChange={(event) => setContactDraft(event.target.value)} placeholder="https://t.me/your_support" /><small>HTTPS only. Shown when self-service funding is disabled.</small></label><button className="bo-button bo-button-primary" type="submit" disabled={Boolean(busy)}>{busy === "contact" ? "Saving…" : "Save contact link"}</button></form>
          <p className="bo-footnote">Player Lobby is kept separate from back-office navigation. No external payment or sportsbook service is configured.</p>
        </section>}
      </main>
    </div>

    {selectedPlayer && playerAction && <div className="bo-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) { setSelectedPlayer(null); setPlayerAction(null); } }}><section className="bo-modal" role="dialog" aria-modal="true" aria-labelledby="player-modal-title"><button className="bo-modal-close" type="button" aria-label="Close" onClick={() => { setSelectedPlayer(null); setPlayerAction(null); }}>×</button><span className="bo-kicker">Player operation · {selectedPlayer.username}</span><h2 id="player-modal-title">{playerAction === "adjust" ? "Balance adjustment" : "Reset player password"}</h2>{playerAction === "password" && <p className="bo-modal-copy">Choose a temporary password of 8–72 UTF-8 bytes. The player's existing sessions will be revoked.</p>}
      <form className="bo-modal-form" onSubmit={submitPlayerAction}>{playerAction === "adjust" ? <><label className="bo-field"><span>Direction</span><select value={adjustment.action} onChange={(event) => setAdjustment((value) => ({ ...value, action: event.target.value }))}><option value="CREDIT">Add funds</option><option value="DEBIT">Deduct funds</option></select></label><label className="bo-field"><span>Amount · {selectedPlayer.currency}</span><input type="number" min="0.01" max="9999999999999999.99" step="0.01" required value={adjustment.amount} onChange={(event) => setAdjustment((value) => ({ ...value, amount: event.target.value }))} /></label><label className="bo-field"><span>Operator remark</span><input required minLength={3} maxLength={240} value={adjustment.note} onChange={(event) => setAdjustment((value) => ({ ...value, note: event.target.value }))} placeholder="Reason saved to the ledger" /></label></> : <label className="bo-field"><span>New temporary password</span><input type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>}
      {error && <p className="bo-alert bo-alert-error" role="alert">{error}</p>}<div className="bo-modal-actions"><button type="button" className="bo-button bo-button-quiet" onClick={() => { setSelectedPlayer(null); setPlayerAction(null); }}>Cancel</button><button type="submit" className="bo-button bo-button-primary" disabled={Boolean(busy)}>{busy === "player-action" ? "Working…" : playerAction === "adjust" ? "Apply and log" : "Reset password"}</button></div></form>
    </section></div>}
  </div>;
}
