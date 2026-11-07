"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, ArrowUpRight, Bell, BookOpen, Briefcase, CalendarClock, Download, Eye, EyeOff, GraduationCap, Home as HomeIcon, Info, LogOut, Octagon, Printer, ShoppingBag, Terminal, User, Users, Wallet, X, Zap } from "lucide-react";
import { classify } from "@/lib/classify";
import { latestBalance, normalize } from "@/lib/csv";
import { DEMO_FILES, DEMO_PROFILE } from "@/lib/demo";
import { computeNumber, type Alert, type Line, type NumberResult } from "@/lib/number";
import { federalEstimate, formatUSD } from "@/lib/tax";
import { ASSUMPTIONS, SOURCES, TAX_2026 } from "@/lib/taxConfig";
import type { Profile, Txn } from "@/lib/types";
import { Connect, Landing, Logo, Pricing, SignUp, type Account } from "./Onboarding";

type Tab = "home" | "alerts" | "money" | "learn";
type Stage = "landing" | "signup" | "pricing" | "connect" | "app";
type Why = { title: string; body: string; txns?: Txn[] };
type LogLine = { id: string; time: string; text: string; tone: "in" | "out" | "sys" | "warn" };

const dayNum = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;
const PLAN_NAME: Record<string, string> = { free: "Starter", season: "Season Pass", family: "Family Pass" };
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
  const [parent, setParent] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [why, setWhy] = useState<Why | null>(null);
  const [toast, setToast] = useState<Alert | null>(null);
  const [events, setEvents] = useState<LogLine[]>([]);
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
    setProfile({ ...DEMO_PROFILE, ownerName: account?.name || "You", businessName: account ? `${account.name}'s ${account.business.toLowerCase()}` : "Your business", age: 0, parentRule: undefined, balances: data.balances, bills: [], asOf: new Date().toISOString().slice(0, 10) });
    setTxns(data.txns); enter("Your bank via Plaid");
  }

  function setKind(id: string, kind: "business_income" | "personal" | "business_expense") {
    setTxns((ts) => ts!.map((t) => t.id === id ? { ...t, kind, userSet: true, category: kind === "personal" ? "Personal" : kind === "business_income" ? "Customer payment" : "Business expense", reason: "You told us." } : t));
  }

  function notify(a: Alert) { setToast(a); window.setTimeout(() => setToast(null), 6500); }
  const clock = () => new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

  function simulate(kind: "job" | "spend") {
    if (!txns || !result) return;
    const id = `sim-${Date.now()}`;
    if (kind === "job") {
      const amt = 35000;
      const extra = federalEstimate(result.netProfitCents + amt).totalTaxCents - federalEstimate(result.netProfitCents).totalTaxCents;
      setTxns([...txns, classify({ id, date: profile.asOf, source: "Cash App", description: "house wash", counterparty: "New customer", amountCents: amt })]);
      setProfile((p) => ({ ...p, balances: p.balances.map((b, i) => i === 0 ? { ...b, balanceCents: b.balanceCents + amt } : b) }));
      setEvents((e) => [{ id, time: clock(), tone: "in" as const, text: `+${formatUSD(amt, { cents: true })} cash app · house wash → business · ${formatUSD(extra)} to IRS jar` }, ...e].slice(0, 6));
      notify({ id, level: "info", title: `+${formatUSD(amt)} from a new customer`, body: `${formatUSD(extra)} of it goes in your IRS jar. The other ${formatUSD(amt - extra)} is yours (after your jars are full).` });
    } else {
      const amt = 18000;
      const short = result.theNumberCents - (result.balanceCents - amt);
      setTxns([...txns, classify({ id, date: profile.asOf, source: "Chase", description: "NIKE.COM", counterparty: "NIKE.COM", amountCents: -amt })]);
      setProfile((p) => ({ ...p, balances: p.balances.map((b, i) => i === 0 ? { ...b, balanceCents: b.balanceCents - amt } : b) }));
      setEvents((e) => [{ id, time: clock(), tone: "warn" as const, text: `−${formatUSD(amt, { cents: true })} chase · NIKE.COM → personal · now ${formatUSD(short)} short` }, ...e].slice(0, 6));
      notify({ id, level: "critical", title: `${formatUSD(amt)} at Nike.com`, body: `That came out of your IRS jar. You're now ${formatUSD(short)} short of your Number.` });
    }
  }

  function signOut() { saveAccount(null); setAccount(null); setTxns(null); setStage("landing"); }

  if (stage === "landing") return <Landing onStart={() => setStage(account ? (account.plan ? "connect" : "pricing") : "signup")} onSignIn={() => setStage(account ? "connect" : "signup")} onDemo={loadSampleBank} busy={busy === "bank"} />;
  if (stage === "signup") return <SignUp onBack={() => setStage("landing")} onDone={(a) => { setAccount(a); saveAccount(a); setStage("pricing"); }} />;
  if (stage === "pricing") return <Pricing name={account?.name || "friend"} onBack={() => setStage("landing")} onPick={(plan) => { const a = { ...(account as Account), plan }; setAccount(a); saveAccount(a); setStage("connect"); }} />;
  if (stage === "connect" || !txns || !result) return <Connect name={account?.name || ""} onBack={() => setStage("landing")} onSample={loadSampleBank} onFiles={onFiles} onPlaid={onPlaid} busy={busy} error={error} />;

  const byId = new Map(txns.map((t) => [t.id, t]));
  const openLine = (l: Line) => setWhy({ title: l.label, body: l.why, txns: l.txnIds?.map((i) => byId.get(i)!).filter(Boolean).slice(-6) });
  const name = profile.ownerName === "You" ? "" : profile.ownerName;
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
            <div className="muted mt-1 text-xs">{profile.businessName}{profile.age ? ` · ${profile.age}` : ""}</div>
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
          <Toggle on={parent} onChange={setParent} label="Parent view" icon={Users} />
          <Toggle on={privacy} onChange={setPrivacy} label="Privacy" icon={privacy ? EyeOff : Eye} />
          {account && <span className="chip hidden text-zinc-300 md:inline-flex">{PLAN_NAME[account.plan || "free"]}</span>}
          <button className="btn btn-ghost !p-2.5" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-4">
        {tab === "home" && <Home r={result} profile={profile} name={name} parent={parent} privacy={privacy} openLine={openLine} setWhy={setWhy} simulate={simulate} go={setTab} txns={txns} events={events} />}
        {tab === "alerts" && <Alerts r={result} go={setTab} />}
        {tab === "money" && <Money r={result} txns={txns} setKind={setKind} parent={parent} privacy={privacy} profile={profile} />}
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

      {why && <WhySheet {...why} privacy={privacy} onClose={() => setWhy(null)} />}
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

function Toggle({ on, onChange, label, icon: I }: { on: boolean; onChange: (v: boolean) => void; label: string; icon: typeof Eye }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${on ? "border-white bg-white text-black" : "border-zinc-800 text-zinc-300 hover:border-zinc-600"}`}>
      <I size={15} />{label}
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
  if (r.safeToSpendCents < 0) return { key: "red", title: "Hold off on spending", sub: `You're ${formatUSD(-r.safeToSpendCents)} short of your Number.`, color: "var(--red)" };
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

function Home({ r, profile, name, parent, privacy, openLine, setWhy, simulate, go, txns, events }: { r: NumberResult; profile: Profile; name: string; parent: boolean; privacy: boolean; openLine: (l: Line) => void; setWhy: (w: Why) => void; simulate: (k: "job" | "spend") => void; go: (t: Tab) => void; txns: Txn[]; events: LogLine[] }) {
  const s = status(r);
  const shown = useCountUp(r.theNumberCents);
  const series = useMemo(() => weekly(txns, r), [txns, r]);
  const j = jars(r);
  const top = r.alerts.find((a) => a.level !== "info") ?? r.alerts[0];
  return (
    <>
      {parent && <ParentWeek r={r} txns={txns} name={name || "Your kid"} />}

      <section className="grid gap-4 lg:grid-cols-3">
        {/* Hero: The Number + balance chart */}
        <div className="card hero-glow relative overflow-hidden p-6 sm:p-8 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-zinc-400"><span className="dot live-dot" style={{ background: "var(--green)" }} />{parent ? `${name || "Their"}'s Number` : name ? `Hey ${name}. Your Number` : "Your Number"}</div>
              <div className="font-display num mt-2 text-[clamp(3.5rem,9vw,5.75rem)] font-semibold leading-none tracking-tight">{formatUSD(shown)}</div>
              <p className="mt-3 max-w-md text-zinc-400">Never let your money drop below this. It's already spoken for.</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3">
              <div className="flex items-center gap-2 font-semibold"><span className="dot" style={{ background: s.color }} />{s.title}</div>
              <div className="muted mt-0.5 text-sm">{s.sub}</div>
            </div>
          </div>
          <BalanceChart data={series} number={r.theNumberCents} />
          <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4" style={{ borderColor: "var(--line)" }}>
            {[["You have", r.balanceCents], ["Safe to spend", Math.max(0, r.safeToSpendCents)], ["Profit in 2026", r.netProfitCents]].map(([l, v]) => (
              <div key={l as string}><div className="muted text-xs">{l as string}</div><div className="font-display num mt-0.5 text-xl font-semibold sm:text-2xl">{formatUSD(v as number)}</div></div>
            ))}
          </div>
        </div>

        {/* Rings */}
        <div className="card p-6">
          <Label>Where your {formatUSD(r.balanceCents)} belongs</Label>
          <div className="mt-5 flex justify-center"><Rings j={j} /></div>
          <ul className="mt-5 space-y-2 text-sm">
            {[
              ["IRS jar", j.irsHave, j.irsNeed, "#ffffff", `This is money the IRS will ask for: ${formatUSD(r.fed.se.totalCents)} self-employment tax + ${formatUSD(r.fed.incomeTaxCents)} income tax${r.taxPaidCents ? `, minus ${formatUSD(r.taxPaidCents)} you already paid` : ""}. Your money fills this jar first.`],
              ["Business jar", j.bizHave, j.bizNeed, "#9a9a9e", `One month of business costs (${formatUSD(r.cushionCents)}) plus bills due soon (${formatUSD(r.billsCents)}). This keeps a slow month or a broken pump from sinking you.`],
              ["Yours", j.yours, 0, "#4a4a4f", `Whatever is left after the IRS jar and the business jar are full. ${j.yours === 0 ? "Right now that's $0, so fill the other jars first." : `Right now you can spend or reinvest ${formatUSD(j.yours)}.`}`],
            ].map(([l, have, need, c, w]) => (
              <li key={l as string}>
                <button className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-white/5" onClick={() => setWhy({ title: l as string, body: w as string })}>
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c as string }} />{l as string}</span>
                  <span className="num"><b>{formatUSD(have as number)}</b>{(need as number) > 0 && <span className="muted"> / {formatUSD(need as number)}</span>}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t pt-4">
            <div className="flex justify-between text-sm"><span className="muted">Toward your Number</span><span className="num font-semibold">{Math.min(100, Math.round((Math.max(0, r.balanceCents) / Math.max(1, r.theNumberCents)) * 100))}%</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${Math.min(100, (Math.max(0, r.balanceCents) / Math.max(1, r.theNumberCents)) * 100)}%` }} /></div>
            <p className="muted mt-2 text-xs">{r.safeToSpendCents < 0 ? `${formatUSD(-r.safeToSpendCents)} more and every jar is full.` : `Every jar is full. ${formatUSD(r.safeToSpendCents)} is yours.`}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ActivityLog txns={txns} events={events} privacy={privacy} />
        <WeekBars data={series.slice(-12)} />
        <div className="card flex flex-col p-6">
          <Label icon={CalendarClock}>Next IRS payment</Label>
          <div className="font-display num mt-4 text-5xl font-semibold">{formatUSD(r.owedSoFarCents)}</div>
          <div className="mt-1 text-sm text-zinc-400">Due <b className="text-white">{new Date(r.next.due + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b> · {r.next.daysLeft} days</div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white" style={{ width: `${Math.max(4, Math.min(100, 100 - (r.next.daysLeft / 92) * 100))}%` }} /></div>
          <p className="mt-4 text-sm text-zinc-400">Save <b className="text-white">{formatUSD(r.saveThisMonthCents)}/month</b> and you're covered.{r.missed.length > 0 && <> <span className="text-white"><span className="dot mr-1.5" style={{ background: "var(--red)" }} />{r.missed.length} earlier payment{r.missed.length > 1 ? "s" : ""} missed.</span></>}</p>
          <button className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-medium text-zinc-300 hover:text-white" onClick={() => go("learn")}>Why do I pay during the year? <ArrowRight size={14} /></button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {profile.parentRule ? (
          <button onClick={() => setWhy({ title: "Myth: “under the limit means you owe nothing”", body: `Being under the ${formatUSD(TAX_2026.standardDeductionCents)} standard deduction means $0 federal income tax, and that part is true for you. But self-employment tax is separate. It's Social Security + Medicare for people who work for themselves, and it starts once you net $400, at any age. On ${formatUSD(r.netProfitCents)} of profit that's ${formatUSD(r.fed.se.totalCents)}. Most young owners (and their parents) don't know this until the bill shows up.` })}
            className="card card-hover flex flex-col items-start justify-start p-6 text-left lg:col-span-1">
            <Label icon={AlertTriangle}>Myth buster</Label>
            <div className="font-display mt-3 text-2xl font-semibold leading-snug"><span className="text-zinc-500 line-through decoration-white/60">{profile.parentRule.label}</span></div>
            <p className="mt-3 text-sm text-zinc-400">You owe {formatUSD(r.fed.incomeTaxCents)} income tax, but <b className="text-white">{formatUSD(r.fed.se.totalCents)} self-employment tax</b>.</p>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium">See why <ArrowUpRight size={14} /></span>
          </button>
        ) : top && (
          <button onClick={() => go("alerts")} className="card card-hover p-6 text-left">
            <Label icon={Bell}>Top alert</Label>
            <div className="mt-3 font-semibold">{top.title}</div>
            <div className="muted mt-1 text-sm">{top.body}</div>
          </button>
        )}

        <div className="card p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3"><h2 className="font-display text-xl font-semibold">How we got {formatUSD(r.theNumberCents)}</h2><span className="muted text-xs">tap any line</span></div>
          <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
            {r.lines.map((l) => (
              <li key={l.key} style={{ borderColor: "var(--line)" }}><button className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-white" onClick={() => openLine(l)}><span className="flex items-center gap-2 text-zinc-300">{l.label}<Info size={13} className="text-zinc-600" /></span><span className="num font-semibold">{formatUSD(l.amountCents)}</span></button></li>
            ))}
            <li className="flex items-center justify-between pt-3 font-semibold" style={{ borderColor: "var(--line-2)" }}><span>Your Number</span><span className="num text-lg">{formatUSD(r.theNumberCents)}</span></li>
          </ul>
        </div>
      </section>

      {!parent && (
        <section className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-display flex items-center gap-2 text-xl font-semibold"><Zap size={18} />Try it live</h2><p className="muted text-sm">Watch the Number react the moment money moves.</p></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn btn-primary" onClick={() => simulate("job")}><Briefcase size={16} />New job paid: $350</button>
            <button className="btn btn-ghost" onClick={() => simulate("spend")}><ShoppingBag size={16} />Buy $180 sneakers</button>
          </div>
        </section>
      )}
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
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500"><span>Your balance, last 16 weeks</span><span className="flex items-center gap-3"><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-white" />Balance</span><span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-zinc-400" />Your Number</span></span></div>
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
    { r: 78, pct: j.irsNeed ? j.irsHave / j.irsNeed : 1, c: "#ffffff" },
    { r: 60, pct: j.bizNeed ? j.bizHave / j.bizNeed : 1, c: "#9a9a9e" },
    { r: 42, pct: j.yours > 0 ? 1 : 0, c: "#4a4a4f" },
  ];
  const irsPct = Math.round(rings[0].pct * 100);
  return (
    <svg viewBox="0 0 180 180" className="h-48 w-48" role="img" aria-label={`IRS jar ${irsPct}% full`}>
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
      <text x="90" y="106" textAnchor="middle" fontSize="10" fill="#8b8b91" fontFamily="Geist, sans-serif">IRS jar full</text>
    </svg>
  );
}

function ActivityLog({ txns, events, privacy }: { txns: Txn[]; events: LogLine[]; privacy: boolean }) {
  const kindWord: Record<Txn["kind"], string> = { business_income: "business", business_expense: "biz cost", personal: "personal", transfer: "transfer", tax_payment: "irs", review: "needs answer" };
  const recent: LogLine[] = [...txns].filter((t) => !t.id.startsWith("sim-")).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 7).map((t) => ({
    id: t.id, time: t.date.slice(5).replace("-", "/"), tone: t.kind === "review" ? "warn" : t.amountCents > 0 ? "in" : "out",
    text: `${t.amountCents > 0 ? "+" : "−"}${formatUSD(Math.abs(t.amountCents), { cents: true })} ${t.source.toLowerCase()} · ${privacy ? (t.kind === "business_income" ? "customer" : "•••") : (t.description || "no note").toLowerCase().slice(0, 22)} → ${kindWord[t.kind]}`,
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

function ParentWeek({ r, txns, name }: { r: NumberResult; txns: Txn[]; name: string }) {
  const end = dayNum(r.asOf), start = end - 6;
  const wk = txns.filter((t) => dayNum(t.date) >= start && dayNum(t.date) <= end);
  const earned = wk.filter((t) => t.kind === "business_income" || (t.kind === "review" && t.amountCents > 0)).reduce((s, t) => s + t.amountCents, 0);
  const costs = wk.filter((t) => t.kind === "business_expense").reduce((s, t) => s - t.amountCents, 0);
  const setAside = federalEstimate(r.netProfitCents).totalTaxCents - federalEstimate(r.netProfitCents - earned + costs).totalTaxCents;
  const s = status(r);
  return (
    <section className="card border-white/30 p-6">
      <Label icon={User}>Parent weekly summary · read-only</Label>
      <div className="font-display mt-2 flex items-center gap-2 text-2xl font-semibold"><span className="dot" style={{ background: s.color }} />{name} this week: {s.title}</div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[["Earned", earned], ["Business costs", costs], ["Should set aside", setAside]].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl border border-zinc-800 bg-black/40 p-4"><div className="muted text-xs">{l as string}</div><div className="font-display num mt-1 text-2xl font-semibold">{formatUSD(v as number)}</div></div>
        ))}
      </div>
      <p className="muted mt-4 text-sm">No spreadsheet needed. You'll get a text if {name} drops below their Number or a tax date is coming up.</p>
    </section>
  );
}

/* ---------- Alerts ---------- */

function Alerts({ r, go }: { r: NumberResult; go: (t: Tab) => void }) {
  const color = { critical: "var(--red)", warning: "var(--amber)", info: "#ffffff" };
  const Icon = { critical: Octagon, warning: AlertTriangle, info: Bell };
  const action = (id: string): [string, Tab] | null => id === "review" ? ["Sort them now", "money"] : id === "missed" || id === "next" ? ["How estimated taxes work", "learn"] : id === "below" ? ["See my jars", "home"] : id === "rule" ? ["Why it's wrong", "learn"] : null;
  return (
    <section className="mx-auto max-w-3xl space-y-3">
      <h1 className="font-display text-4xl font-semibold">Alerts</h1>
      <p className="muted text-sm">These get texted to you and your parent. Here's what they'd say right now.</p>
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
    </section>
  );
}

/* ---------- Money ---------- */

const KIND_LABEL: Record<Txn["kind"], [string, string]> = {
  business_income: ["Business income", "var(--green)"],
  business_expense: ["Business cost", "#a1a1aa"],
  personal: ["Personal", "#52525b"],
  transfer: ["Transfer", "#52525b"],
  tax_payment: ["Tax payment", "#ffffff"],
  review: ["Needs answer", "var(--amber)"],
};

function TxnRow({ t, privacy, children }: { t: Txn; privacy?: boolean; children?: React.ReactNode }) {
  const [label, color] = KIND_LABEL[t.kind];
  const title = privacy ? (t.kind === "business_income" ? "Customer payment" : t.category || label) : t.description || "(no note)";
  const who = privacy ? "" : t.counterparty && t.counterparty !== t.description ? t.counterparty : "";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3" style={{ borderColor: "var(--line)" }}>
      <div className="min-w-0">
        <div className="truncate font-medium">{title}{who && <span className="muted text-sm"> · {who}</span>}</div>
        <div className="muted mt-0.5 flex items-center gap-1.5 text-xs">{t.date} · {t.source} · <span className="dot !h-1.5 !w-1.5" style={{ background: color }} />{label}</div>
      </div>
      <div className="flex items-center gap-3">
        {children}
        <div className={`num font-semibold ${t.amountCents > 0 ? "text-white" : "text-zinc-400"}`}>{t.amountCents > 0 ? "+" : ""}{formatUSD(t.amountCents, { cents: true })}</div>
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
      <h1 className="font-display text-4xl font-semibold">Money</h1>
      <section className="grid gap-4 lg:grid-cols-5">
        <div className="card hero-glow p-6 lg:col-span-2">
          <h2 className="font-display text-xl font-semibold">Business or personal?</h2>
          {current ? (
            <div className="mt-4 rounded-3xl border border-zinc-800 bg-black/40 p-6 text-center">
              <div className="muted text-xs">{review.length} left · {current.date} · {current.source}</div>
              <div className="font-display num mt-2 text-5xl font-semibold">{current.amountCents > 0 ? "+" : ""}{formatUSD(current.amountCents, { cents: true })}</div>
              <div className="mt-2 text-zinc-300">{privacy ? "Payment" : `${current.description || "(no note)"}${current.counterparty && current.counterparty !== current.description ? ` · ${current.counterparty}` : ""}`}</div>
              {!parent ? (
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button className="btn btn-primary" onClick={() => setKind(current.id, current.amountCents > 0 ? "business_income" : "business_expense")}><Briefcase size={16} />Business</button>
                  <button className="btn btn-ghost" onClick={() => setKind(current.id, "personal")}><User size={16} />Personal</button>
                </div>
              ) : <p className="muted mt-4 text-sm">Your kid answers these.</p>}
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
        <ul className="mt-2 divide-y">{list.slice(0, 100).map((t) => <TxnRow key={t.id} t={t} privacy={privacy} />)}</ul>
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
        {([["Business", profile.businessName], ["Gross income", formatUSD(r.incomeCents, { cents: true })], ["Business expenses", formatUSD(r.expensesCents, { cents: true })], ["Net profit", formatUSD(r.netProfitCents, { cents: true })], ["Self-employment tax (est.)", formatUSD(r.fed.se.totalCents, { cents: true })], ["Income tax (est.)", formatUSD(r.fed.incomeTaxCents, { cents: true })], ["Estimated payments made", formatUSD(r.taxPaidCents, { cents: true })], ["Unsorted items", String(r.reviewCount)]] as [string, string][]).map(([k, v]) => (
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

function WhySheet({ title, body, txns, privacy, onClose }: Why & { privacy: boolean; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="toast relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-zinc-800 bg-[#0b0b0b] p-7 sm:m-4 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <button className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-zinc-800 text-zinc-400 hover:text-white" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <Label>Why?</Label>
        <h3 className="font-display mt-2 pr-10 text-2xl font-semibold">{title}</h3>
        <p className="mt-3 leading-relaxed text-zinc-300">{body}</p>
        {txns && txns.length > 0 && (<><div className="muted mt-5 text-xs font-medium uppercase tracking-wider">From these transactions (latest)</div><ul className="divide-y">{txns.map((t) => <TxnRow key={t.id} t={t} privacy={privacy} />)}</ul></>)}
        <button className="btn btn-primary mt-6 w-full" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
