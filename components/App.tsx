"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Lightbulb, Lock, ArrowUpRight, Bell, BookOpen, Briefcase, CalendarClock, Download, Eye, EyeOff, GraduationCap, Home as HomeIcon, Info, LogOut, Octagon, Printer, ShoppingBag, Terminal, User, Users, Wallet, X, Zap } from "lucide-react";
import { classify } from "@/lib/classify";
import { latestBalance, normalize } from "@/lib/csv";
import { DEMO_FILES, DEMO_PROFILE } from "@/lib/demo";
import { computeNumber, type Alert, type Line, type NumberResult } from "@/lib/number";
import { federalEstimate, formatUSD } from "@/lib/tax";
import { parseEntry, type Entry } from "@/lib/entry";
import { randomFactor, scaleBusiness } from "@/lib/scale";
import { ASSUMPTIONS, SOURCES, TAX_2026, TAX_YEAR } from "@/lib/taxConfig";
import type { Profile, Txn } from "@/lib/types";
import { Connect, Landing, Logo, Pricing, SignUp, ThemeToggle, type Account } from "./Onboarding";

type Tab = "home" | "alerts" | "money" | "learn";
type Stage = "landing" | "signup" | "pricing" | "connect" | "app";
type Why = { title: string; body: string; txns?: Txn[] };

const dayNum = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;
const PLAN_NAME: Record<string, string> = { trial: "Free trial", free: "Free trial", season: "Season Pass", family: "Season Pass" };
export type AlertPrefs = Record<string, boolean>;
const DEFAULT_PREFS: AlertPrefs = { due: true, late: true, paid: true, weekly: true, locks: true, sms: true, email: false };
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
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_PREFS);
  useEffect(() => { try { const v = localStorage.getItem(PREFS_KEY); if (v) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(v) }); } catch { /* fine */ } }, []);
  const setPref = (k: string, v: boolean) => setPrefs((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem(PREFS_KEY, JSON.stringify(n)); } catch { /* fine */ } return n; });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>("");

  useEffect(() => { setAccount(loadAccount()); }, []);
  // Back from QuickBooks: pull the Profit & Loss and open the dashboard.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("qbo");
    if (!q) return;
    window.history.replaceState(null, "", "/");
    if (q !== "connected") { setError("QuickBooks wasn't connected. Try again."); setStage("connect"); return; }
    setStage("connect"); setBusy("qbo");
    fetch("/api/qbo/data").then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const last = (j.txns as Txn[]).reduce((m, t) => (t.date > m ? t.date : m), `${TAX_YEAR}-01-01`);
      setProfile({ ...DEMO_PROFILE, ownerName: "You", businessName: "Your business", age: 0, parentRule: undefined, balances: [], bills: [], asOf: new Date().toISOString().slice(0, 10) > last ? new Date().toISOString().slice(0, 10) : last });
      setTxns(j.txns); enter("QuickBooks (sandbox company), Profit & Loss");
    }).catch((e) => setError((e as Error).message)).finally(() => setBusy(""));
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [stage, tab]);
  const result = useMemo(() => (txns ? computeNumber(txns, profile) : null), [txns, profile]);

  function enter(note: string) { setSource(note); setTab("home"); setStage("app"); }

  async function loadSampleBank(bank = "your bank", via: "plaid" | "qbo" = "plaid") {
    setBusy("bank"); setError("");
    const f = randomFactor();
    try {
      const r = await fetch("/api/plaid/demo", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setProfile({ ...DEMO_PROFILE, asOf: new Date().toISOString().slice(0, 10), balances: j.balances });
      setTxns(scaleBusiness(j.txns, f)); enter(via === "qbo" ? "QuickBooks Sandbox (sample business, pulled through a Plaid Sandbox test bank, amounts randomized each load)" : `Plaid Sandbox · ${bank} (test connection, sample business, amounts randomized each load)`);
    } catch (e) {
      // Plaid unreachable (Wi-Fi, keys): fall back to the same data from local files so the demo never breaks.
      console.warn("Plaid sample bank unavailable:", (e as Error).message);
      await loadFiles("Sample business (Plaid unavailable, so the same data was loaded offline)", f);
    } finally { setBusy(""); }
  }

  async function sampleTxns() {
    const texts = await Promise.all(DEMO_FILES.map((f) => fetch(f).then((r) => r.text())));
    return texts.flatMap((t, i) => normalize(t, DEMO_FILES[i])).map(classify);
  }

  async function loadFiles(note?: string, f = randomFactor()) {
    setProfile(DEMO_PROFILE);
    setTxns(scaleBusiness(await sampleTxns(), f));
    enter(note || "Sample statements (Chase + Cash App + Venmo)");
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

  function signOut() { saveAccount(null); setAccount(null); setTxns(null); setStage("landing"); }

  if (stage === "landing") return <Landing onStart={() => setStage(account ? (account.plan ? "connect" : "pricing") : "signup")} onSignIn={() => setStage(account ? "connect" : "signup")} onDemo={() => loadSampleBank()} busy={busy === "bank"} />;
  if (stage === "signup") return <SignUp onBack={() => setStage("landing")} onDone={(a) => { setAccount(a); saveAccount(a); setStage("pricing"); }} />;
  if (stage === "pricing") return <Pricing name={account?.name || "friend"} onBack={() => setStage("landing")} onPick={(plan) => { const a = { ...(account as Account), plan }; setAccount(a); saveAccount(a); setStage("connect"); }} />;
  if (stage === "connect" || !txns || !result) return <Connect onBack={() => setStage("landing")} onPlaidSandbox={loadSampleBank} onQuickBooksSandbox={() => loadSampleBank("QuickBooks", "qbo")} onPlaid={onPlaid} busy={busy} error={error} />;

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
        {tab === "home" && <Home r={result} openLine={openLine} setWhy={setWhy} />}
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

function Label({ children, icon: I }: { children: React.ReactNode; icon?: typeof Eye }) {
  return <div className="muted flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em]">{I && <I size={14} />}{children}</div>;
}

/* ---------- Home: one number, two boxes ---------- */

function Home({ r, openLine, setWhy }: { r: NumberResult; openLine: (l: Line) => void; setWhy: (w: Why) => void }) {
  const shown = useCountUp(r.owedSoFarCents);
  const usd = (c: number) => formatUSD(c, { cents: true });
  const fmtDate = (iso: string, year = false) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
  const days = (iso: string) => Math.round(dayNum(iso) - dayNum(r.asOf));
  const live = r.quarters.find((q) => q.status === "building");
  const owedRows = r.quarters.filter((q) => (q.status === "missed" || q.status === "locked" || q.status === "building") && q.remainingCents > 0);
  const payBy = live?.due ?? r.next.due;
  const anyLate = owedRows.some((q) => q.status === "missed");
  const per100 = federalEstimate(r.netProfitCents + 10_000).totalTaxCents - r.fed.totalTaxCents;
  const taxLines = r.lines.filter((l) => l.key === "se" || l.key === "income" || l.key === "paid");

  // Box 2: only what you type. Nothing else on the page moves.
  const [extras, setExtras] = useState<(Entry & { id: string })[]>([]);
  const sum = (k: Entry["kind"], list = extras) => list.filter((e) => e.kind === k).reduce((t, e) => t + e.amountCents, 0);
  const taxOn = (list: typeof extras) => Math.max(0, federalEstimate(r.netProfitCents + sum("business_income", list) - sum("business_expense", list)).totalTaxCents - r.fed.totalTaxCents);
  const newTax = taxOn(extras);
  const newTaxShown = useCountUp(newTax);
  const [entry, setEntry] = useState("");
  const [entryMsg, setEntryMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = parseEntry(entry);
    if ("error" in e) return setEntryMsg({ ok: false, msg: e.error });
    const next = [...extras, { ...e, id: `x-${Date.now()}` }];
    const delta = taxOn(next) - newTax;
    const label = e.kind === "business_income" ? "business income" : e.kind === "business_expense" ? "business cost" : "personal";
    setExtras(next); setEntry("");
    setEntryMsg({ ok: true, msg: `${e.direction === "in" ? "+" : "−"}${formatUSD(e.amountCents)} ${e.description} (${label}): ${delta > 0 ? `you owe ${usd(delta)} more.` : delta < 0 ? `you owe ${usd(-delta)} less.` : "no change, personal money isn't taxed."}` });
  };

  return (
    <>
      {/* The one number */}
      <section className="card hero-glow overflow-hidden px-6 py-10 text-center sm:py-14">
        <div className="flex items-center justify-center gap-2 text-sm text-zinc-400"><span className="dot" style={{ background: anyLate ? "var(--red)" : "var(--green)" }} />You owe the IRS</div>
        <div className="font-display num mt-3 text-[clamp(4rem,13vw,8rem)] font-semibold leading-none tracking-tight">{usd(shown)}</div>
        <p className="mx-auto mt-4 max-w-md text-zinc-400">Federal tax on your {TAX_YEAR} business profit as a sole proprietor, minus anything you've already paid.</p>
        <button className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-300 underline-offset-4 hover:text-white hover:underline" onClick={() => setWhy({ title: `Why ${formatUSD(r.owedSoFarCents)}?`, body: taxLines.map((l) => `${l.label}: ${formatUSD(l.amountCents)}. ${l.why}`).join("\n\n") })}>Why this much? <Info size={14} /></button>
      </section>

      {/* Two boxes */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col p-6">
          <div className="flex items-center justify-between gap-2"><Label icon={Lock}>1 · Pay by {fmtDate(payBy)}</Label><span className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-[11px] text-zinc-300">fixed</span></div>
          <div className="font-display num mt-4 text-5xl font-semibold">{usd(r.owedSoFarCents)}</div>
          <div className="mt-1 text-sm text-zinc-400">Due <b className="text-white">{fmtDate(payBy, true)}</b> · {days(payBy)} days from now</div>
          <p className="muted mt-2 text-sm">Tax on money you've already earned. It won't change.</p>
          {owedRows.length > 1 && (
            <ul className="mt-3 divide-y text-sm">
              {owedRows.map((q) => (
                <li key={q.quarter} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-zinc-300">{q.status === "building" ? `${q.covers.split(" – ")[0]} – today` : q.covers}</span>
                  <span className="flex items-center gap-2"><span className="num font-medium">{usd(q.remainingCents)}</span>{q.status === "missed" && <span className="flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300"><span className="dot !h-1.5 !w-1.5" style={{ background: "var(--red)" }} />late</span>}</span>
                </li>
              ))}
            </ul>
          )}
          {anyLate && <p className="muted mt-3 text-xs">Late parts add a small IRS penalty until they're paid. Paying sooner keeps it small.</p>}
          <a href="https://www.irs.gov/payments" target="_blank" rel="noreferrer" className="btn btn-primary w-full" style={{ marginTop: "auto" }}>Pay at irs.gov <ArrowUpRight size={15} /></a>
        </div>

        <div className="card hero-glow flex flex-col p-6">
          <div className="flex items-center justify-between gap-2"><Label icon={CalendarClock}>2 · New money · through {live ? fmtDate(live.end) : fmtDate(payBy)}</Label><span className="flex items-center gap-1.5 text-xs text-zinc-400"><span className="dot live-dot" style={{ background: "var(--green)" }} />live</span></div>
          <div className="mt-4 font-display num text-4xl font-semibold">{usd(newTaxShown)}</div>
          <div className="mt-1 text-sm text-zinc-400">More you'll owe from new money until <b className="text-white">{live ? fmtDate(live.end, true) : fmtDate(payBy, true)}</b>{live && <> · {days(live.end)} days left</>}</div>
          <p className="muted mt-2 text-sm">Rule of thumb right now: about <b className="text-white">{formatUSD(per100)} of every $100</b> you earn goes to taxes.</p>
          {extras.length > 0 && (
            <ul className="mt-3 max-h-32 space-y-1.5 overflow-y-auto text-sm">
              {[...extras].reverse().map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-zinc-300">{x.direction === "in" ? "+" : "−"}{formatUSD(x.amountCents)} · {x.description} <span className="muted text-xs">({x.kind === "business_income" ? "income" : x.kind === "business_expense" ? "business cost" : "personal"})</span></span>
                  <button className="shrink-0 text-zinc-600 hover:text-white" aria-label={`Remove ${x.description}`} onClick={() => { setExtras((e) => e.filter((y) => y.id !== x.id)); setEntryMsg(null); }}><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={submit} className="mt-auto pt-5">
            <label htmlFor="entry" className="text-sm font-medium">Made or spent money? Type it.</label>
            <div className="mt-2 flex gap-2">
              <input id="entry" className="input !rounded-full !py-2.5" value={entry} onChange={(ev) => { setEntry(ev.target.value); setEntryMsg(null); }} placeholder="earned $350 on a house wash" autoComplete="off" />
              <button className="btn btn-primary shrink-0 !px-4" aria-label="Add"><ArrowRight size={16} /></button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["earned $350 on a house wash", "$45 gas for the truck", "spent $180 on sneakers"].map((x) => <button type="button" key={x} onClick={() => { setEntry(x); setEntryMsg(null); }} className="rounded-full border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-white">{x}</button>)}
            </div>
            {entryMsg && <p role="status" className={`mt-2 text-sm ${entryMsg.ok ? "text-white" : "text-zinc-400"}`}>{entryMsg.msg}</p>}
          </form>
        </div>
      </section>
    </>
  );
}

/* ---------- Alerts ---------- */

function Alerts({ r, go, prefs, setPref }: { r: NumberResult; go: (t: Tab) => void; prefs: AlertPrefs; setPref: (k: string, v: boolean) => void }) {
  const color = { critical: "var(--red)", warning: "var(--amber)", info: "#ffffff" };
  const Icon = { critical: Octagon, warning: AlertTriangle, info: Bell };
  const action = (id: string): [string, Tab] | null => id === "review" ? ["Sort them now", "money"] : id === "missed" || id === "next" ? ["How estimated taxes work", "learn"] : id === "below" ? ["See my jars", "home"] : id === "rule" ? ["Why it's wrong", "learn"] : null;
  const due = new Date(r.next.due + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const per100 = federalEstimate(r.netProfitCents + 10_000).totalTaxCents - r.fed.totalTaxCents;
  const shown = r.alerts.filter((a) => a.id !== "below");
  const tips: [string, string][] = [
    ["Set aside part of every job", `Right now about ${formatUSD(per100)} of every $100 you earn goes to taxes. Moving that into savings when you get paid means the bill is never a surprise.`],
    [r.missed.length ? "Pay the IRS now, not later" : "Pay a little every month", r.missed.length ? `${r.missed.length} payment${r.missed.length > 1 ? "s" : ""} already passed. Paying ${formatUSD(r.owedSoFarCents)} at irs.gov/payments before ${due} stops the late penalty from growing.` : `Set aside ${formatUSD(r.saveThisMonthCents)} a month and the ${due} payment is already covered.`],
    ...(r.reviewCount ? [["Sort your mystery payments", `${r.reviewCount} payment${r.reviewCount > 1 ? "s" : ""} could be business or personal. Answering takes about a minute and makes your Number exact.`] as [string, string]] : []),
    ["Keep a separate business profile", "A Cash App or Venmo business profile keeps customer money apart from your own. It makes tax time a lot easier."],
    ["Keep receipts for business costs", "Gas, supplies and gear lower your profit, so they lower what you owe. A photo of the receipt is enough."],
  ];
  const settings: [string, string, string][] = [
    ["due", "An IRS payment is coming up", "14 days and 3 days before each due date, with the amount."],
    ["late", "A payment is late", "Right after a due date passes, with what to pay."],
    ["paid", "A customer pays me", "Shows how much of it you'll owe in tax."],
    ["weekly", "Weekly recap", "Sundays: what you earned and what you owe now."],
    ["locks", "A tax payment locks in", "When a period ends and the amount you owe is final."],
  ];
  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <h1 className="font-display text-4xl font-semibold">Alerts</h1>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <Label>About what you owe</Label>
          {shown.map((a) => {
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
    ["01", "What is The Number?", <>How much you owe the IRS for your business this year, after anything you've already paid. One number, always up to date.</>],
    ["00", "Am I a sole proprietor?", <>If you run a business by yourself and never formed an LLC or corporation, yes, automatically. You and the business are the same for taxes: profit goes on <b>Schedule C</b> of your own return, and nobody takes tax out for you (<a className="underline" href={SOURCES.soleProprietor} target="_blank" rel="noreferrer">IRS</a>).</>],
    ["02", "Self-employment tax (the one nobody tells you about)", <>When you have a job, your boss pays half your Social Security and Medicare. When you work for yourself, you pay both halves: <b>15.3% on 92.35% of your profit</b>. It starts at <b>$400 of profit, at any age</b> (<a className="underline" href={SOURCES.youngEntrepreneurs} target="_blank" rel="noreferrer">IRS</a>). For you that's <b>{formatUSD(r.fed.se.totalCents)}</b>.</>],
    ["03", "Why do I owe tax if I'm under the limit?", <>The {formatUSD(TAX_2026.standardDeductionCents)} standard deduction only shields you from <i>income</i> tax. That's why your income tax is {formatUSD(r.fed.incomeTaxCents)}. It doesn't cover self-employment tax at all.</>],
    ["04", "Paying the IRS during the year", <>Nobody withholds tax from your Cash App, so the IRS expects <b>estimated payments</b> four times a year. Pay at <a className="underline" href="https://www.irs.gov/payments" target="_blank" rel="noreferrer">irs.gov/payments</a>. Paying late adds a small penalty, and paying a bit each month avoids it.</>],
    ["06", "The 20% small-business deduction", <>Sole proprietors can knock up to 20% off their business profit for income tax (the QBI deduction). We include it, so your number isn't inflated (<a className="underline" href={SOURCES.qbi} target="_blank" rel="noreferrer">IRS</a>).</>],
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
        <p className="mt-3 whitespace-pre-line leading-relaxed text-zinc-300">{body}</p>
        {txns && txns.length > 0 && (<><div className="muted mt-5 text-xs font-medium uppercase tracking-wider">From these transactions (latest)</div><ul className="divide-y">{txns.map((t) => <TxnRow key={t.id} t={t} />)}</ul></>)}
        <button className="btn btn-primary mt-6 w-full" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
