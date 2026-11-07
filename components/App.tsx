"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { classify } from "@/lib/classify";
import { latestBalance, normalize } from "@/lib/csv";
import { DEMO_FILES, DEMO_PROFILE } from "@/lib/demo";
import { computeNumber, type Alert, type Line, type NumberResult } from "@/lib/number";
import { federalEstimate, formatUSD } from "@/lib/tax";
import { ASSUMPTIONS, SOURCES, TAX_2026 } from "@/lib/taxConfig";
import type { Profile, Txn } from "@/lib/types";
import { PlaidButton } from "./PlaidButton";

type Tab = "home" | "alerts" | "money" | "learn";
type Why = { title: string; body: string; txns?: Txn[] };

const dayNum = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;

export default function App() {
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [profile, setProfile] = useState<Profile>(DEMO_PROFILE);
  const [source, setSource] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [parent, setParent] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [why, setWhy] = useState<Why | null>(null);
  const [toast, setToast] = useState<Alert | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const result = useMemo(() => (txns ? computeNumber(txns, profile) : null), [txns, profile]);

  async function loadSampleBank() {
    setBusy("bank"); setError("");
    try {
      const r = await fetch("/api/plaid/demo", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setProfile({ ...DEMO_PROFILE, asOf: new Date().toISOString().slice(0, 10), balances: j.balances });
      setTxns(j.txns); setSource("Plaid Sandbox · test bank loaded with a realistic teen business"); setTab("home");
    } catch (e) {
      // Plaid unreachable (Wi-Fi, keys): fall back to the same data from local files so the demo never breaks.
      console.warn("Plaid sample bank unavailable:", (e as Error).message);
      await loadFiles("Sample statements (Plaid unavailable, so the same data was loaded offline)");
    } finally { setBusy(""); }
  }

  async function loadFiles(note?: string) {
    const texts = await Promise.all(DEMO_FILES.map((f) => fetch(f).then((r) => r.text())));
    setProfile(DEMO_PROFILE);
    setTxns(texts.flatMap((t, i) => normalize(t, DEMO_FILES[i])).map(classify));
    setSource(note || "Sample statements (Chase + Cash App + Venmo)"); setTab("home");
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    try {
      // Read and processed only in this browser. Nothing is uploaded to a server.
      const texts = await Promise.all([...files].map(async (f) => ({ name: f.name, text: await f.text() })));
      const all = texts.flatMap((f) => normalize(f.text, f.name)).map(classify);
      const balances = texts.map((f) => ({ name: f.name.replace(/\.csv$/i, ""), balanceCents: latestBalance(f.text) ?? 0 }));
      const last = all.reduce((m, t) => (t.date > m ? t.date : m), "2026-01-01");
      setProfile({ ...DEMO_PROFILE, ownerName: "You", businessName: "Your business", age: 0, parentRule: undefined, balances, bills: [], asOf: last });
      setTxns(all); setSource(`Your statements (${[...files].map((f) => f.name).join(", ")}), processed in your browser only`); setTab("home");
    } catch (e) { setError((e as Error).message); }
  }

  function onPlaid(data: { txns: Txn[]; balances: Profile["balances"] }) {
    setProfile({ ...DEMO_PROFILE, ownerName: "You", businessName: "Your business", age: 0, parentRule: undefined, balances: data.balances, bills: [], asOf: new Date().toISOString().slice(0, 10) });
    setTxns(data.txns); setSource("Your bank via Plaid"); setTab("home");
  }

  function setKind(id: string, kind: "business_income" | "personal" | "business_expense") {
    setTxns((ts) => ts!.map((t) => t.id === id ? { ...t, kind, userSet: true, category: kind === "personal" ? "Personal" : kind === "business_income" ? "Customer payment" : "Business expense", reason: "You told us." } : t));
  }

  function notify(a: Alert) { setToast(a); window.setTimeout(() => setToast(null), 6500); }

  function simulate(kind: "job" | "spend") {
    if (!txns || !result) return;
    const id = `sim-${Date.now()}`;
    if (kind === "job") {
      const amt = 35000;
      const extra = federalEstimate(result.netProfitCents + amt).totalTaxCents - federalEstimate(result.netProfitCents).totalTaxCents;
      setTxns([...txns, classify({ id, date: profile.asOf, source: "Cash App", description: "house wash", counterparty: "New customer", amountCents: amt })]);
      setProfile((p) => ({ ...p, balances: p.balances.map((b, i) => i === 0 ? { ...b, balanceCents: b.balanceCents + amt } : b) }));
      notify({ id, level: "info", title: `💸 +${formatUSD(amt)} from a new customer`, body: `${formatUSD(extra)} of it goes in your IRS jar. The other ${formatUSD(amt - extra)} is yours (after your jars are full).` });
    } else {
      const amt = 18000;
      setTxns([...txns, classify({ id, date: profile.asOf, source: "Chase", description: "NIKE.COM", counterparty: "NIKE.COM", amountCents: -amt })]);
      setProfile((p) => ({ ...p, balances: p.balances.map((b, i) => i === 0 ? { ...b, balanceCents: b.balanceCents - amt } : b) }));
      notify({ id, level: "critical", title: `🛑 ${formatUSD(amt)} at Nike.com`, body: `That came out of your IRS jar. You're now ${formatUSD(result.theNumberCents - (result.balanceCents - amt))} short of your Number.` });
    }
  }

  if (!txns || !result) return <Connect onSample={loadSampleBank} onFiles={onFiles} onPlaid={onPlaid} busy={busy} error={error} />;

  const byId = new Map(txns.map((t) => [t.id, t]));
  const openLine = (l: Line) => setWhy({ title: l.label, body: l.why, txns: l.txnIds?.map((i) => byId.get(i)!).filter(Boolean).slice(-6) });
  const name = profile.ownerName === "You" ? "" : profile.ownerName;

  return (
    <div className="min-h-screen pb-28" style={{ paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" }}>
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 py-4">
        <button className="flex items-center gap-3 text-left" onClick={() => setTab("home")}>
          <Logo />
          <div>
            <div className="font-display text-lg font-bold leading-none">The Number</div>
            <div className="muted text-xs">{profile.businessName}{profile.age ? ` · ${profile.age}` : ""}</div>
          </div>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Toggle on={parent} onChange={setParent} label="Parent view" />
          <Toggle on={privacy} onChange={setPrivacy} label="Privacy" />
          <button className="btn btn-ghost !px-3 !py-2 text-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Switch light or dark">{theme === "dark" ? "☀️" : "🌙"}</button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4">
        {tab === "home" && <Home r={result} profile={profile} name={name} parent={parent} openLine={openLine} setWhy={setWhy} simulate={simulate} go={setTab} txns={txns} />}
        {tab === "alerts" && <Alerts r={result} go={setTab} />}
        {tab === "money" && <Money r={result} txns={txns} setKind={setKind} parent={parent} privacy={privacy} profile={profile} />}
        {tab === "learn" && <Learn r={result} />}
        <p className="muted pb-4 text-center text-xs">Data: {source}. Educational estimate, not tax advice.</p>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t" style={{ background: "color-mix(in srgb, var(--bg) 90%, transparent)", backdropFilter: "blur(14px)", borderColor: "var(--line)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1 p-2 text-xs font-semibold">
          {([["home", "🏠", "Home"], ["alerts", "🔔", "Alerts"], ["money", "💵", "Money"], ["learn", "🎓", "Learn"]] as [Tab, string, string][]).map(([k, icon, label]) => (
            <button key={k} onClick={() => setTab(k)} className="relative flex flex-col items-center gap-0.5 rounded-xl px-2 py-2" style={{ background: tab === k ? "var(--card-2)" : "transparent", color: tab === k ? "var(--fg)" : "var(--muted)" }} aria-current={tab === k ? "page" : undefined}>
              <span className="text-lg leading-none" aria-hidden>{icon}</span>{label}
              {k === "alerts" && result.alerts.some((a) => a.level !== "info") && <span className="absolute right-6 top-1.5 h-2 w-2 rounded-full" style={{ background: "var(--red)" }} />}
            </button>
          ))}
        </div>
      </nav>

      {why && <WhySheet {...why} privacy={privacy} onClose={() => setWhy(null)} />}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4" role="status">
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

/* ---------- small pieces ---------- */

function Logo() {
  return <div className="grid h-10 w-10 place-items-center rounded-xl font-display text-lg font-bold" style={{ background: "var(--blue)", color: "#fff" }} aria-hidden>#</div>;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold" style={{ background: on ? "color-mix(in srgb, var(--blue) 22%, transparent)" : "var(--card-2)", border: "1px solid var(--line)" }}>
      <span className="relative h-4 w-7 rounded-full" style={{ background: on ? "var(--blue)" : "var(--line)" }}><span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all" style={{ left: on ? 14 : 2 }} /></span>
      {label}
    </button>
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

function status(r: NumberResult) {
  if (r.safeToSpendCents < 0) return { key: "red", emoji: "🛑", title: "Hold off on spending", sub: `You're ${formatUSD(-r.safeToSpendCents)} short of your Number.`, color: "var(--red)" };
  if (r.safeToSpendCents < r.theNumberCents * 0.25) return { key: "amber", emoji: "⚠️", title: "Getting close", sub: `Only ${formatUSD(r.safeToSpendCents)} is safe to spend right now.`, color: "var(--amber)" };
  return { key: "green", emoji: "✅", title: "You're good", sub: `${formatUSD(r.safeToSpendCents)} is yours to spend or reinvest.`, color: "var(--green)" };
}

/* ---------- Home ---------- */

function Home({ r, profile, name, parent, openLine, setWhy, simulate, go, txns }: { r: NumberResult; profile: Profile; name: string; parent: boolean; openLine: (l: Line) => void; setWhy: (w: Why) => void; simulate: (k: "job" | "spend") => void; go: (t: Tab) => void; txns: Txn[] }) {
  const s = status(r);
  const shown = useCountUp(r.theNumberCents);
  const top = r.alerts.find((a) => a.level !== "info") ?? r.alerts[0];
  return (
    <>
      {parent && <ParentWeek r={r} txns={txns} name={name || "Your kid"} />}

      <section className="hero-glow card overflow-hidden p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="muted text-sm font-semibold">{parent ? `${name || "Their"}'s` : name ? `Hey ${name} 👋  Your` : "Your"} Number</div>
            <div className="font-display num mt-1 text-6xl font-extrabold tracking-tight sm:text-7xl">{formatUSD(shown)}</div>
            <p className="mt-2 max-w-md text-base">Never let your money drop below this. It's already spoken for.</p>
          </div>
          <div className="rounded-2xl px-4 py-3" style={{ background: `color-mix(in srgb, ${s.color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${s.color} 45%, transparent)` }}>
            <div className="font-display text-xl font-bold" style={{ color: s.color }}>{s.emoji} {s.title}</div>
            <div className="text-sm">{s.sub}</div>
          </div>
        </div>
        <Jars r={r} onWhy={(t, b) => setWhy({ title: t, body: b })} />
      </section>

      {profile.parentRule && (
        <button onClick={() => setWhy({ title: "Myth: “under the limit means you owe nothing”", body: `Being under the ${formatUSD(TAX_2026.standardDeductionCents)} standard deduction means $0 federal income tax, and that part is true for you. But self-employment tax is separate. It's Social Security + Medicare for people who work for themselves, and it starts once you net $400, at any age. On ${formatUSD(r.netProfitCents)} of profit that's ${formatUSD(r.fed.se.totalCents)}. Most young owners (and their parents) don't know this until the bill shows up.` })}
          className="card w-full p-5 text-left" style={{ borderColor: "color-mix(in srgb, var(--amber) 45%, transparent)" }}>
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--amber)" }}>Myth buster</div>
          <div className="font-display mt-1 text-xl font-bold">{profile.parentRule.label} <span style={{ color: "var(--red)" }}>❌</span></div>
          <p className="muted mt-1 text-sm">You owe {formatUSD(r.fed.incomeTaxCents)} income tax, but <b style={{ color: "var(--fg)" }}>{formatUSD(r.fed.se.totalCents)} self-employment tax</b>. Tap to see why →</p>
        </button>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {top && (
          <button onClick={() => go("alerts")} className="card p-5 text-left">
            <div className="muted text-xs font-bold uppercase tracking-wider">Top alert</div>
            <div className="mt-1 font-semibold">{top.title}</div>
            <div className="muted mt-1 text-sm">{top.body}</div>
            <div className="mt-2 text-sm font-semibold" style={{ color: "var(--blue)" }}>See all {r.alerts.length} alerts →</div>
          </button>
        )}
        <div className="card p-5">
          <div className="muted text-xs font-bold uppercase tracking-wider">Next IRS payment</div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <div className="font-display num text-3xl font-bold">{formatUSD(r.owedSoFarCents)}</div>
            <div className="text-right text-sm"><b>{new Date(r.next.due + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b><div className="muted">{r.next.daysLeft} days</div></div>
          </div>
          <p className="muted mt-2 text-sm">Save <b style={{ color: "var(--fg)" }}>{formatUSD(r.saveThisMonthCents)}/month</b> and you're covered. {r.missed.length > 0 && <span style={{ color: "var(--red)" }}>{r.missed.length} earlier payment{r.missed.length > 1 ? "s" : ""} missed.</span>}</p>
          <button className="mt-2 text-sm font-semibold" style={{ color: "var(--blue)" }} onClick={() => go("learn")}>Why do I pay the IRS during the year? →</button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-display text-xl font-bold">How we got {formatUSD(r.theNumberCents)}</h2>
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>
          {r.lines.map((l) => (
            <li key={l.key}><button className="flex w-full items-center justify-between gap-3 py-3 text-left" onClick={() => openLine(l)}><span>{l.label} <span className="muted text-xs">why?</span></span><span className="num font-semibold">{formatUSD(l.amountCents)}</span></button></li>
          ))}
          <li className="flex items-center justify-between py-3 font-bold"><span>Your Number</span><span className="num">{formatUSD(r.theNumberCents)}</span></li>
        </ul>
      </section>

      {!parent && (
        <section className="card p-5">
          <h2 className="font-display text-xl font-bold">Try it live</h2>
          <p className="muted mb-3 text-sm">See how The Number reacts the moment money moves.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn btn-primary justify-center" onClick={() => simulate("job")}>💸 New job paid: $350 on Cash App</button>
            <button className="btn btn-ghost justify-center" onClick={() => simulate("spend")}>👟 Buy $180 sneakers</button>
          </div>
        </section>
      )}
    </>
  );
}

// The three jars: the balance fills the IRS jar first, then the business jar, and only then "Yours".
function Jars({ r, onWhy }: { r: NumberResult; onWhy: (t: string, b: string) => void }) {
  const bal = Math.max(0, r.balanceCents);
  const irsNeed = r.owedSoFarCents, bizNeed = r.cushionCents + r.billsCents;
  const irsHave = Math.min(bal, irsNeed);
  const bizHave = Math.min(bal - irsHave, bizNeed);
  const yours = Math.max(0, bal - irsHave - bizHave);
  const jars = [
    { key: "irs", label: "IRS jar", sub: "Taxes you owe", have: irsHave, need: irsNeed, color: "var(--amber)", why: `This is money the IRS will ask for: ${formatUSD(r.fed.se.totalCents)} self-employment tax + ${formatUSD(r.fed.incomeTaxCents)} income tax${r.taxPaidCents ? `, minus ${formatUSD(r.taxPaidCents)} you already paid` : ""}. Your money fills this jar first.` },
    { key: "biz", label: "Business jar", sub: "Costs + bills", have: bizHave, need: bizNeed, color: "var(--blue)", why: `One month of business costs (${formatUSD(r.cushionCents)}) plus bills due soon (${formatUSD(r.billsCents)}). This keeps a slow month or a broken pump from sinking you.` },
    { key: "you", label: "Yours", sub: "Safe to spend", have: yours, need: 0, color: "var(--green)", why: `Whatever is left after the IRS jar and the business jar are full. ${yours === 0 ? "Right now that's $0, so fill the other jars first." : `Right now you can spend or reinvest ${formatUSD(yours)}.`}` },
  ];
  return (
    <div className="mt-6">
      <div className="muted mb-3 text-sm">You have <b style={{ color: "var(--fg)" }}>{formatUSD(r.balanceCents)}</b>. Here's where it really belongs:</div>
      <div className="grid grid-cols-3 gap-3">
        {jars.map((j) => {
          const pct = j.key === "you" ? (yours > 0 ? 100 : 0) : j.need ? Math.round((j.have / j.need) * 100) : 100;
          const short = j.key !== "you" && j.have < j.need;
          return (
            <button key={j.key} onClick={() => onWhy(j.label, j.why)} className="group rounded-2xl p-3 text-left" style={{ background: "var(--card-2)", border: "1px solid var(--line)" }} aria-label={`${j.label}: ${formatUSD(j.have)}${j.need ? ` of ${formatUSD(j.need)}` : ""}`}>
              <div className="relative mx-auto h-24 w-16 overflow-hidden rounded-b-2xl rounded-t-lg sm:h-28 sm:w-20" style={{ border: `2px solid ${j.color}`, background: "var(--bg)" }}>
                <div className="absolute inset-x-0 bottom-0 transition-all duration-700" style={{ height: `${Math.min(100, pct)}%`, background: j.color, opacity: 0.85 }} />
              </div>
              <div className="mt-2 text-sm font-bold">{j.label}</div>
              <div className="num font-display text-lg font-bold" style={{ color: j.color }}>{formatUSD(j.have)}</div>
              <div className="muted text-xs">{j.key === "you" ? j.sub : short ? `needs ${formatUSD(j.need - j.have)} more` : `full · ${j.sub}`}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ParentWeek({ r, txns, name }: { r: NumberResult; txns: Txn[]; name: string }) {
  const end = dayNum(r.asOf), start = end - 6;
  const wk = txns.filter((t) => dayNum(t.date) >= start && dayNum(t.date) <= end);
  const earned = wk.filter((t) => t.kind === "business_income" || (t.kind === "review" && t.amountCents > 0)).reduce((s, t) => s + t.amountCents, 0);
  const costs = wk.filter((t) => t.kind === "business_expense").reduce((s, t) => s - t.amountCents, 0);
  const setAside = federalEstimate(r.netProfitCents).totalTaxCents - federalEstimate(r.netProfitCents - earned + costs).totalTaxCents;
  const s = status(r);
  return (
    <section className="card p-5" style={{ borderColor: "color-mix(in srgb, var(--blue) 45%, transparent)" }}>
      <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--blue)" }}>Parent weekly summary · read-only</div>
      <div className="font-display mt-1 text-xl font-bold">{name} this week: {s.emoji} {s.title}</div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        {[["Earned", earned, "var(--green)"], ["Business costs", costs, "var(--blue)"], ["Should set aside", setAside, "var(--amber)"]].map(([l, v, c]) => (
          <div key={l as string} className="rounded-xl p-3" style={{ background: "var(--card-2)" }}><div className="muted text-xs">{l as string}</div><div className="font-display num text-xl font-bold" style={{ color: c as string }}>{formatUSD(v as number)}</div></div>
        ))}
      </div>
      <p className="muted mt-3 text-sm">No spreadsheet needed. You'll get a text if {name} drops below their Number or a tax date is coming up.</p>
    </section>
  );
}

/* ---------- Alerts ---------- */

function Alerts({ r, go }: { r: NumberResult; go: (t: Tab) => void }) {
  const color = { critical: "var(--red)", warning: "var(--amber)", info: "var(--blue)" };
  const icon = { critical: "🛑", warning: "⚠️", info: "🔔" };
  const action = (id: string): [string, Tab] | null => id === "review" ? ["Sort them now", "money"] : id === "missed" || id === "next" ? ["How estimated taxes work", "learn"] : id === "below" ? ["See my jars", "home"] : id === "rule" ? ["Why it's wrong", "learn"] : null;
  return (
    <section className="space-y-3">
      <h1 className="font-display text-3xl font-bold">Alerts</h1>
      <p className="muted text-sm">These are texted to you and your parent. Here's what they'd say right now.</p>
      {r.alerts.map((a) => {
        const act = action(a.id);
        return (
          <div key={a.id} className="card flex gap-3 p-4" style={{ borderLeft: `4px solid ${color[a.level]}` }}>
            <div className="text-2xl" aria-hidden>{icon[a.level]}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2"><div className="font-semibold">{a.title}</div><div className="muted shrink-0 text-xs">now</div></div>
              <div className="muted text-sm">{a.body}</div>
              {act && <button className="mt-2 text-sm font-semibold" style={{ color: "var(--blue)" }} onClick={() => go(act[1])}>{act[0]} →</button>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ---------- Money ---------- */

const KIND_LABEL: Record<Txn["kind"], [string, string]> = {
  business_income: ["Business income", "var(--green)"],
  business_expense: ["Business cost", "var(--blue)"],
  personal: ["Personal", "var(--muted)"],
  transfer: ["Transfer", "var(--muted)"],
  tax_payment: ["Tax payment", "var(--green)"],
  review: ["Needs answer", "var(--amber)"],
};

function TxnRow({ t, privacy, children }: { t: Txn; privacy?: boolean; children?: React.ReactNode }) {
  const [label, color] = KIND_LABEL[t.kind];
  const title = privacy ? (t.kind === "business_income" ? "Customer payment" : t.category || label) : t.description || "(no note)";
  const who = privacy ? "" : t.counterparty && t.counterparty !== t.description ? t.counterparty : "";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="truncate font-medium">{title}{who && <span className="muted text-sm"> · {who}</span>}</div>
        <div className="muted text-xs">{t.date} · {t.source} · <span style={{ color }}>{label}</span></div>
      </div>
      <div className="flex items-center gap-3">
        {children}
        <div className="num font-semibold" style={{ color: t.amountCents > 0 ? "var(--green)" : "var(--fg)" }}>{t.amountCents > 0 ? "+" : ""}{formatUSD(t.amountCents, { cents: true })}</div>
      </div>
    </li>
  );
}

function Money({ r, txns, setKind, parent, privacy, profile }: { r: NumberResult; txns: Txn[]; setKind: (id: string, k: "business_income" | "personal" | "business_expense") => void; parent: boolean; privacy: boolean; profile: Profile }) {
  const review = txns.filter((t) => t.kind === "review");
  const current = review[0];
  const [filter, setFilter] = useState<"all" | Txn["kind"]>("all");
  const list = txns.filter((t) => filter === "all" || t.kind === filter).sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <>
      <h1 className="font-display text-3xl font-bold">Money</h1>
      <section className="card p-5">
        <h2 className="font-display text-xl font-bold">Business or personal?</h2>
        {current ? (
          <div className="mt-3 rounded-2xl p-5 text-center" style={{ background: "var(--card-2)" }}>
            <div className="muted text-xs">{review.length} left · {current.date} · {current.source}</div>
            <div className="font-display num mt-1 text-4xl font-bold" style={{ color: current.amountCents > 0 ? "var(--green)" : "var(--fg)" }}>{current.amountCents > 0 ? "+" : ""}{formatUSD(current.amountCents, { cents: true })}</div>
            <div className="mt-1 font-medium">{privacy ? "Payment" : `${current.description || "(no note)"}${current.counterparty && current.counterparty !== current.description ? ` · ${current.counterparty}` : ""}`}</div>
            {!parent ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="btn btn-primary justify-center !py-3" onClick={() => setKind(current.id, current.amountCents > 0 ? "business_income" : "business_expense")}>💼 Business</button>
                <button className="btn btn-ghost justify-center !py-3" onClick={() => setKind(current.id, "personal")}>🙋 Personal</button>
              </div>
            ) : <p className="muted mt-3 text-sm">Your kid answers these.</p>}
          </div>
        ) : <p className="mt-2 text-sm" style={{ color: "var(--green)" }}>All sorted ✓ Your Number is exact.</p>}
        <p className="muted mt-3 text-xs">Payment apps expect business money on a business profile. Sorting keeps your books, and your account, legit.</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3"><h2 className="font-display text-xl font-bold">Money in vs. business costs</h2><p className="muted mb-3 text-sm">2026 by month.</p><BarChart data={r.monthly} /></div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-display text-xl font-bold">Where business money goes</h2>
          <ul className="mt-3 space-y-3">
            {r.topCategories.slice(0, 6).map((c) => (
              <li key={c.category}>
                <div className="flex justify-between text-sm"><span>{c.category}</span><span className="num font-semibold">{formatUSD(c.amountCents)}</span></div>
                <div className="mt-1 h-2 rounded-full" style={{ background: "var(--card-2)" }}><div className="h-2 rounded-full" style={{ width: `${Math.round((c.amountCents / (r.topCategories[0]?.amountCents || 1)) * 100)}%`, background: "var(--blue)" }} /></div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Cpa r={r} txns={txns} profile={profile} />

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">All transactions</h2>
          <select className="btn btn-ghost !py-1.5 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter">
            <option value="all">All ({txns.length})</option>
            {Object.entries(KIND_LABEL).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--line)" }}>{list.slice(0, 100).map((t) => <TxnRow key={t.id} t={t} privacy={privacy} />)}</ul>
      </section>
    </>
  );
}

function BarChart({ data }: { data: NumberResult["monthly"] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.incomeCents, d.expensesCents)));
  const W = 560, H = 190, pad = 28, bw = (W - pad) / Math.max(1, data.length);
  const names = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full min-w-[300px]" role="img" aria-label="Monthly income and business costs">
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={pad} x2={W} y1={H - H * g} y2={H - H * g} stroke="var(--line)" />)}
        <text x={0} y={12} fontSize="10" fill="var(--muted)">{formatUSD(max)}</text>
        {data.map((d, i) => {
          const x = pad + i * bw + bw * 0.15, w = bw * 0.33;
          const hi = (d.incomeCents / max) * (H - 8), he = (d.expensesCents / max) * (H - 8);
          return (
            <g key={d.month}>
              <rect x={x} y={H - hi} width={w} height={hi} rx="3" fill="var(--green)"><title>{`${d.month} money in ${formatUSD(d.incomeCents)}`}</title></rect>
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

function Cpa({ r, txns, profile }: { r: NumberResult; txns: Txn[]; profile: Profile }) {
  const download = () => {
    const rows = [["date", "source", "description", "counterparty", "amount", "type", "category"], ...txns.map((t) => [t.date, t.source, t.description, t.counterparty || "", (t.amountCents / 100).toFixed(2), t.kind, t.category || ""])];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "the-number-cpa-ready-2026.csv"; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <section className="card p-5">
      <h2 className="font-display text-xl font-bold">📨 Send to a CPA</h2>
      <p className="muted text-sm">A clean one-pager so you can graduate to a real accountant without showing up with a shoebox.</p>
      <dl className="mt-3 grid gap-x-8 sm:grid-cols-2">
        {([["Business", profile.businessName], ["Gross income", formatUSD(r.incomeCents, { cents: true })], ["Business expenses", formatUSD(r.expensesCents, { cents: true })], ["Net profit", formatUSD(r.netProfitCents, { cents: true })], ["Self-employment tax (est.)", formatUSD(r.fed.se.totalCents, { cents: true })], ["Income tax (est.)", formatUSD(r.fed.incomeTaxCents, { cents: true })], ["Estimated payments made", formatUSD(r.taxPaidCents, { cents: true })], ["Unsorted items", String(r.reviewCount)]] as [string, string][]).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b py-2 text-sm" style={{ borderColor: "var(--line)" }}><dt className="muted">{k}</dt><dd className="num font-semibold">{v}</dd></div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={download}>Download CSV</button>
        <button className="btn btn-ghost" onClick={() => window.print()}>Print / save PDF</button>
      </div>
    </section>
  );
}

/* ---------- Learn ---------- */

function Learn({ r }: { r: NumberResult }) {
  const months = [3, 2, 3, 4];
  const cards: [string, string, React.ReactNode][] = [
    ["🔢", "What is The Number?", <>The lowest your money should ever go. It's <b>taxes you owe</b> + <b>one month of business costs</b> + <b>bills due soon</b>. Everything above it is yours.</>],
    ["🧾", "Self-employment tax (the one nobody tells you about)", <>When you have a job, your boss pays half your Social Security and Medicare. When you work for yourself, you pay both halves: <b>15.3% on 92.35% of your profit</b>. It starts at <b>$400 of profit, at any age</b> (<a className="underline" href={SOURCES.youngEntrepreneurs} target="_blank" rel="noreferrer">IRS</a>). For you that's <b>{formatUSD(r.fed.se.totalCents)}</b>.</>],
    ["🤔", "Why do I owe tax if I'm under the limit?", <>The {formatUSD(TAX_2026.standardDeductionCents)} standard deduction only shields you from <i>income</i> tax. That's why your income tax is {formatUSD(r.fed.incomeTaxCents)}. It doesn't cover self-employment tax at all.</>],
    ["📅", "Paying the IRS during the year", <>Nobody withholds tax from your Cash App, so the IRS expects <b>estimated payments</b> four times a year. Pay at <a className="underline" href="https://www.irs.gov/payments" target="_blank" rel="noreferrer">irs.gov/payments</a>. Paying late adds a small penalty, and paying a bit each month avoids it.</>],
    ["💼", "Business vs. personal on payment apps", <>Mixing them makes your profit look bigger (more tax) or smaller (trouble later). Tag every payment, or better, use a separate business profile.</>],
  ];
  return (
    <>
      <h1 className="font-display text-3xl font-bold">Learn</h1>
      <p className="muted -mt-2 text-sm">30-second explainers using your own numbers.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map(([icon, title, body]) => (
          <details key={title} className="card group p-5" open={title.startsWith("Self")}>
            <summary className="flex cursor-pointer list-none items-center gap-3 font-semibold"><span className="text-2xl" aria-hidden>{icon}</span>{title}<span className="muted ml-auto text-sm group-open:rotate-180">⌄</span></summary>
            <p className="mt-3 text-sm leading-relaxed">{body}</p>
          </details>
        ))}
      </div>
      <section className="card p-5">
        <h2 className="font-display text-xl font-bold">The IRS “quarters” aren't quarters</h2>
        <p className="muted mt-1 text-sm">They cover 3, then 2, then 3, then 4 months. That trips up anyone with seasonal income, so The Number plans it monthly instead.</p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-4">
          {TAX_2026.quarterlyDueDates.map((q, i) => {
            const missed = r.missed.some((m) => m.due === q.due), next = r.next.due === q.due;
            const c = missed ? "var(--red)" : next ? "var(--blue)" : "var(--muted)";
            return (
              <li key={q.due} className="rounded-2xl p-4" style={{ background: "var(--card-2)", border: `1px solid ${next ? "var(--blue)" : "var(--line)"}` }}>
                <div className="flex justify-between text-xs font-semibold"><span>Payment {i + 1}</span><span style={{ color: c }}>{missed ? "Missed" : next ? "Next" : "Later"}</span></div>
                <div className="font-display num mt-1 text-lg font-bold">{q.due}</div>
                <div className="mt-2 flex gap-1">{Array.from({ length: months[i] }).map((_, k) => <span key={k} className="h-2 flex-1 rounded-full" style={{ background: c }} />)}</div>
                <div className="muted mt-1 text-xs">{months[i]} months · {q.covers}</div>
              </li>
            );
          })}
        </ol>
      </section>
      <details className="card p-5 text-sm"><summary className="cursor-pointer font-semibold">Assumptions and sources</summary>
        <ul className="muted mt-2 list-disc space-y-1 pl-5">{ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
        <ul className="mt-2 space-y-1">{Object.entries(SOURCES).map(([k, u]) => <li key={k}><a className="underline" style={{ color: "var(--blue)" }} href={u} target="_blank" rel="noreferrer">{k}</a></li>)}</ul>
      </details>
    </>
  );
}

/* ---------- Why sheet ---------- */

function WhySheet({ title, body, txns, privacy, onClose }: Why & { privacy: boolean; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-black/50 sm:place-items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="card toast w-full max-w-lg p-6 sm:m-4" onClick={(e) => e.stopPropagation()} style={{ borderRadius: "22px 22px 0 0" }}>
        <div className="muted text-xs font-semibold uppercase tracking-wider">Why?</div>
        <h3 className="font-display mt-1 text-2xl font-bold">{title}</h3>
        <p className="mt-3 leading-relaxed">{body}</p>
        {txns && txns.length > 0 && (<><div className="muted mt-4 text-xs font-semibold">FROM THESE TRANSACTIONS (latest)</div><ul className="divide-y" style={{ borderColor: "var(--line)" }}>{txns.map((t) => <TxnRow key={t.id} t={t} privacy={privacy} />)}</ul></>)}
        <button className="btn btn-primary mt-5 w-full justify-center" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

/* ---------- Landing ---------- */

function Connect({ onSample, onFiles, onPlaid, busy, error }: { onSample: () => void; onFiles: (f: FileList | null) => void; onPlaid: (d: { txns: Txn[]; balances: Profile["balances"] }) => void; busy: string; error: string }) {
  return (
    <div className="min-h-screen" style={{ paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" }}>
      <div className="mx-auto max-w-5xl py-8">
        <div className="flex items-center gap-3"><Logo /><span className="font-display text-xl font-bold">The Number</span></div>
        <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl" style={{ textWrap: "balance" as never }}>Know what's actually yours.</h1>
            <p className="muted mt-5 max-w-lg text-lg">You started a business before anyone taught you taxes. Connect your bank and The Number tells you exactly how much you owe, how much to keep, and what's safe to spend, in plain English.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-start">
              <PlaidButton onData={onPlaid} />
              <button className="btn btn-ghost" onClick={onSample} disabled={!!busy}>{busy === "bank" ? "Connecting through Plaid…" : "Try a sample bank (Jay, 17)"}</button>
            </div>
            <label className="muted mt-4 inline-block cursor-pointer text-sm underline">
              Or upload Chase / Cash App / Venmo CSVs (stays in your browser)
              <input type="file" accept=".csv,text/csv" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
            </label>
            {error && <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>{error}</p>}
          </div>
          <div className="hero-glow card p-6">
            <div className="muted text-sm font-semibold">Jay's Number</div>
            <div className="font-display num text-6xl font-extrabold">$3,076</div>
            <div className="mt-2 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: "color-mix(in srgb, var(--red) 16%, transparent)", color: "var(--red)" }}>🛑 Hold off on spending: $426 short</div>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex justify-between"><span className="muted">Income tax (under the limit)</span><b className="num">$0</b></li>
              <li className="flex justify-between"><span className="muted">Self-employment tax ← the surprise</span><b className="num" style={{ color: "var(--amber)" }}>$2,299</b></li>
              <li className="flex justify-between"><span className="muted">One month of business costs</span><b className="num">$252</b></li>
              <li className="flex justify-between"><span className="muted">Bills due soon</span><b className="num">$525</b></li>
            </ul>
            <p className="muted mt-4 text-xs">Sample: a 17-year-old's pressure-washing business, $18.8K this year. Sized from real teen businesses.</p>
          </div>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {[["🔗 Connect", "Your bank through Plaid. You don't switch banks, and we never move money."], ["🫙 See your jars", "IRS jar, business jar, and what's actually yours. Real IRS math, done in code."], ["🔔 Get texted", "Before you dip below your Number and before tax dates. Parents can follow along."]].map(([h, b]) => (
            <div key={h} className="card p-5"><div className="font-display text-lg font-bold">{h}</div><p className="muted mt-1 text-sm">{b}</p></div>
          ))}
        </div>
        <p className="muted mt-10 text-xs">Educational estimate, not tax advice. Free to see your Number · $49.99 per tax year for alerts, sorting, parent view and CPA export.</p>
      </div>
    </div>
  );
}
