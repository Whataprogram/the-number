"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { classify } from "@/lib/classify";
import { normalize } from "@/lib/csv";
import { DEMO_FILES, DEMO_PROFILE } from "@/lib/demo";
import { computeNumber, type Alert, type Line, type NumberResult } from "@/lib/number";
import { federalEstimate, formatUSD } from "@/lib/tax";
import { ASSUMPTIONS, SOURCES, TAX_2026 } from "@/lib/taxConfig";
import type { Profile, Txn } from "@/lib/types";
import { PlaidButton } from "./PlaidButton";

type Tab = "home" | "money" | "alerts" | "cpa";

export default function App() {
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [profile, setProfile] = useState<Profile>(DEMO_PROFILE);
  const [source, setSource] = useState<string>("");
  const [tab, setTab] = useState<Tab>("home");
  const [parent, setParent] = useState(false);
  const [why, setWhy] = useState<{ title: string; body: string; txns?: Txn[] } | null>(null);
  const [toast, setToast] = useState<Alert | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const result = useMemo(() => (txns ? computeNumber(txns, profile) : null), [txns, profile]);

  async function loadDemo() {
    setLoading(true); setError("");
    try {
      const texts = await Promise.all(DEMO_FILES.map((f) => fetch(f).then((r) => r.text())));
      const all = texts.flatMap((t, i) => normalize(t, DEMO_FILES[i])).map(classify);
      setProfile(DEMO_PROFILE); setTxns(all); setSource("Demo: Chase + Cash App + Venmo (synthetic data)"); setTab("home");
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    try {
      const parts = await Promise.all([...files].map(async (f) => normalize(await f.text(), f.name)));
      const all = parts.flat().map(classify);
      setProfile({ ...DEMO_PROFILE, ownerName: "You", businessName: "Your business", parentRule: undefined, balances: [{ name: "Your accounts (edit in settings)", balanceCents: DEMO_PROFILE.balances.reduce((s, b) => s + b.balanceCents, 0) }] });
      setTxns(all); setSource(`Uploaded: ${[...files].map((f) => f.name).join(", ")}`); setTab("home");
    } catch (e) { setError((e as Error).message); }
  }

  function onPlaid(data: { txns: Txn[]; balances: Profile["balances"] }) {
    setProfile({ ...DEMO_PROFILE, ownerName: "You", businessName: "Connected bank", parentRule: undefined, balances: data.balances, asOf: new Date().toISOString().slice(0, 10) });
    setTxns(data.txns.map(({ kind: _k, reason: _r, ...raw }) => classify(raw))); setSource("Plaid Sandbox (test bank data)"); setTab("home");
  }

  function setKind(id: string, kind: "business_income" | "personal" | "business_expense") {
    setTxns((ts) => ts!.map((t) => t.id === id ? { ...t, kind, userSet: true, category: kind === "personal" ? "Personal" : kind === "business_income" ? "Customer payment" : "Business expense", reason: "You told us." } : t));
  }

  function simulate(kind: "job" | "spend") {
    if (!txns || !result) return;
    const id = `sim-${Date.now()}`;
    if (kind === "job") {
      const amt = 35000;
      const extra = federalEstimate(result.netProfitCents + amt).totalTaxCents - federalEstimate(result.netProfitCents).totalTaxCents;
      setTxns([...txns, classify({ id, date: profile.asOf, source: "Cash App", description: "house wash", counterparty: "New customer", amountCents: amt })]);
      setProfile((p) => ({ ...p, balances: p.balances.map((b, i) => i === 1 ? { ...b, balanceCents: b.balanceCents + amt } : b) }));
      setToast({ id, level: "info", title: `+${formatUSD(amt)} on Cash App: "house wash"`, body: `${formatUSD(extra)} of this belongs to the IRS. Your Number just went up by that much.` });
    } else {
      const amt = 42000;
      setTxns([...txns, classify({ id, date: profile.asOf, source: "Chase", description: "NIKE.COM", counterparty: "NIKE.COM", amountCents: -amt })]);
      const nextBal = result.balanceCents - amt;
      setProfile((p) => ({ ...p, balances: p.balances.map((b, i) => i === 0 ? { ...b, balanceCents: b.balanceCents - amt } : b) }));
      setToast({ id, level: "critical", title: `${formatUSD(amt)} at Nike.com`, body: `You're now ${formatUSD(result.theNumberCents - nextBal)} below your Number. That money was set aside for taxes.` });
    }
    window.setTimeout(() => setToast(null), 6500);
  }

  if (!txns || !result) return <Connect onDemo={loadDemo} onFiles={onFiles} onPlaid={onPlaid} loading={loading} error={error} />;

  const byId = new Map(txns.map((t) => [t.id, t]));
  const openLine = (l: Line) => setWhy({ title: l.label, body: l.why, txns: l.txnIds?.map((i) => byId.get(i)!).filter(Boolean).slice(-8) });

  return (
    <div className="min-h-screen pb-28" style={{ paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" }}>
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 py-5">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <div className="font-display text-lg font-700 leading-none" style={{ fontWeight: 700 }}>The Number</div>
            <div className="muted text-xs">{profile.businessName}{profile.age ? ` · age ${profile.age}` : ""} · as of {profile.asOf}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="card flex p-1 text-sm" role="tablist" aria-label="View">
            {(["Owner", "Parent"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={(v === "Parent") === parent} onClick={() => setParent(v === "Parent")} className="rounded-xl px-3 py-1.5 font-semibold" style={{ background: (v === "Parent") === parent ? "var(--card-2)" : "transparent" }}>{v}</button>
            ))}
          </div>
          <button className="btn btn-ghost !px-3 !py-2 text-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? "Light" : "Dark"}</button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5">
        {parent && <div className="card p-4 text-sm"><b>Parent view (read-only).</b> <span className="muted">You see the same Number and explanations as {profile.ownerName}. No spreadsheet needed.</span></div>}
        {tab === "home" && <Dashboard r={result} profile={profile} txns={txns} openLine={openLine} setWhy={setWhy} simulate={simulate} parent={parent} goReview={() => setTab("money")} />}
        {tab === "money" && <Money txns={txns} setKind={setKind} parent={parent} />}
        {tab === "alerts" && <Alerts r={result} />}
        {tab === "cpa" && <Cpa r={result} txns={txns} profile={profile} />}
        <p className="muted pb-4 text-center text-xs">Source: {source}. Educational estimate, not tax advice. Confirm with a CPA before filing.</p>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t" style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", backdropFilter: "blur(14px)", borderColor: "var(--line)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1 p-2 text-xs font-semibold">
          {([["home", "Dashboard"], ["money", `Sort${result.reviewCount ? ` (${result.reviewCount})` : ""}`], ["alerts", `Alerts (${result.alerts.length})`], ["cpa", "Send to CPA"]] as [Tab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className="rounded-xl px-2 py-2.5" style={{ background: tab === k ? "var(--card-2)" : "transparent", color: tab === k ? "var(--fg)" : "var(--muted)" }}>{label}</button>
          ))}
        </div>
      </nav>

      {why && <WhySheet {...why} onClose={() => setWhy(null)} />}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4" role="status">
          <div className="toast w-full max-w-[420px] rounded-2xl p-4 shadow-2xl" style={{ background: "var(--card-2)", border: `1px solid ${toast.level === "critical" ? "var(--red)" : "var(--line)"}` }}>
            <div className="muted mb-1 text-[11px] font-semibold uppercase tracking-wider">The Number · now</div>
            <div className="font-semibold">{toast.title}</div>
            <div className="muted mt-1 text-sm">{toast.body}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Logo() {
  return (
    <div className="grid h-10 w-10 place-items-center rounded-xl font-display text-lg font-bold" style={{ background: "var(--blue)", color: "#fff" }} aria-hidden>#</div>
  );
}

function useCountUp(target: number) {
  const [v, setV] = useState(target);
  const prev = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(target); prev.current = target; return; }
    const from = prev.current, start = performance.now(), dur = 900;
    let raf = 0;
    const step = (now: number) => { const p = Math.min(1, (now - start) / dur); const e = 1 - Math.pow(1 - p, 3); setV(Math.round(from + (target - from) * e)); if (p < 1) raf = requestAnimationFrame(step); else prev.current = target; };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function Dashboard({ r, profile, txns, openLine, setWhy, simulate, parent, goReview }: { r: NumberResult; profile: Profile; txns: Txn[]; openLine: (l: Line) => void; setWhy: (w: { title: string; body: string }) => void; simulate: (k: "job" | "spend") => void; parent: boolean; goReview: () => void }) {
  const shown = useCountUp(r.theNumberCents);
  const below = r.safeToSpendCents < 0;
  const pctOfBalance = Math.min(100, Math.round((r.theNumberCents / Math.max(1, Math.max(r.balanceCents, r.theNumberCents))) * 100));
  const balPct = Math.min(100, Math.round((r.balanceCents / Math.max(r.balanceCents, r.theNumberCents)) * 100));
  const recent = [...txns].filter((t) => t.date <= r.asOf).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);

  return (
    <>
      <section className="hero-glow card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="muted text-sm font-semibold">{parent ? `${profile.ownerName}'s Number` : "Your Number"}</div>
            <div className="font-display num mt-1 text-6xl font-extrabold tracking-tight sm:text-7xl" style={{ fontWeight: 800 }}>{formatUSD(shown)}</div>
            <p className="mt-2 max-w-xl text-base">Never let your accounts drop below this. It's the money that's already spoken for: <b>taxes you owe</b>, <b>one month of business costs</b> and <b>bills coming up</b>.</p>
          </div>
          <span className="chip" style={{ background: below ? "color-mix(in srgb, var(--red) 18%, transparent)" : "color-mix(in srgb, var(--green) 18%, transparent)", color: below ? "var(--red)" : "var(--green)" }}>
            {below ? `${formatUSD(-r.safeToSpendCents)} below` : "Above your Number"}
          </span>
        </div>

        <div className="mt-6">
          <div className="muted mb-2 flex justify-between text-xs font-semibold"><span>You have {formatUSD(r.balanceCents)}</span><span>{below ? "Nothing safe to spend yet" : `${formatUSD(r.safeToSpendCents)} safe to spend`}</span></div>
          <div className="relative h-4 overflow-hidden rounded-full" style={{ background: "var(--card-2)" }} aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${balPct}%`, background: below ? "var(--red)" : "var(--green)", opacity: .85 }} />
            <div className="absolute inset-y-0 w-[3px]" style={{ left: `calc(${pctOfBalance}% - 2px)`, background: "var(--fg)" }} />
          </div>
          <div className="muted mt-1 text-right text-[11px]">White line = your Number</div>
        </div>

        {profile.parentRule && (
          <button onClick={() => setWhy({ title: `Why ${profile.parentRule!.label} isn't enough`, body: `The rule of thumb is ${formatUSD(profile.parentRule!.amountCents)}. Your real Number is ${formatUSD(r.theNumberCents)}. The gap of ${formatUSD(r.theNumberCents - profile.parentRule!.amountCents)} comes mostly from self-employment tax (${formatUSD(r.fed.se.totalCents)}), which applies to anyone who nets $400+ working for themselves, at any age. Rules of thumb don't grow when your business does. Your Number does.` })}
            className="mt-5 w-full rounded-2xl p-4 text-left" style={{ background: "color-mix(in srgb, var(--amber) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--amber) 40%, transparent)" }}>
            <div className="font-semibold" style={{ color: "var(--amber)" }}>{profile.parentRule.label} is {formatUSD(r.theNumberCents - profile.parentRule.amountCents)} too low</div>
            <div className="muted text-sm">Tap to see why →</div>
          </button>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Owe so far" value={formatUSD(r.owedSoFarCents)} tone="amber" onWhy={() => setWhy({ title: "Owe so far", body: `On ${formatUSD(r.netProfitCents)} of profit this year (${formatUSD(r.incomeCents)} in, ${formatUSD(r.expensesCents)} business costs), you owe about ${formatUSD(r.fed.totalTaxCents)} in federal taxes: ${formatUSD(r.fed.se.totalCents)} self-employment tax + ${formatUSD(r.fed.incomeTaxCents)} income tax. Minus ${formatUSD(r.taxPaidCents)} already paid = ${formatUSD(r.owedSoFarCents)}.` })} />
        <Tile label="Already paid" value={formatUSD(r.taxPaidCents)} tone={r.taxPaidCents ? "green" : "red"} onWhy={() => setWhy({ title: "Already paid", body: r.taxPaidCents ? `You've paid ${formatUSD(r.taxPaidCents)} in estimated taxes this year.` : `No estimated tax payments found this year. When you work for yourself, nobody withholds taxes from your pay, so the IRS expects you to send them four times a year (estimated taxes).` })} />
        <Tile label="Save this month" value={formatUSD(r.saveThisMonthCents)} tone="blue" onWhy={() => setWhy({ title: "Save this month", body: `You owe ${formatUSD(r.owedSoFarCents)} and the next estimated payment is due ${r.next.due} (${r.next.daysLeft} days). Setting aside ${formatUSD(r.saveThisMonthCents)} a month gets you there.` })} />
        <Tile label="Safe to spend" value={r.safeToSpendCents < 0 ? "$0" : formatUSD(r.safeToSpendCents)} tone={r.safeToSpendCents < 0 ? "red" : "green"} onWhy={() => setWhy({ title: "Safe to spend", body: `You have ${formatUSD(r.balanceCents)}. Your Number is ${formatUSD(r.theNumberCents)}. Anything above your Number is yours to spend or reinvest. ${r.safeToSpendCents < 0 ? `Right now you're ${formatUSD(-r.safeToSpendCents)} short.` : ""}` })} />
        <Tile label={`Next tax due · ${r.next.due.slice(5).replace("-", "/")}`} value={`${r.next.daysLeft} days`} tone="muted" onWhy={() => setWhy({ title: "Next estimated tax payment", body: `Tax year 2026 estimated payments were due Apr 15, Jun 15 and Sep 15, and the last one is due Jan 15, 2027. ${r.missed.length ? `${r.missed.length} earlier payment(s) look missed, so paying soon keeps the penalty small.` : ""} Pay at irs.gov/payments.` })} />
      </section>

      <section className="grid gap-5 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <h2 className="font-display text-xl font-bold">How we got {formatUSD(r.theNumberCents)}</h2>
          <p className="muted mb-3 text-sm">Tap any line to see why.</p>
          <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
            {r.lines.map((l) => (
              <li key={l.key}>
                <button className="flex w-full items-center justify-between gap-3 py-3 text-left" onClick={() => openLine(l)}>
                  <span>{l.label}</span><span className="num font-semibold">{formatUSD(l.amountCents)}</span>
                </button>
              </li>
            ))}
            <li className="flex items-center justify-between py-3 font-bold"><span>Your Number</span><span className="num">{formatUSD(r.theNumberCents)}</span></li>
          </ul>
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-display text-xl font-bold">Try it live</h2>
          <p className="muted mb-4 text-sm">Watch the Number react to new money.</p>
          <div className="grid gap-2">
            <button className="btn btn-primary justify-center" onClick={() => simulate("job")}>New job paid: $350 on Cash App</button>
            <button className="btn btn-ghost justify-center" onClick={() => simulate("spend")}>Buy $420 sneakers</button>
          </div>
          {r.reviewCount > 0 && (
            <button onClick={goReview} className="mt-4 w-full rounded-2xl p-4 text-left" style={{ background: "var(--card-2)" }}>
              <div className="font-semibold">{r.reviewCount} payments need a quick answer</div>
              <div className="muted text-sm">Business or personal? Takes 30 seconds →</div>
            </button>
          )}
        </div>
      </section>

      <TaxCalendar r={r} />

      <section className="grid gap-5 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <h2 className="font-display text-xl font-bold">Money in vs. business costs</h2>
          <p className="muted mb-3 text-sm">2026, by month. Busy season shows up fast.</p>
          <BarChart data={r.monthly} />
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-display text-xl font-bold">Where business money goes</h2>
          <ul className="mt-3 space-y-3">
            {r.topCategories.slice(0, 6).map((c) => {
              const w = Math.round((c.amountCents / r.topCategories[0].amountCents) * 100);
              return (
                <li key={c.category}>
                  <div className="flex justify-between text-sm"><span>{c.category}</span><span className="num font-semibold">{formatUSD(c.amountCents)}</span></div>
                  <div className="mt-1 h-2 rounded-full" style={{ background: "var(--card-2)" }}><div className="h-2 rounded-full" style={{ width: `${w}%`, background: "var(--blue)" }} /></div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-display text-xl font-bold">Recent activity</h2>
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
          {recent.map((t) => <TxnRow key={t.id} t={t} />)}
        </ul>
      </section>
    </>
  );
}

// The IRS "quarters" aren't quarters: they cover 3, 2, 3 and 4 months. We plan monthly so the lumpy schedule never surprises you.
function TaxCalendar({ r }: { r: NumberResult }) {
  const months = [3, 2, 3, 4];
  return (
    <section className="card p-5">
      <h2 className="font-display text-xl font-bold">The IRS "quarters" aren't quarters</h2>
      <p className="muted mt-1 max-w-2xl text-sm">Estimated taxes are due four times a year, but the periods are lopsided: 3 months, then 2, then 3, then 4. That's how the law has worked for decades, and it trips up anyone with seasonal income. The Number plans it monthly instead, so a short period never sneaks up on you.</p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-4">
        {TAX_2026.quarterlyDueDates.map((q, i) => {
          const missed = r.missed.some((m) => m.due === q.due);
          const next = r.next.due === q.due;
          const color = missed ? "var(--red)" : next ? "var(--blue)" : "var(--muted)";
          return (
            <li key={q.due} className="rounded-2xl p-4" style={{ background: "var(--card-2)", border: `1px solid ${next ? "var(--blue)" : "var(--line)"}` }}>
              <div className="flex items-center justify-between text-xs font-semibold"><span>Payment {i + 1}</span><span style={{ color }}>{missed ? "Missed" : next ? "Next up" : "Upcoming"}</span></div>
              <div className="font-display num mt-1 text-lg font-bold">{q.due}</div>
              <div className="muted text-xs">Covers {q.covers}</div>
              <div className="mt-2 flex gap-1" aria-label={`${months[i]} months`}>{Array.from({ length: months[i] }).map((_, k) => <span key={k} className="h-2 flex-1 rounded-full" style={{ background: color, opacity: .8 }} />)}</div>
              <div className="muted mt-1 text-xs">{months[i]} months of income</div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm"><b>Your plan:</b> set aside {formatUSD(r.saveThisMonthCents)} a month until {r.next.due}. {r.missed.length > 0 && <span style={{ color: "var(--red)" }}>Earlier payments look missed, so paying now keeps the penalty small.</span>}</p>
    </section>
  );
}

function Tile({ label, value, tone, onWhy }: { label: string; value: string; tone: "amber" | "green" | "red" | "blue" | "muted"; onWhy: () => void }) {
  const color = tone === "muted" ? "var(--fg)" : `var(--${tone})`;
  return (
    <button onClick={onWhy} className="card p-4 text-left transition hover:-translate-y-0.5">
      <div className="muted text-xs font-semibold">{label}</div>
      <div className="font-display num mt-1 text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="muted mt-1 text-xs">Why? →</div>
    </button>
  );
}

const KIND_LABEL: Record<Txn["kind"], [string, string]> = {
  business_income: ["Business income", "var(--green)"],
  business_expense: ["Business cost", "var(--blue)"],
  personal: ["Personal", "var(--muted)"],
  transfer: ["Transfer", "var(--muted)"],
  tax_payment: ["Tax payment", "var(--green)"],
  review: ["Needs answer", "var(--amber)"],
};

function TxnRow({ t, children }: { t: Txn; children?: React.ReactNode }) {
  const [label, color] = KIND_LABEL[t.kind];
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="truncate font-medium">{t.description || "(no note)"}{t.counterparty && t.counterparty !== t.description && <span className="muted text-sm"> · {t.counterparty}</span>}</div>
        <div className="muted text-xs">{t.date} · {t.source} · <span style={{ color }}>{label}</span></div>
      </div>
      <div className="flex items-center gap-3">
        {children}
        <div className="num font-semibold" style={{ color: t.amountCents > 0 ? "var(--green)" : "var(--fg)" }}>{t.amountCents > 0 ? "+" : ""}{formatUSD(t.amountCents, { cents: true })}</div>
      </div>
    </li>
  );
}

function BarChart({ data }: { data: NumberResult["monthly"] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.incomeCents, d.expensesCents)));
  const W = 560, H = 200, pad = 28, bw = (W - pad) / data.length;
  const names = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full min-w-[320px]" role="img" aria-label="Monthly income and business costs">
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={pad} x2={W} y1={H - H * g} y2={H - H * g} stroke="var(--line)" />)}
        <text x={0} y={12} fontSize="10" fill="var(--muted)">{formatUSD(max)}</text>
        {data.map((d, i) => {
          const x = pad + i * bw + bw * 0.15, w = bw * 0.33;
          const hi = (d.incomeCents / max) * (H - 8), he = (d.expensesCents / max) * (H - 8);
          return (
            <g key={d.month}>
              <rect x={x} y={H - hi} width={w} height={hi} rx="3" fill="var(--green)"><title>{`${d.month} income ${formatUSD(d.incomeCents)}`}</title></rect>
              <rect x={x + w + 2} y={H - he} width={w} height={he} rx="3" fill="var(--blue)"><title>{`${d.month} costs ${formatUSD(d.expensesCents)}`}</title></rect>
              <text x={x + w} y={H + 16} fontSize="11" textAnchor="middle" fill="var(--muted)">{names[Number(d.month.slice(5)) - 1]}</text>
            </g>
          );
        })}
      </svg>
      <div className="muted mt-1 flex gap-4 text-xs"><span><span className="inline-block h-2 w-2 rounded-sm" style={{ background: "var(--green)" }} /> Money in</span><span><span className="inline-block h-2 w-2 rounded-sm" style={{ background: "var(--blue)" }} /> Business costs</span></div>
    </div>
  );
}

function Money({ txns, setKind, parent }: { txns: Txn[]; setKind: (id: string, k: "business_income" | "personal" | "business_expense") => void; parent: boolean }) {
  const review = txns.filter((t) => t.kind === "review");
  const [filter, setFilter] = useState<"all" | Txn["kind"]>("all");
  const list = txns.filter((t) => filter === "all" || t.kind === filter).sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <>
      <section className="card p-5">
        <h2 className="font-display text-2xl font-bold">Business or personal?</h2>
        <p className="muted text-sm">Payment apps mix everything together. Answer these and your Number gets exact. {review.length === 0 && "All sorted ✓"}</p>
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
          {review.map((t) => (
            <TxnRow key={t.id} t={t}>
              {!parent && (
                <div className="flex gap-2">
                  <button className="btn btn-primary !px-3 !py-1.5 text-sm" onClick={() => setKind(t.id, t.amountCents > 0 ? "business_income" : "business_expense")}>Business</button>
                  <button className="btn btn-ghost !px-3 !py-1.5 text-sm" onClick={() => setKind(t.id, "personal")}>Personal</button>
                </div>
              )}
            </TxnRow>
          ))}
        </ul>
        <p className="muted mt-3 text-xs">Tip: payment apps expect business payments on a business profile. Sorting keeps your books (and your account) legit.</p>
      </section>
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">All transactions</h2>
          <select className="btn btn-ghost !py-1.5 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter">
            <option value="all">All ({txns.length})</option>
            {Object.entries(KIND_LABEL).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
          {list.slice(0, 120).map((t) => <li key={t.id} className="list-none"><ul><TxnRow t={t} /></ul><div className="muted -mt-2 pb-2 text-xs">{t.reason}</div></li>)}
        </ul>
      </section>
    </>
  );
}

function Alerts({ r }: { r: NumberResult }) {
  const color = { critical: "var(--red)", warning: "var(--amber)", info: "var(--blue)" };
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl font-bold">Alerts</h2>
      <p className="muted text-sm">These go to the owner and the parent by text. Here's what they'd say right now.</p>
      {r.alerts.map((a) => (
        <div key={a.id} className="card p-4" style={{ borderLeft: `4px solid ${color[a.level]}` }}>
          <div className="font-semibold">{a.title}</div>
          <div className="muted text-sm">{a.body}</div>
        </div>
      ))}
    </section>
  );
}

function Cpa({ r, txns, profile }: { r: NumberResult; txns: Txn[]; profile: Profile }) {
  const csv = useMemo(() => {
    const rows = [["date", "source", "description", "counterparty", "amount", "type", "category"], ...txns.map((t) => [t.date, t.source, t.description, t.counterparty || "", (t.amountCents / 100).toFixed(2), t.kind, t.category || ""])];
    return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  }, [txns]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "the-number-cpa-ready-2026.csv"; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <section className="card p-6">
      <h2 className="font-display text-2xl font-bold">CPA-ready summary</h2>
      <p className="muted text-sm">One clean page for your accountant (or your parent). This is how you graduate to a CPA without showing up with a shoebox.</p>
      <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {([
          ["Business", profile.businessName], ["Tax year", "2026 (through " + r.asOf + ")"],
          ["Gross business income", formatUSD(r.incomeCents, { cents: true })], ["Business expenses", formatUSD(r.expensesCents, { cents: true })],
          ["Net profit", formatUSD(r.netProfitCents, { cents: true })], ["Self-employment tax (est.)", formatUSD(r.fed.se.totalCents, { cents: true })],
          ["Federal income tax (est.)", formatUSD(r.fed.incomeTaxCents, { cents: true })], ["Estimated payments made", formatUSD(r.taxPaidCents, { cents: true })],
          ["Unsorted items", String(r.reviewCount)], ["Missed estimated payments", r.missed.map((m) => m.due).join(", ") || "None"],
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b py-2" style={{ borderColor: "var(--line)" }}><dt className="muted">{k}</dt><dd className="num font-semibold">{v}</dd></div>
        ))}
      </dl>
      <h3 className="mt-5 font-semibold">Expenses by category</h3>
      <ul className="mt-1 text-sm">{r.topCategories.map((c) => <li key={c.category} className="flex justify-between py-1"><span>{c.category}</span><span className="num">{formatUSD(c.amountCents, { cents: true })}</span></li>)}</ul>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={download}>Download transactions (CSV)</button>
        <button className="btn btn-ghost" onClick={() => window.print()}>Print / save as PDF</button>
      </div>
      <details className="mt-5 text-sm"><summary className="cursor-pointer font-semibold">Assumptions and sources</summary>
        <ul className="muted mt-2 list-disc space-y-1 pl-5">{ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
        <ul className="mt-2 space-y-1">{Object.entries(SOURCES).map(([k, u]) => <li key={k}><a className="underline" style={{ color: "var(--blue)" }} href={u} target="_blank" rel="noreferrer">{k}</a></li>)}</ul>
      </details>
    </section>
  );
}

function WhySheet({ title, body, txns, onClose }: { title: string; body: string; txns?: Txn[]; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-black/50 sm:place-items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="card toast w-full max-w-lg p-6 sm:m-4" onClick={(e) => e.stopPropagation()} style={{ borderRadius: "22px 22px 0 0" }}>
        <div className="muted text-xs font-semibold uppercase tracking-wider">Why?</div>
        <h3 className="font-display mt-1 text-2xl font-bold">{title}</h3>
        <p className="mt-3 leading-relaxed">{body}</p>
        {txns && txns.length > 0 && (
          <>
            <div className="muted mt-4 text-xs font-semibold">FROM THESE TRANSACTIONS (latest)</div>
            <ul className="divide-y" style={{ borderColor: "var(--line)" }}>{txns.map((t) => <TxnRow key={t.id} t={t} />)}</ul>
          </>
        )}
        <button className="btn btn-primary mt-5 w-full justify-center" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

function Connect({ onDemo, onFiles, onPlaid, loading, error }: { onDemo: () => void; onFiles: (f: FileList | null) => void; onPlaid: (d: { txns: Txn[]; balances: Profile["balances"] }) => void; loading: boolean; error: string }) {
  return (
    <div className="min-h-screen" style={{ paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" }}>
      <div className="mx-auto max-w-5xl py-8">
        <div className="flex items-center gap-3"><Logo /><span className="font-display text-xl font-bold">The Number</span></div>
        <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl" style={{ textWrap: "balance" as never }}>Know what's actually yours.</h1>
            <p className="muted mt-5 max-w-lg text-lg">You started a business before you learned taxes. The Number reads your bank, Cash App and Venmo, finds what you owe, and tells you the one number you can't go below, and why.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <PlaidButton onData={onPlaid} />
              <button className="btn btn-ghost" onClick={onDemo} disabled={loading}>{loading ? "Loading…" : "See the demo (Jay, 17, pressure washing)"}</button>
            </div>
            <label className="muted mt-4 inline-block cursor-pointer text-sm underline">
              Or upload Chase / Cash App / Venmo CSV statements
              <input type="file" accept=".csv,text/csv" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
            </label>
            {error && <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>{error}</p>}
          </div>
          <div className="hero-glow card p-6">
            <div className="muted text-sm font-semibold">Your Number</div>
            <div className="font-display num text-6xl font-extrabold" style={{ fontWeight: 800 }}>$11,137</div>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex justify-between"><span className="muted">Self-employment tax</span><b className="num">$6,732</b></li>
              <li className="flex justify-between"><span className="muted">Federal income tax</span><b className="num">$3,133</b></li>
              <li className="flex justify-between"><span className="muted">One month of business costs</span><b className="num">$707</b></li>
              <li className="flex justify-between"><span className="muted">Bills coming up</span><b className="num">$565</b></li>
            </ul>
            <p className="muted mt-4 text-xs">Example from the demo account. Synthetic data.</p>
          </div>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {[["Connect", "Your bank, Cash App and Venmo. You don't switch banks."], ["Get your Number", "Taxes owed + one month of costs + bills. Real IRS math, done in code."], ["Get texted", "Before you dip below it, and before tax deadlines. Parents can see it too."]].map(([h, b]) => (
            <div key={h} className="card p-5"><div className="font-display text-lg font-bold">{h}</div><p className="muted mt-1 text-sm">{b}</p></div>
          ))}
        </div>
        <p className="muted mt-10 text-xs">Educational estimate, not tax advice. Free to see your Number. $49.99 per tax year for alerts, sorting, parent view and CPA export.</p>
      </div>
    </div>
  );
}
