"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Lightbulb, Lock, ArrowUpRight, Bell, BookOpen, Briefcase, CalendarClock, Download, Eye, EyeOff, GraduationCap, Home as HomeIcon, Info, LogOut, Octagon, Printer, ShoppingBag, Terminal, User, Users, Wallet, X, Zap } from "lucide-react";
import { classify } from "@/lib/classify";
import { latestBalance, normalize } from "@/lib/csv";
import { DEMO_FILES, DEMO_PROFILE } from "@/lib/demo";
import { computeNumber, quarterBreakdown, type Alert, type Line, type NumberResult } from "@/lib/number";
import { formatUSD } from "@/lib/tax";
import { parseEntry } from "@/lib/entry";
import { ASSUMPTIONS, SOURCES, TAX_2026, TAX_YEAR } from "@/lib/taxConfig";
import type { Profile, Txn } from "@/lib/types";
import { Connect, Landing, Logo, Pricing, SignUp, ThemeToggle, type Account } from "./Onboarding";

type Tab = "home" | "alerts" | "money" | "learn";
type Stage = "landing" | "signup" | "pricing" | "connect" | "app";
type Why = { title: string; body: string; txns?: Txn[] };
type LogLine = { id: string; time: string; text: string; tone: "in" | "out" | "sys" | "warn" };

const dayNum = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;
const PLAN_NAME: Record<string, string> = { trial: "Free trial", free: "Free trial", season: "Season Pass", family: "Season Pass" };
export type AlertPrefs = Record<string, boolean>;
const DEFAULT_PREFS: AlertPrefs = { below: true, due: true, big: true, paid: true, weekly: true, locks: true, sms: true, email: false };
const PREFS_KEY = "the-number:alerts";
const KEY = "the-number:account";

function loadAccount(): Account | null { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; } }
function saveAccount(a: Account | null) { try { a ? localStorage.setItem(KEY, JSON.stringify(a)) : localStorage.removeItem(KEY); } catch { /* storage blocked: fine */ } }

export default function App() {
  const [stage, setStage] = useState<Stage>("landing");
  const [account, setAccount] = useState<Account | null>(null);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [profile, setProfile] = useState<Profile>(DEMO_PROFILE);
  const [source, setSource] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [why, setWhy] = useState<Why | null>(null);
  const [toast, setToast] = useState<Alert | null>(null);
  const [events, setEvents] = useState<LogLine[]>([]);
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_PREFS);
  useEffect(() => { try { const v = localStorage.getItem(PREFS_KEY); if (v) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(v) }); } catch { /* fine */ } }, []);
  const setPref = (k: string, v: boolean) => setPrefs((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem(PREFS_KEY, JSON.stringify(n)); } catch { /* fine */ } return n; });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>("");

  useEffect(() => { setAccount(loadAccount()); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [stage, tab]);
  const result = useMemo(() => (txns ? computeNumber(txns, profile) : null), [txns, profile]);

  function enter(note: string) { setSource(note); setTab("home"); setEvents([]); setStage("app"); }

  async function loadSampleBank() {
    setBusy("bank"); setError("");
    try {
      const r = await fetch("/api/plaid/demo", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setProfile({ ...DEMO_PROFILE, asOf: new Date().toISOString().slice(0, 10), balances: j.balances });
      setTxns(j.txns); enter("Plaid Sandbox · test bank loaded with a realistic teen business");
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
    enter(note || "Sample statements (Chase + Cash App + Venmo)");
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
      setProfile({ ...DEMO_PROFILE, ownerName: account?.name || "You", businessName: account ? `${account.name}'s ${account.business.toLowerCase()}` : "Your business", age: 0, parentRule: undefined, balances, bills: [], asOf: last });
      setTxns(all); enter(`Your statements (${[...files].map((f) => f.name).join(", ")}), processed in your browser only`);
    } catch (e) { setError((e as Error).message); }
  }

  function onPlaid(data: { txns: Txn[]; balances: Profile["balances"] }) {
    // Our Plaid Sandbox test user (Jay's business): pair the bank data with Jay's profile (age, bills he entered).
    if (data.balances.some((b) => b.name.startsWith("Jay's Pressure Washing"))) {
      setProfile({ ...DEMO_PROFILE, asOf: new Date().toISOString().slice(0, 10), balances: data.balances });
      setTxns(data.txns); enter("Your bank via Plaid (Sandbox test user)"); return;
    }
    setProfile({ ...DEMO_PROFILE, ownerName: account?.name || "You", businessName: account ? `${account.name}'s ${account.business.toLowerCase()}` : "Your business", age: 0, parentRule: undefined, balances: data.balances, bills: [], asOf: new Date().toISOString().slice(0, 10) });
    setTxns(data.txns); enter("Your bank via Plaid");
  }

  function setKind(id: string, kind: "business_income" | "personal" | "business_expense") {
    setTxns((ts) => ts!.map((t) => t.id === id ? { ...t, kind, userSet: true, category: kind === "personal" ? "Personal" : kind === "business_income" ? "Customer payment" : "Business expense", reason: "You told us." } : t));
  }

  function notify(a: Alert) { setToast(a); window.setTimeout(() => setToast(null), 6500); }
  const clock = () => new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

  // Plain-English entry ("got $350 for a house wash") -> a real transaction, and the live payment box updates.
  function addEntry(text: string): { ok: boolean; msg: string } {
    if (!txns || !result) return { ok: false, msg: "" };
    const e = parseEntry(text);
    if ("error" in e) return { ok: false, msg: e.error };
    const id = `sim-${Date.now()}`;
    const signed = e.direction === "in" ? e.amountCents : -e.amountCents;
    const next = [...txns, { id, date: profile.asOf, source: "You", description: e.description, counterparty: e.description, amountCents: signed, kind: e.kind, category: e.kind === "personal" ? "Personal" : e.kind === "business_income" ? "Customer payment" : "Business expense", reason: "You told us.", userSet: true } as Txn];
    const before = result.quarters.find((q) => q.status === "building");
    const after = quarterBreakdown(next, profile.asOf, result.taxPaidCents).find((q) => q.status === "building");
    const delta = (after?.remainingCents ?? 0) - (before?.remainingCents ?? 0);
    const due = before ? new Date(before.due + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "next";
    setTxns(next);
    setProfile((p) => ({ ...p, balances: p.balances.map((b, i) => i === 0 ? { ...b, balanceCents: b.balanceCents + signed } : b) }));
    const effect = delta > 0 ? `your ${due} payment went up ${formatUSD(delta)}` : delta < 0 ? `your ${due} payment went down ${formatUSD(-delta)}` : `your ${due} payment didn't change (personal money isn't taxed)`;
    const label = e.kind === "business_income" ? "business income" : e.kind === "business_expense" ? "business cost" : "personal";
    setEvents((ev) => [{ id, time: clock(), tone: (e.direction === "in" ? "in" : "warn") as LogLine["tone"], text: `${e.direction === "in" ? "got" : "paid"} ${formatUSD(e.amountCents, { cents: true })} · ${e.description.toLowerCase()} → ${label} · ${delta >= 0 ? "+" : "−"}${formatUSD(Math.abs(delta))} next payment` }, ...ev].slice(0, 6));
    const msg = `${e.direction === "in" ? "Got" : "Spent"} ${formatUSD(e.amountCents)} (${label}), so ${effect}.`;
    if ((e.direction === "in" && prefs.paid) || (e.direction === "out" && (prefs.big || prefs.below))) notify({ id, level: e.direction === "in" ? "info" : "warning", title: `${e.direction === "in" ? "+" : ""}${formatUSD(e.amountCents)} · ${e.description}`, body: msg });
    return { ok: true, msg };
  }

  function signOut() { saveAccount(null); setAccount(null); setTxns(null); setStage("landing"); }

  if (stage === "landing") return <Landing onStart={() => setStage(account ? (account.plan ? "connect" : "pricing") : "signup")} onSignIn={() => setStage(account ? "connect" : "signup")} onDemo={loadSampleBank} busy={busy === "bank"} />;
  if (stage === "signup") return <SignUp onBack={() => setStage("landing")} onDone={(a) => { setAccount(a); saveAccount(a); setStage("pricing"); }} />;
  if (stage === "pricing") return <Pricing name={account?.name || "friend"} onBack={() => setStage("landing")} onPick={(plan) => { const a = { ...(account as Account), plan }; setAccount(a); saveAccount(a); setStage("connect"); }} />;
  if (stage === "connect" || !txns || !result) return <Connect name={account?.name || ""} onBack={() => setStage("landing")} onSample={loadSampleBank} onFiles={onFiles} onPlaid={onPlaid} busy={busy} error={error} />;

  const byId = new Map(txns.map((t) => [t.id, t]));
  const openLine = (l: Line) => setWhy({ title: l.label, body: l.why, txns: l.txnIds?.map((i) => byId.get(i)!).filter(Boolean).slice(-6) });
  const alertDot = result.alerts.some((a) => a.level !== "info");
  const NAV: [Tab, typeof HomeIcon, string][] = [["home", HomeIcon, "Home"], ["alerts", Bell, "Alerts"], ["money", Wallet, "Money"], ["learn", GraduationCap, "Learn"]];

  return (
    <div className="relative min-h-screen pb-28 sm:pb-10" style={{ paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" }}>
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[50vh]" style={{ background: "radial-gradient(50% 60% at 50% 0%, rgba(255,255,255,.06), transparent 70%)" }} />
      <header className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 py-4">
        <button className="flex items-center gap-3 text-left" onClick={() => setTab("home")}>
          <Logo size={38} />
          <div>
            <div className="font-display text-lg font-semibold leading-none">The Number</div>
            <div className="muted mt-1 text-xs">Your business · {TAX_YEAR} tax year</div>
          </div>
        </button>
        <nav className="glass hidden items-center gap-1 !rounded-full p-1 sm:flex" aria-label="Main">
          {NAV.map(([k, I, label]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${tab === k ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}>
              <I size={15} />{label}
              {k === "alerts" && alertDot && <span className="dot absolute right-2 top-1.5 !h-1.5 !w-1.5" style={{ background: "var(--red)" }} />}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle />
          {account && <span className="chip hidden text-zinc-300 md:inline-flex">{PLAN_NAME[account.plan || "free"]}</span>}
          <button className="btn btn-ghost !p-2.5" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-4">
        {tab === "home" && <Home r={result} profile={profile} openLine={openLine} setWhy={setWhy} addEntry={addEntry} txns={txns} events={events} />}
        {tab === "alerts" && <Alerts r={result} go={setTab} prefs={prefs} setPref={setPref} />}
        {tab === "money" && <Money r={result} txns={txns} setKind={setKind} profile={profile} />}
        {tab === "learn" && <Learn r={result} />}
        <p className="muted pb-4 pt-2 text-center text-xs">Data: {source}. Educational estimate, not tax advice.</p>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t sm:hidden" style={{ background: "rgba(0,0,0,.82)", backdropFilter: "blur(14px)", borderColor: "var(--line)", paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }} aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1 p-2 text-xs font-medium">
          {NAV.map(([k, I, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`relative flex flex-col items-center gap-1 rounded-xl px-2 py-2 ${tab === k ? "bg-white/10 text-white" : "text-zinc-500"}`} aria-current={tab === k ? "page" : undefined}>
              <I size={18} />{label}
              {k === "alerts" && alertDot && <span className="dot absolute right-6 top-1.5 !h-1.5 !w-1.5" style={{ background: "var(--red)" }} />}
            </button>
          ))}
        </div>
      </nav>

      {why && <WhySheet {...why} onClose={() => setWhy(null)} />}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4" role="status">
          <div className="toast glass w-full max-w-[420px] !rounded-2xl p-4 shadow-2xl" style={{ background: "rgba(20,20,20,.92)" }}>
            <div className="muted mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider"><span className="dot" style={{ background: toast.level === "critical" ? "var(--red)" : "var(--green)" }} />The Number · now</div>
            <div className="font-semibold">{toast.title}</div>
            <div className="muted mt-1 text-sm">{toast.body}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- small pieces ---------- */

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
  if (r.safeToSpendCents < 0) return { key: "red", title: "Hold off on spending", sub: `Add ${formatUSD(-r.safeToSpendCents)} and you're fully covered.`, color: "var(--red)" };
  if (r.safeToSpendCents < r.theNumberCents * 0.25) return { key: "amber", title: "Getting close", sub: `Only ${formatUSD(r.safeToSpendCents)} is safe to spend right now.`, color: "var(--amber)" };
  return { key: "green", title: "You're good", sub: `${formatUSD(r.safeToSpendCents)} is yours to spend or reinvest.`, color: "var(--green)" };
}

function jars(r: NumberResult) {
  const bal = Math.max(0, r.balanceCents);
  const irsNeed = r.owedSoFarCents, bizNeed = r.cushionCents + r.billsCents;
  const irsHave = Math.min(bal, irsNeed);
  const bizHave = Math.min(bal - irsHave, bizNeed);
  const yours = Math.max(0, bal - irsHave - bizHave);
  return { irsNeed, irsHave, bizNeed, bizHave, yours };
}

function Label({ children, icon: I }: { children: React.ReactNode; icon?: typeof Eye }) {
  return <div className="muted flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em]">{I && <I size={14} />}{children}</div>;
}

/* ---------- weekly series (balance reconstructed backward from today's real balance) ---------- */

function weekly(txns: Txn[], r: NumberResult, weeks = 16) {
  const end = dayNum(r.asOf);
  const pts: { label: string; balance: number; inflow: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const wEnd = end - w * 7, wStart = wEnd - 6;
    const after = txns.filter((t) => dayNum(t.date) > wEnd).reduce((s, t) => s + t.amountCents, 0);
    const inflow = txns.filter((t) => { const d = dayNum(t.date); return d >= wStart && d <= wEnd && (t.kind === "business_income" || (t.kind === "review" && t.amountCents > 0)); }).reduce((s, t) => s + t.amountCents, 0);
    const d = new Date(wEnd * 86_400_000);
    pts.push({ label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, balance: r.balanceCents - after, inflow });
  }
  return pts;
}

/* ---------- Home (bento) ---------- */

function Home({ r, profile, openLine, setWhy, addEntry, txns, events }: { r: NumberResult; profile: Profile; openLine: (l: Line) => void; setWhy: (w: Why) => void; addEntry: (t: string) => { ok: boolean; msg: string }; txns: Txn[]; events: LogLine[] }) {
  const s = status(r);
  const shown = useCountUp(r.theNumberCents);
  const series = useMemo(() => weekly(txns, r), [txns, r]);
  const j = jars(r);
  const fmtDate = (iso: string, year = false) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
  const pastDue = r.quarters.filter((q) => (q.status === "missed" || q.status === "locked") && q.remainingCents > 0);
  const pastDueTotal = pastDue.reduce((t, q) => t + q.remainingCents, 0);
  const anyLate = pastDue.some((q) => q.status === "missed");
  const live = r.quarters.find((q) => q.status === "building");
  const liveShown = useCountUp(live?.remainingCents ?? 0);
  const elapsed = live ? Math.min(1, Math.max(0, (dayNum(r.asOf) - dayNum(live.start) + 1) / (dayNum(live.end) - dayNum(live.start) + 1))) : 0;
  const monthsLeft = live ? Math.max(1, Math.ceil((dayNum(live.due) - dayNum(r.asOf)) / 30)) : 1;
  const free = Math.max(0, r.safeToSpendCents);
  const win = live ? txns.filter((t) => t.date >= live.start && t.date <= r.asOf) : [];
  const winIn = win.filter((t) => t.kind === "business_income" || (t.kind === "review" && t.amountCents > 0)).reduce((a, t) => a + t.amountCents, 0);
  const winCost = win.filter((t) => t.kind === "business_expense").reduce((a, t) => a - t.amountCents, 0);
  const [entry, setEntry] = useState("");
  const [entryMsg, setEntryMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const submitEntry = (ev: React.FormEvent) => { ev.preventDefault(); const res = addEntry(entry); setEntryMsg(res); if (res.ok) setEntry(""); };
  const steps: [string, number, string][] = [
    ["You have", r.balanceCents, "In all your accounts right now"],
    ["Already spoken for", r.theNumberCents, "Your Number. Tap a line below to see why"],
    ["Free to spend", free, free > 0 ? "Yours to spend or reinvest" : `Add ${formatUSD(-r.safeToSpendCents)} and you're fully covered`],
  ];
  const ringRows: [string, number, number, string, string][] = [
    ["Taxes", j.irsHave, j.irsNeed, "var(--ring-1)", `This is money the IRS will ask for: ${formatUSD(r.fed.se.totalCents)} self-employment tax + ${formatUSD(r.fed.incomeTaxCents)} income tax${r.taxPaidCents ? `, minus ${formatUSD(r.taxPaidCents)} you already paid` : ""}. Your money covers this first.`],
    ["Business costs + bills", j.bizHave, j.bizNeed, "var(--ring-2)", `One month of business costs (${formatUSD(r.cushionCents)}) plus bills due soon (${formatUSD(r.billsCents)}). This keeps a slow month or a broken pump from sinking you.`],
    ["Free to spend", j.yours, 0, "var(--ring-3)", `Whatever is left after taxes and business costs are covered. ${j.yours === 0 ? "Right now that's $0." : `Right now you can spend or reinvest ${formatUSD(j.yours)}.`}`],
  ];
  const year: [string, number, string][] = [
    ["Money in · 2026", r.incomeCents, `${txns.filter((t) => t.kind === "business_income").length} customer payments`],
    ["Business costs", r.expensesCents, "fuel, supplies, gear, insurance"],
    ["Profit", r.netProfitCents, "money in minus costs"],
    ["Tax on that profit", r.fed.totalTaxCents, r.fed.incomeTaxCents === 0 ? "all of it self-employment tax" : "income + self-employment"],
  ];
  return (
    <>
      {/* 1. The answer, in one card */}
      <section className="card hero-glow overflow-hidden p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-400"><span className="dot live-dot" style={{ background: "var(--green)" }} />Your Number · updates every time money moves</div>
            <div className="font-display num mt-3 text-[clamp(3.75rem,10vw,6.5rem)] font-semibold leading-none tracking-tight">{formatUSD(shown)}</div>
            <p className="mt-4 max-w-md text-lg leading-snug text-zinc-300">Always keep at least this much. It's already spoken for by taxes, business costs and bills coming up.</p>
            <div className="mt-5 inline-flex items-center gap-3 rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3">
              <span className="dot" style={{ background: s.color }} />
              <div><div className="font-semibold">{s.title}</div><div className="muted text-sm">{s.sub}</div></div>
            </div>
          </div>
          <ol className="space-y-2">
            {steps.map(([l, v, sub], i) => (
              <li key={l} className={`flex items-center justify-between gap-4 rounded-2xl border px-5 py-4 ${i === 2 ? "border-white/40 bg-white/[0.06]" : "border-zinc-800 bg-black/30"}`}>
                <div className="min-w-0"><div className="text-sm font-medium">{i === 1 ? "− " : i === 2 ? "= " : ""}{l}</div><div className="muted text-xs">{sub}</div></div>
                <div className="font-display num shrink-0 text-2xl font-semibold sm:text-3xl">{formatUSD(v)}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 2. IRS payments: locked vs. live */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col p-6">
          <div className="flex items-center justify-between gap-2"><Label icon={Lock}>{anyLate ? "1 · Owed now · locked in" : "1 · Due next · locked in"}</Label><span className="text-xs text-zinc-500">fixed</span></div>
          {pastDue.length ? (
            <>
              <div className="font-display num mt-4 text-5xl font-semibold">{formatUSD(pastDueTotal)}</div>
              <p className="muted mt-1 text-sm">These periods are over, so these amounts won't change.</p>
              <ul className="mt-4 divide-y text-sm">
                {pastDue.map((q) => (
                  <li key={q.quarter} className="flex items-center justify-between gap-3 py-2.5">
                    <span><span className="font-medium">Due {fmtDate(q.due)}</span><span className="muted block text-xs">for {q.covers}</span></span>
                    <span className="flex items-center gap-2"><span className="num font-semibold">{formatUSD(q.remainingCents)}</span>{q.status === "missed" && <span className="flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300"><span className="dot !h-1.5 !w-1.5" style={{ background: "var(--red)" }} />late</span>}</span>
                  </li>
                ))}
              </ul>
              <a href="https://www.irs.gov/payments" target="_blank" rel="noreferrer" className="btn btn-primary w-full" style={{ marginTop: "auto" }}>Pay at irs.gov <ArrowUpRight size={15} /></a>
            </>
          ) : (
            <><div className="font-display num mt-4 text-5xl font-semibold">$0</div><p className="muted mt-2 text-sm">You're caught up. Nothing is locked in and waiting.</p></>
          )}
        </div>

        {live && (
          <div className="card hero-glow flex flex-col p-6">
            <div className="flex items-center justify-between gap-2"><Label icon={CalendarClock}>2 · Next payment · building now</Label><span className="flex items-center gap-1.5 text-xs text-zinc-400"><span className="dot live-dot" style={{ background: "var(--green)" }} />live</span></div>
            <div className="font-display num mt-4 text-5xl font-semibold">{formatUSD(liveShown)}</div>
            <div className="mt-1 text-sm text-zinc-400">Due <b className="text-white">{fmtDate(live.due, true)}</b> · {Math.round(dayNum(live.due) - dayNum(r.asOf))} days</div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {([["Earned", winIn], ["Business costs", winCost], ["Profit", winIn - winCost]] as [string, number][]).map(([l, v]) => (
                <div key={l} className="rounded-xl border border-zinc-800 bg-black/30 px-2 py-2.5"><dt className="muted text-[11px]">{l}</dt><dd className="num mt-0.5 font-semibold">{formatUSD(v)}</dd></div>
              ))}
            </dl>
            <p className="muted mt-1.5 text-[11px]">Only counts money from {fmtDate(live.start)} to today. Tax on that profit = this payment.</p>
            <div className="mt-5">
              <div className="flex justify-between text-xs text-zinc-500"><span>{fmtDate(live.start)}</span><span>locks {fmtDate(live.end)}</span></div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{ width: `${Math.max(4, elapsed * 100)}%` }} /></div>
            </div>
            <p className="mt-4 text-sm">Set aside <b>{formatUSD(Math.round(live.remainingCents / monthsLeft))}/month</b> and it's covered. It locks on {fmtDate(live.end)}.</p>
            <form onSubmit={submitEntry} className="mt-auto pt-5">
              <label htmlFor="entry" className="text-sm font-medium">What happened? Type it and watch this update.</label>
              <div className="mt-2 flex gap-2">
                <input id="entry" className="input !rounded-full !py-2.5" value={entry} onChange={(ev) => { setEntry(ev.target.value); setEntryMsg(null); }} placeholder="got $350 for a house wash" autoComplete="off" />
                <button className="btn btn-primary shrink-0 !px-4" aria-label="Add"><ArrowRight size={16} /></button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["got $350 for a house wash", "spent $180 on sneakers", "bought $45 of gas for the truck"].map((x) => <button type="button" key={x} onClick={() => { setEntry(x); setEntryMsg(null); }} className="rounded-full border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-white">{x}</button>)}
              </div>
              {entryMsg && <p role="status" className={`mt-2 text-sm ${entryMsg.ok ? "text-white" : "text-zinc-400"}`}>{entryMsg.ok && <span className="dot mr-1.5" style={{ background: "var(--green)" }} />}{entryMsg.msg}</p>}
            </form>
          </div>
        )}

      </section>

      {/* 3. The year in four numbers */}
      <section className="card grid grid-cols-2 gap-px overflow-hidden !bg-white/[0.06] p-0 lg:grid-cols-4" aria-label="2026 so far">
        {year.map(([l, v, sub]) => (
          <div key={l} className="tile p-5 sm:p-6">
            <div className="muted text-xs font-medium uppercase tracking-[0.12em]">{l}</div>
            <div className="font-display num mt-2 text-[clamp(1.8rem,4vw,2.7rem)] font-semibold leading-none">{formatUSD(v)}</div>
            <div className="muted mt-2 text-xs">{sub}</div>
          </div>
        ))}
      </section>

      {/* 4. How we got it + try it */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3"><h2 className="font-display text-xl font-semibold">How we got {formatUSD(r.theNumberCents)}</h2><span className="muted text-xs">tap any line</span></div>
          <ul className="mt-3 divide-y">
            {r.lines.map((l) => (
              <li key={l.key}><button className="flex w-full items-center justify-between gap-3 py-3 text-left" onClick={() => openLine(l)}><span className="flex items-center gap-2 text-zinc-300">{l.label}<Info size={13} className="text-zinc-600" /></span><span className="num font-semibold">{formatUSD(l.amountCents)}</span></button></li>
            ))}
            <li className="flex items-center justify-between pt-3 font-semibold"><span>Your Number</span><span className="num text-lg">{formatUSD(r.theNumberCents)}</span></li>
          </ul>
        </div>
        <div className="space-y-4">
          {profile.parentRule && (
            <button onClick={() => setWhy({ title: "Myth: “under the limit means you owe nothing”", body: `Being under the ${formatUSD(TAX_2026.standardDeductionCents)} standard deduction means $0 federal income tax, and that part is true here. But self-employment tax is separate. It's Social Security + Medicare for people who work for themselves, and it starts once you net $400, at any age. On ${formatUSD(r.netProfitCents)} of profit that's ${formatUSD(r.fed.se.totalCents)}. Most young owners (and their parents) don't know this until the bill shows up.` })}
              className="card card-hover flex w-full flex-col items-start p-6 text-left">
              <Label icon={AlertTriangle}>Myth buster</Label>
              <div className="font-display mt-3 text-xl font-semibold leading-snug"><span className="text-zinc-500 line-through">{profile.parentRule.label}</span></div>
              <p className="mt-2 text-sm text-zinc-400">Income tax: {formatUSD(r.fed.incomeTaxCents)}. Self-employment tax: <b className="text-white">{formatUSD(r.fed.se.totalCents)}</b>.</p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium">See why <ArrowUpRight size={14} /></span>
            </button>
          )}
          <div className="card p-6">
          <Label>Where your {formatUSD(r.balanceCents)} goes first</Label>
          <div className="mt-4 flex justify-center"><Rings j={j} /></div>
          <ul className="mt-4 space-y-1 text-sm">
            {ringRows.map(([l, have, need, c, w]) => (
              <li key={l}>
                <button className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-white/5" onClick={() => setWhy({ title: l, body: w })}>
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>
                  <span className="num"><b>{formatUSD(have)}</b>{need > 0 && <span className="muted"> of {formatUSD(need)}</span>}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        </div>
      </section>

      {/* 5. Details */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2"><BalanceChart data={series} number={r.theNumberCents} /></div>
        <WeekBars data={series.slice(-12)} />
      </section>
      <ActivityLog txns={txns} events={events} />
    </>
  );
}

function BalanceChart({ data, number }: { data: { label: string; balance: number }[]; number: number }) {
  const W = 640, H = 170, P = 6;
  const vals = data.map((d) => d.balance);
  const max = Math.max(number, ...vals) * 1.1, min = Math.min(0, ...vals);
  const x = (i: number) => P + (i / (data.length - 1)) * (W - P * 2);
  const y = (v: number) => H - P - ((v - min) / (max - min || 1)) * (H - P * 2);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${H} L${x(0)},${H} Z`;
  const last = data[data.length - 1];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500"><span className="font-display text-lg font-semibold text-white">Your money vs. your Number · 16 weeks</span><span className="flex items-center gap-3"><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-white" />Balance</span><span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-zinc-400" />Your Number</span></span></div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label={`Balance over the last 16 weeks, now ${formatUSD(last.balance)}, against a Number of ${formatUSD(number)}`}>
        <defs><linearGradient id="bal" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".22" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#bal)" />
        <line x1={P} x2={W - P} y1={y(number)} y2={y(number)} stroke="#a1a1aa" strokeDasharray="5 5" strokeWidth="1.2" />
        <path d={line} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(data.length - 1)} cy={y(last.balance)} r="4.5" fill="#fff" />
        <circle cx={x(data.length - 1)} cy={y(last.balance)} r="10" fill="#fff" opacity=".15" className="live-dot" />
        {data.map((d, i) => i % 3 === 0 || i === data.length - 1 ? <text key={i} x={x(i)} y={H + 15} fontSize="11" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fill="#6b6b70">{i === data.length - 1 ? "now" : d.label}</text> : null)}
      </svg>
    </div>
  );
}

function Rings({ j }: { j: ReturnType<typeof jars> }) {
  const rings = [
    { r: 78, pct: j.irsNeed ? j.irsHave / j.irsNeed : 1, c: "var(--ring-1)" },
    { r: 60, pct: j.bizNeed ? j.bizHave / j.bizNeed : 1, c: "var(--ring-2)" },
    { r: 42, pct: j.yours > 0 ? 1 : 0, c: "var(--ring-3)" },
  ];
  const irsPct = Math.round(rings[0].pct * 100);
  return (
    <svg viewBox="0 0 180 180" className="h-48 w-48" role="img" aria-label={`Taxes ${irsPct}% covered`}>
      {rings.map((g) => {
        const C = 2 * Math.PI * g.r;
        return (
          <g key={g.r} transform="rotate(-90 90 90)">
            <circle cx="90" cy="90" r={g.r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="12" />
            {g.pct > 0 && <circle cx="90" cy="90" r={g.r} fill="none" stroke={g.c} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${C * Math.min(1, g.pct)} ${C}`} style={{ transition: "stroke-dasharray .8s ease" }} />}
          </g>
        );
      })}
      <text x="90" y="88" textAnchor="middle" fontSize="26" fontWeight="600" fill="#fff" fontFamily="Geist, sans-serif">{irsPct}%</text>
      <text x="90" y="106" textAnchor="middle" fontSize="10" fill="#8b8b91" fontFamily="Geist, sans-serif">taxes covered</text>
    </svg>
  );
}

function ActivityLog({ txns, events }: { txns: Txn[]; events: LogLine[] }) {
  const kindWord: Record<Txn["kind"], string> = { business_income: "business income", business_expense: "business cost", personal: "personal", transfer: "moved between accounts", tax_payment: "irs", review: "needs your answer" };
  const recent: LogLine[] = [...txns].filter((t) => !t.id.startsWith("sim-")).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 7).map((t) => ({
    id: t.id, time: t.date.slice(5).replace("-", "/"), tone: t.kind === "review" ? "warn" : t.amountCents > 0 ? "in" : "out",
    text: `${t.amountCents > 0 ? "got" : "paid"} ${formatUSD(Math.abs(t.amountCents), { cents: true })} · ${t.source.toLowerCase()} · ${(t.description || "no note").toLowerCase().slice(0, 24)} → ${kindWord[t.kind]}`,
  }));
  const lines = [...events, ...recent].slice(0, 8);
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--line)" }}>
        <span className="flex items-center gap-2 font-mono text-xs text-zinc-400"><Terminal size={14} />activity.log</span>
        <span className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-zinc-700" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-700" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-700" /></span>
      </div>
      <ol className="space-y-2 p-5 font-mono text-[12px] leading-relaxed">
        <li className="text-zinc-500">$ the-number watch --accounts all</li>
        {lines.map((l) => (
          <li key={l.id} className={`flex gap-3 ${l.tone === "in" ? "text-white" : l.tone === "warn" ? "text-zinc-200" : "text-zinc-400"}`}>
            <span className="shrink-0 text-zinc-600">{l.time}</span>
            <span className="min-w-0 break-words">{l.tone === "warn" && <span className="dot mr-1.5 !h-1.5 !w-1.5 align-middle" style={{ background: "var(--amber)" }} />}{l.text}</span>
          </li>
        ))}
        <li className="text-zinc-500">$ <span className="live-dot inline-block h-3 w-1.5 translate-y-0.5 bg-white" /></li>
      </ol>
    </div>
  );
}

function WeekBars({ data }: { data: { label: string; inflow: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.inflow));
  const now = data[data.length - 1];
  const total = data.reduce((s, d) => s + d.inflow, 0);
  return (
    <div className="card flex flex-col p-6">
      <Label icon={BookOpen}>Money in · per week</Label>
      <div className="mt-4 flex items-baseline gap-2"><span className="font-display num text-5xl font-semibold">{formatUSD(total)}</span><span className="muted text-sm">12 weeks</span></div>
      <div className="muted mt-1 text-sm">{formatUSD(now.inflow)} this week · best week {formatUSD(Math.max(...data.map((d) => d.inflow)))}</div>
      <div className="mt-auto flex h-32 items-end gap-1.5 pt-6" role="img" aria-label="Money in per week, last 12 weeks">
        {data.map((d, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end">
            <div className={`w-full rounded-md transition-all ${i === data.length - 1 ? "bg-white" : "bg-white/20 group-hover:bg-white/40"}`} style={{ height: `${Math.max(3, (d.inflow / max) * 100)}%` }} title={`Week of ${d.label}: ${formatUSD(d.inflow)}`} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-zinc-600"><span>{data[0].label}</span><span>now</span></div>
    </div>
  );
}

/* ---------- Alerts ---------- */

function Alerts({ r, go, prefs, setPref }: { r: NumberResult; go: (t: Tab) => void; prefs: AlertPrefs; setPref: (k: string, v: boolean) => void }) {
  const color = { critical: "var(--red)", warning: "var(--amber)", info: "#ffffff" };
  const Icon = { critical: Octagon, warning: AlertTriangle, info: Bell };
  const action = (id: string): [string, Tab] | null => id === "review" ? ["Sort them now", "money"] : id === "missed" || id === "next" ? ["How estimated taxes work", "learn"] : id === "below" ? ["See my jars", "home"] : id === "rule" ? ["Why it's wrong", "learn"] : null;
  const due = new Date(r.next.due + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const tips: [string, string][] = [
    r.safeToSpendCents < 0
      ? ["Top up today", `Move ${formatUSD(-r.safeToSpendCents)} into your business account and you're fully covered again.`]
      : ["You have room", `${formatUSD(r.safeToSpendCents)} is above your Number. Reinvest some of it in gear before you spend it.`],
    [r.missed.length ? "Pay the IRS now, not later" : "Pay a little every month", r.missed.length ? `${r.missed.length} payment${r.missed.length > 1 ? "s" : ""} already passed. Paying ${formatUSD(r.owedSoFarCents)} at irs.gov/payments before ${due} stops the late penalty from growing.` : `Set aside ${formatUSD(r.saveThisMonthCents)} a month and the ${due} payment is already covered.`],
    ...(r.reviewCount ? [["Sort your mystery payments", `${r.reviewCount} payment${r.reviewCount > 1 ? "s" : ""} could be business or personal. Answering takes about a minute and makes your Number exact.`] as [string, string]] : []),
    ["Keep a separate business profile", "A Cash App or Venmo business profile keeps customer money apart from your own. It makes tax time a lot easier."],
  ];
  const settings: [string, string, string][] = [
    ["below", "I drop below my Number", "The moment your balance dips under what's spoken for."],
    ["due", "An IRS payment is coming up", "14 days and 3 days before each due date, with the amount."],
    ["big", "I spend more than $100 at once", "So a big purchase never surprises you later."],
    ["paid", "A customer pays me", "Shows how much of it goes to the IRS jar."],
    ["weekly", "Weekly money recap", "Sundays: what you earned, spent, and should set aside."],
    ["locks", "A tax payment locks in", "When a period ends and the amount you owe is final."],
  ];
  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <h1 className="font-display text-4xl font-semibold">Alerts</h1>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <Label>Right now</Label>
          {r.alerts.map((a) => {
            const act = action(a.id); const I = Icon[a.level];
            return (
              <div key={a.id} className="card flex gap-4 p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-zinc-800"><I size={17} style={{ color: color[a.level] }} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2"><div className="font-semibold">{a.title}</div><div className="muted shrink-0 text-xs">now</div></div>
                  <div className="muted mt-0.5 text-sm">{a.body}</div>
                  {act && <button className="mt-2 flex items-center gap-1.5 text-sm font-medium hover:underline" onClick={() => go(act[1])}>{act[0]} <ArrowRight size={14} /></button>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-6">
            <h2 className="font-display text-xl font-semibold">Text me when…</h2>
            <p className="muted mt-1 text-sm">Pick the alerts you want. Change them any time.</p>
            <ul className="mt-4 space-y-1">
              {settings.map(([k, t, d]) => (
                <li key={k}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl p-2.5 hover:bg-white/[0.04]">
                    <input type="checkbox" className="peer sr-only" checked={!!prefs[k]} onChange={(e) => setPref(k, e.target.checked)} />
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-white ${prefs[k] ? "border-white bg-white text-black" : "border-zinc-600"}`}>{prefs[k] && <Check size={14} strokeWidth={3} />}</span>
                    <span><span className="block text-sm font-medium">{t}</span><span className="muted block text-xs">{d}</span></span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <span className="muted mr-1 self-center text-xs">Send by</span>
              {[["sms", "Text"], ["email", "Email"]].map(([k, l]) => (
                <button key={k} role="switch" aria-checked={!!prefs[k]} onClick={() => setPref(k, !prefs[k])} className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${prefs[k] ? "border-white bg-white text-black" : "border-zinc-700 text-zinc-300"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="card p-6">
            <h2 className="font-display flex items-center gap-2 text-xl font-semibold"><Lightbulb size={18} />Tips for you</h2>
            <ol className="mt-4 space-y-4">
              {tips.map(([t, d], i) => (
                <li key={t} className="flex gap-3"><span className="font-mono text-xs text-zinc-500">0{i + 1}</span><div><div className="text-sm font-semibold">{t}</div><div className="muted mt-0.5 text-sm">{d}</div></div></li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Money ---------- */

const KIND_LABEL: Record<Txn["kind"], [string, string]> = {
  business_income: ["Business income", "var(--green)"],
  business_expense: ["Business cost", "#a1a1aa"],
  personal: ["Personal", "#52525b"],
  transfer: ["Moved between your accounts", "#52525b"],
  tax_payment: ["Tax payment", "#ffffff"],
  review: ["Needs answer", "var(--amber)"],
};

function TxnRow({ t, children }: { t: Txn; children?: React.ReactNode }) {
  const [label, color] = KIND_LABEL[t.kind];
  const who = t.counterparty && t.counterparty !== t.description ? t.counterparty : "";
  const isIn = t.amountCents > 0;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="truncate font-medium">{t.description || "(no note)"}{who && <span className="muted text-sm"> · {who}</span>}</div>
        <div className="muted mt-0.5 flex items-center gap-1.5 text-xs">{t.date} · {t.source} · <span className="dot !h-1.5 !w-1.5" style={{ background: color }} />{label}</div>
      </div>
      <div className="flex items-center gap-3">
        {children}
        <div className="text-right"><div className={`num font-semibold ${isIn ? "text-white" : "text-zinc-300"}`}>{formatUSD(Math.abs(t.amountCents), { cents: true })}</div><div className="muted text-[11px]">{isIn ? "money in" : "money out"}</div></div>
      </div>
    </li>
  );
}

function Money({ r, txns, setKind, profile }: { r: NumberResult; txns: Txn[]; setKind: (id: string, k: "business_income" | "personal" | "business_expense") => void; profile: Profile }) {
  const review = txns.filter((t) => t.kind === "review");
  const current = review[0];
  const [filter, setFilter] = useState<"all" | Txn["kind"]>("all");
  const list = txns.filter((t) => filter === "all" || t.kind === filter).sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <>
      <h1 className="font-display text-4xl font-semibold">Money</h1>
      <section className="grid gap-4 lg:grid-cols-5">
        <div className="card hero-glow p-6 lg:col-span-2">
          <h2 className="font-display text-xl font-semibold">Business or personal?</h2>
          {current ? (
            <div className="mt-4 rounded-3xl border border-zinc-800 bg-black/40 p-6 text-center">
              <div className="muted text-xs">{review.length} left · {current.date} · {current.source}</div>
              <div className="mt-2 text-sm font-medium text-zinc-400">{current.amountCents > 0 ? "You got paid" : "You paid"}</div>
              <div className="font-display num mt-1 text-5xl font-semibold">{formatUSD(Math.abs(current.amountCents), { cents: true })}</div>
              <div className="mt-2 text-zinc-300">{`${current.description || "(no note)"}${current.counterparty && current.counterparty !== current.description ? ` · ${current.counterparty}` : ""}`}</div>
              <div className="muted mt-4 text-sm">Was this for your business, or just for you?</div>
              {(
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="btn btn-primary" onClick={() => setKind(current.id, current.amountCents > 0 ? "business_income" : "business_expense")}><Briefcase size={16} />Business</button>
                  <button className="btn btn-ghost" onClick={() => setKind(current.id, "personal")}><User size={16} />Personal</button>
                </div>
              )}
            </div>
          ) : <p className="mt-3 flex items-center gap-2 text-sm"><span className="dot" style={{ background: "var(--green)" }} />All sorted. Your Number is exact.</p>}
          <p className="muted mt-4 text-xs">Payment apps expect business money on a business profile. Sorting keeps your books, and your account, legit.</p>
        </div>
        <div className="card p-6 lg:col-span-3"><h2 className="font-display text-xl font-semibold">Money in vs. business costs</h2><p className="muted mb-4 text-sm">2026 by month.</p><BarChart data={r.monthly} /></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="card p-6 lg:col-span-2">
          <h2 className="font-display text-xl font-semibold">Where business money goes</h2>
          <ul className="mt-4 space-y-4">
            {r.topCategories.slice(0, 6).map((c) => (
              <li key={c.category}>
                <div className="flex justify-between text-sm"><span className="text-zinc-300">{c.category}</span><span className="num font-semibold">{formatUSD(c.amountCents)}</span></div>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/10"><div className="h-1.5 rounded-full bg-white" style={{ width: `${Math.round((c.amountCents / (r.topCategories[0]?.amountCents || 1)) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-3"><Cpa r={r} txns={txns} profile={profile} /></div>
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">All transactions</h2>
          <select className="input !w-auto !rounded-full !py-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter">
            <option value="all">All ({txns.length})</option>
            {Object.entries(KIND_LABEL).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <ul className="mt-2 divide-y">{list.slice(0, 100).map((t) => <TxnRow key={t.id} t={t} />)}</ul>
      </section>
    </>
  );
}

function BarChart({ data }: { data: NumberResult["monthly"] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.incomeCents, d.expensesCents)));
  const W = 560, H = 190, pad = 34, bw = (W - pad) / Math.max(1, data.length);
  const names = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full min-w-[300px]" role="img" aria-label="Monthly income and business costs">
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={pad} x2={W} y1={H - H * g} y2={H - H * g} stroke="rgba(255,255,255,.07)" />)}
        <text x={0} y={12} fontSize="10" fill="#6b6b70">{formatUSD(max)}</text>
        {data.map((d, i) => {
          const x = pad + i * bw + bw * 0.15, w = bw * 0.33;
          const hi = (d.incomeCents / max) * (H - 8), he = (d.expensesCents / max) * (H - 8);
          return (
            <g key={d.month}>
              <rect x={x} y={H - hi} width={w} height={hi} rx="3" fill="#fff"><title>{`${d.month} money in ${formatUSD(d.incomeCents)}`}</title></rect>
              <rect x={x + w + 2} y={H - he} width={w} height={he} rx="3" fill="#52525b"><title>{`${d.month} costs ${formatUSD(d.expensesCents)}`}</title></rect>
              <text x={x + w} y={H + 16} fontSize="11" textAnchor="middle" fill="#6b6b70">{names[Number(d.month.slice(5)) - 1]}</text>
            </g>
          );
        })}
      </svg>
      <div className="muted mt-1 flex gap-4 text-xs"><span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-white" /> Money in</span><span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-zinc-600" /> Business costs</span></div>
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
    <section className="card h-full p-6">
      <h2 className="font-display text-xl font-semibold">Send to a CPA</h2>
      <p className="muted text-sm">A clean one-pager so you can graduate to a real accountant without showing up with a shoebox.</p>
      <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
        {([["Business", "Your business"], ["Gross income", formatUSD(r.incomeCents, { cents: true })], ["Business expenses", formatUSD(r.expensesCents, { cents: true })], ["Net profit", formatUSD(r.netProfitCents, { cents: true })], ["Self-employment tax (est.)", formatUSD(r.fed.se.totalCents, { cents: true })], ["Income tax (est.)", formatUSD(r.fed.incomeTaxCents, { cents: true })], ["Estimated payments made", formatUSD(r.taxPaidCents, { cents: true })], ["Unsorted items", String(r.reviewCount)]] as [string, string][]).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b py-2 text-sm" style={{ borderColor: "var(--line)" }}><dt className="muted">{k}</dt><dd className="num font-semibold">{v}</dd></div>
        ))}
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={download}><Download size={16} />Download CSV</button>
        <button className="btn btn-ghost" onClick={() => window.print()}><Printer size={16} />Print / save PDF</button>
      </div>
    </section>
  );
}

/* ---------- Learn ---------- */

const AU = "https://american.edu/media/news/20230418_CarolineBrucknerTaxLiteracySurvey.cfm";
const FB = "https://www.globenewswire.com/news-release/2025/03/19/3045674/0/en/Hidden-Tax-Challenges-for-Small-Businesses-FreshBooks-2025-Tax-Trend-Report.html";
const STATS: { big: string; what: string; means: (r: NumberResult) => string; src: string; url: string }[] = [
  { big: "1 in 3", what: "didn't know whether they had to pay the IRS every quarter.", means: (r) => `You do. Your next payment is ${formatUSD(r.owedSoFarCents)}, due ${r.next.due}.`, src: "American University Kogod, Small Business Tax Literacy Survey", url: AU },
  { big: "37%", what: "say filing taxes leaves them anxious and confused.", means: () => "That's why every line of your Number has a plain-English 'why'.", src: "American University Kogod, Small Business Tax Literacy Survey", url: AU },
  { big: "26%", what: "of small business owners and freelancers feel completely confident about their taxes.", means: () => "Confidence comes from knowing the number before April, not after.", src: "FreshBooks 2025 Tax Trends Report (about 1,300 surveyed)", url: FB },
  { big: "35%", what: "say organizing receipts is their biggest tax headache.", means: (r) => `We sorted ${formatUSD(r.expensesCents)} of your business costs automatically.`, src: "FreshBooks 2025 Tax Trends Report", url: FB },
];

function Learn({ r }: { r: NumberResult }) {
  const months = [3, 2, 3, 4];
  const cards: [string, string, React.ReactNode][] = [
    ["01", "What is The Number?", <>The lowest your money should ever go. It's <b>taxes you owe</b> + <b>one month of business costs</b> + <b>bills due soon</b>. Everything above it is yours.</>],
    ["02", "Self-employment tax (the one nobody tells you about)", <>When you have a job, your boss pays half your Social Security and Medicare. When you work for yourself, you pay both halves: <b>15.3% on 92.35% of your profit</b>. It starts at <b>$400 of profit, at any age</b> (<a className="underline" href={SOURCES.youngEntrepreneurs} target="_blank" rel="noreferrer">IRS</a>). For you that's <b>{formatUSD(r.fed.se.totalCents)}</b>.</>],
    ["03", "Why do I owe tax if I'm under the limit?", <>The {formatUSD(TAX_2026.standardDeductionCents)} standard deduction only shields you from <i>income</i> tax. That's why your income tax is {formatUSD(r.fed.incomeTaxCents)}. It doesn't cover self-employment tax at all.</>],
    ["04", "Paying the IRS during the year", <>Nobody withholds tax from your Cash App, so the IRS expects <b>estimated payments</b> four times a year. Pay at <a className="underline" href="https://www.irs.gov/payments" target="_blank" rel="noreferrer">irs.gov/payments</a>. Paying late adds a small penalty, and paying a bit each month avoids it.</>],
    ["05", "Business vs. personal on payment apps", <>Mixing them makes your profit look bigger (more tax) or smaller (trouble later). Tag every payment, or better, use a separate business profile.</>],
  ];
  return (
    <>
      <h1 className="font-display text-4xl font-semibold">Learn</h1>
      <p className="muted -mt-2 text-sm">30-second explainers using your own numbers.</p>
      <section className="card p-6">
        <h2 className="font-display text-xl font-semibold">You're not the only one confused</h2>
        <p className="muted mt-1 text-sm">What surveys of small business owners and freelancers found, and what it means for you.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((x) => (
            <div key={x.big + x.what} className="flex flex-col rounded-2xl border border-zinc-800 p-5">
              <div className="font-display num text-4xl font-semibold">{x.big}</div>
              <div className="mt-2 text-sm font-medium">{x.what}</div>
              <div className="muted mt-2 text-xs leading-relaxed">{x.means(r)}</div>
              <a href={x.url} target="_blank" rel="noreferrer" className="mt-auto pt-3 text-[11px] text-zinc-500 underline-offset-2 hover:underline">{x.src}</a>
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map(([n, title, body]) => (
          <details key={title} className="card group p-6" open={n === "02"}>
            <summary className="flex cursor-pointer list-none items-center gap-4 font-semibold"><span className="font-mono text-xs text-zinc-500">{n}</span>{title}<span className="muted ml-auto text-sm transition group-open:rotate-180">⌄</span></summary>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">{body}</p>
          </details>
        ))}
      </div>
      <section className="card p-6">
        <h2 className="font-display text-xl font-semibold">The IRS “quarters” aren't quarters</h2>
        <p className="muted mt-1 text-sm">They cover 3, then 2, then 3, then 4 months. That trips up anyone with seasonal income, so The Number plans it monthly instead.</p>
        <ol className="mt-5 grid gap-3 sm:grid-cols-4">
          {TAX_2026.quarterlyDueDates.map((q, i) => {
            const missed = r.missed.some((m) => m.due === q.due), next = r.next.due === q.due;
            return (
              <li key={q.due} className={`rounded-2xl border p-4 ${next ? "border-white bg-white/[0.04]" : "border-zinc-800"}`}>
                <div className="flex justify-between text-xs font-medium"><span className="text-zinc-400">Payment {i + 1}</span><span className="flex items-center gap-1.5">{missed && <span className="dot !h-1.5 !w-1.5" style={{ background: "var(--red)" }} />}{missed ? "Missed" : next ? "Next" : "Later"}</span></div>
                <div className="font-display num mt-1 text-lg font-semibold">{q.due}</div>
                <div className="mt-2 flex gap-1">{Array.from({ length: months[i] }).map((_, k) => <span key={k} className={`h-1.5 flex-1 rounded-full ${next ? "bg-white" : missed ? "bg-zinc-500" : "bg-zinc-800"}`} />)}</div>
                <div className="muted mt-1.5 text-xs">{months[i]} months · {q.covers}</div>
              </li>
            );
          })}
        </ol>
      </section>
      <details className="card p-6 text-sm"><summary className="cursor-pointer font-semibold">Assumptions and sources</summary>
        <ul className="muted mt-2 list-disc space-y-1 pl-5">{ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>
        <ul className="mt-2 space-y-1">{Object.entries(SOURCES).map(([k, u]) => <li key={k}><a className="underline" href={u} target="_blank" rel="noreferrer">{k}</a></li>)}</ul>
      </details>
    </>
  );
}

/* ---------- Why sheet ---------- */

function WhySheet({ title, body, txns, onClose }: Why & { onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="toast relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-zinc-800 bg-[#0b0b0b] p-7 sm:m-4 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <button className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-zinc-800 text-zinc-400 hover:text-white" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <Label>Why?</Label>
        <h3 className="font-display mt-2 pr-10 text-2xl font-semibold">{title}</h3>
        <p className="mt-3 leading-relaxed text-zinc-300">{body}</p>
        {txns && txns.length > 0 && (<><div className="muted mt-5 text-xs font-medium uppercase tracking-wider">From these transactions (latest)</div><ul className="divide-y">{txns.map((t) => <TxnRow key={t.id} t={t} />)}</ul></>)}
        <button className="btn btn-primary mt-6 w-full" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
