"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Moon, Sun, Landmark, Lock, ShieldCheck, Sparkles } from "lucide-react";
import type { Profile, Txn } from "@/lib/types";
import { PlaidButton } from "./PlaidButton";

export function Logo({ size = 40 }: { size?: number }) {
  // Engraved, slanted pound sign on a black tile with a fine metallic edge.
  const id = `lg-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".9" /><stop offset=".45" stopColor="#ffffff" stopOpacity=".15" /><stop offset="1" stopColor="#ffffff" stopOpacity=".55" /></linearGradient>
        <linearGradient id={`${id}-ink`} gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="38"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#a1a1aa" /></linearGradient>
        <radialGradient id={`${id}-glow`} cx=".3" cy=".2" r=".9"><stop offset="0" stopColor="#2a2a2e" /><stop offset="1" stopColor="#050505" /></radialGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="13" fill={`url(#${id}-glow)`} stroke={`url(#${id}-edge)`} strokeWidth="1.2" />
      <g stroke={`url(#${id}-ink)`} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M20.5 12.5 L16.5 35.5" />
        <path d="M31.5 12.5 L27.5 35.5" />
        <path d="M13 19.5 H36" />
        <path d="M11.5 28.5 H34.5" />
      </g>
    </svg>
  );
}

export function Wordmark({ size = 36 }: { size?: number }) {
  return (
    <span className="flex items-center gap-3">
      <Logo size={size} />
      <span className="font-display text-[1.05rem] font-medium tracking-[-0.01em]">The <span className="font-semibold">Number</span></span>
    </span>
  );
}

export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(document.documentElement.dataset.theme === "light"); }, []);
  const flip = () => {
    const next = !light; setLight(next);
    document.documentElement.dataset.theme = next ? "light" : "dark";
    try { localStorage.setItem("the-number:theme", next ? "light" : "dark"); } catch { /* fine */ }
  };
  return (
    <button onClick={flip} className="btn btn-ghost !p-2.5" aria-label={light ? "Switch to dark mode" : "Switch to light mode"} title={light ? "Dark mode" : "Light mode"}>
      {light ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}

const pad = { paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" };

/* ---------------- Landing ---------------- */

export function Landing({ onStart, onDemo, onSignIn, busy }: { onStart: () => void; onDemo: () => void; onSignIn: () => void; busy?: boolean }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between py-5" style={pad}>
        <Wordmark size={36} />
        <div className="flex items-center gap-3"><ThemeToggle /><button className="text-sm font-medium text-zinc-300 hover:text-white" onClick={onSignIn}>Sign in</button></div>
      </header>

      <main className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 pb-[34vh] pt-[7vh] text-center">
        <span className="chip rise mb-6 uppercase tracking-[0.14em] text-zinc-300">For first-time business owners</span>
        <h1 className="headline font-display rise text-[clamp(2.4rem,6vw,4.5rem)] font-semibold leading-[1]" style={{ textWrap: "balance" as never }}>Know how much you owe.</h1>
        <p className="rise mt-5 max-w-2xl text-[clamp(1.2rem,2.4vw,1.6rem)] font-medium leading-snug text-white" style={{ textWrap: "balance" as never }}>
          See exactly what you owe the IRS, and when. Built for first-time business owners.
        </p>
        <div className="rise mt-9 w-full max-w-2xl rounded-[28px] border border-white/15 bg-white/[0.04] px-6 py-6 backdrop-blur sm:px-8">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-6 sm:text-left">
            <div className="font-display num shrink-0 text-[clamp(3.5rem,9vw,5.5rem)] font-semibold leading-none">15.7M</div>
            <div>
              <div className="text-lg font-semibold leading-snug">IRS penalties last year for unpaid quarterly taxes.</div>
              <div className="muted mt-1 text-sm">This year a record <b className="text-white">4.9 million</b> Americans started a business, and with <b className="text-white">1 in 3</b> owners not even knowing they owe the IRS every quarter, that's <b className="text-white">1.6 million</b> new owners headed for a bill they never saw coming.</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 sm:text-left">
            <a className="underline-offset-2 hover:underline" href="https://galek.tax/insights/data-analysis/irs-penalty-trends" target="_blank" rel="noreferrer">IRS Data Book FY2025</a>
            <a className="underline-offset-2 hover:underline" href="https://sbecouncil.org/2026/10/31/americas-entrepreneurship-surge-continues-nearly-5-million-business-applications-filed-through-september/" target="_blank" rel="noreferrer">Source: U.S. Census Business Formation Statistics, Jan–Sep 2026</a>
            <a className="underline-offset-2 hover:underline" href="https://american.edu/media/news/20230418_CarolineBrucknerTaxLiteracySurvey.cfm" target="_blank" rel="noreferrer">American University Kogod, Small Business Tax Literacy Survey</a>
          </div>
        </div>
        <div className="rise mt-9 flex flex-col items-center gap-4">
          <button className="btn btn-primary min-w-[220px] !rounded-xl !py-3.5 text-base" onClick={onStart}>Get Started <ArrowRight size={16} /></button>
          <span className="text-xs text-zinc-500">Connects with your bank through Plaid, and with QuickBooks</span>
          <button className="text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline" onClick={onDemo} disabled={busy}>{busy ? "Loading a live example…" : "or see a live example first"}</button>
        </div>
      </main>
      <div className="horizon pointer-events-none" aria-hidden />
    </div>
  );
}

/* ---------------- Starfield (shared background) ---------------- */

export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    let raf = 0; const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() }));
    const draw = (t: number) => {
      const w = (c.width = c.offsetWidth * devicePixelRatio), h = (c.height = c.offsetHeight * devicePixelRatio);
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        const a = reduce ? 0.6 : 0.35 + 0.65 * Math.abs(Math.sin(st.p + t * 0.0006 * st.s));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.arc(st.x * w, st.y * h, st.r * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden />;
}

function Shell({ children, step, onBack }: { children: React.ReactNode; step: number; onBack?: () => void }) {
  return (
    <div className="relative min-h-screen bg-black" style={pad}>
      <Starfield />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[60vh]" style={{ background: "radial-gradient(60% 60% at 50% 0%, rgba(255,255,255,.08), transparent 70%)" }} />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between py-5">
        <button onClick={onBack}><Wordmark size={34} /></button>
        <div className="flex items-center gap-4"><ol className="flex items-center gap-2 text-xs font-medium text-zinc-500" aria-label="Setup progress">
          {["Account", "Plan", "Connect"].map((s, i) => (
            <li key={s} className="flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full border ${i < step ? "border-white bg-white text-black" : i === step ? "border-white text-white" : "border-zinc-700"}`}>{i < step ? <Check size={13} /> : i + 1}</span><span className={`hidden sm:inline ${i === step ? "text-white" : ""}`}>{s}</span>{i < 2 && <span className="mx-1 hidden h-px w-6 bg-zinc-700 sm:inline-block" />}</li>
          ))}
        </ol><ThemeToggle /></div>
      </header>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* ---------------- Sign up ---------------- */

export type Account = { name: string; email: string; business: string; plan?: string };

export function SignUp({ onDone, onBack }: { onDone: (a: Account) => void; onBack: () => void }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [business, setBusiness] = useState("Pressure washing");
  const [err, setErr] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErr("Add your first name so we know what to call you.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("That email doesn't look right. Check for a typo.");
    if (!business.trim()) return setErr("Tell us what your business does, in your own words.");
    onDone({ name: name.trim().split(" ")[0], email: email.trim(), business: business.trim() });
  };
  return (
    <Shell step={0} onBack={onBack}>
      <div className="mx-auto grid max-w-5xl items-center gap-12 py-10 lg:grid-cols-2">
        <div className="hidden lg:block">
          <h1 className="headline font-display text-6xl font-semibold leading-[0.98]">Your money,<br />finally explained.</h1>
          <ul className="mt-8 space-y-4 text-zinc-400">
            {[[Sparkles, "See your Number in under a minute"], [ShieldCheck, "Bank connection through Plaid. We never move money"], [Lock, "Parents can follow along, read-only"]].map(([I, t]) => {
              const Icon = I as typeof Sparkles;
              return <li key={t as string} className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full border border-zinc-800"><Icon size={16} /></span>{t as string}</li>;
            })}
          </ul>
        </div>
        <form onSubmit={submit} className="glass rise mx-auto w-full max-w-md p-7 sm:p-9" noValidate>
          <h2 className="font-display text-3xl font-semibold">Create your account</h2>
          <p className="mt-1 text-sm text-zinc-400">Takes 20 seconds. No card needed.</p>
          <button type="button" onClick={() => onDone({ name: "Jay", email: "jay@example.com", business: "Pressure washing" })} className="btn btn-ghost mt-6 w-full !rounded-xl">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"/><path fill="#bbb" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#888" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"/><path fill="#ddd" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6Z"/></svg>
            Continue with Google (demo)
          </button>
          <div className="my-6 flex items-center gap-3 text-xs text-zinc-500"><span className="h-px flex-1 bg-zinc-800" />or<span className="h-px flex-1 bg-zinc-800" /></div>
          <label className="block text-sm font-medium" htmlFor="su-name">First name</label>
          <input id="su-name" className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jay" autoComplete="given-name" />
          <label className="mt-4 block text-sm font-medium" htmlFor="su-email">Email</label>
          <input id="su-email" className="input mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" type="email" autoComplete="email" />
          <label className="mt-4 block text-sm font-medium" htmlFor="su-biz">What's your business?</label>
          <input id="su-biz" className="input mt-1.5" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Pressure washing, lawn care, reselling…" />
          {err && <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>{err}</p>}
          <button className="btn btn-primary mt-6 w-full !rounded-xl !py-3.5">Create account <ArrowRight size={16} /></button>
          <p className="mt-4 text-center text-xs text-zinc-500">Hackathon demo: nothing is saved. Reloading starts over.</p>
        </form>
      </div>
    </Shell>
  );
}

/* ---------------- Pricing (no subscriptions) ---------------- */

const FEATURES = ["What you owe the IRS, always up to date", "Connect your bank (Plaid) or QuickBooks", "Type in cash jobs and see your tax update", "Due-date and late-payment alerts", "Business-or-personal sorting", "Built for sole proprietors (Schedule C)", "CPA-ready export at tax time"];
const PLANS = [
  { id: "trial", name: "Free trial", blurb: "Try everything for 30 days.", price: "$0", unit: "30 days · no card needed", cta: "Start free trial", note: "Ends on its own. We never charge you automatically." },
  { id: "season", name: "Season Pass", blurb: "One payment covers the whole tax year.", price: "$120", unit: "one-time · per tax year", popular: true, cta: "Start now", note: "No auto-renew. If it doesn't save you more than it costs, next season is on us." },
];

export function Pricing({ onPick, onBack }: { name?: string; onPick: (plan: string) => void; onBack: () => void }) {
  return (
    <Shell step={1} onBack={onBack}>
      <div className="mx-auto max-w-4xl py-10 text-center">
        <span className="chip text-zinc-300">No subscriptions. Ever.</span>
        <h1 className="headline font-display mt-5 text-[clamp(2.4rem,6vw,4.25rem)] font-semibold leading-[1]">Pay once a tax year.</h1>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400">One price, everything included. Try it free first, or start now and you're covered from January to the April filing deadline.</p>
        <div className="mt-12 grid items-stretch gap-5 text-left md:grid-cols-2">
          {PLANS.map((p) => (
            <div key={p.id} className={`relative flex flex-col rounded-[28px] p-8 ${p.popular ? "border-2 border-white bg-[#101010] shadow-[0_0_80px_rgba(255,255,255,.12)]" : "glass"}`}>
              {p.popular && <span className="absolute -top-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black">★ Most popular</span>}
              <div className="text-center">
                <div className="font-display text-2xl font-semibold">{p.name}</div>
                <div className="mt-1 text-sm text-zinc-400">{p.blurb}</div>
                <div className="font-display num mt-6 text-6xl font-semibold">{p.price}</div>
                <div className="mt-1 text-xs text-zinc-400">{p.unit}</div>
              </div>
              <ul className="mt-7 space-y-3 text-sm">
                {FEATURES.map((f) => <li key={f} className="flex gap-3"><Check size={18} className="shrink-0" />{f}</li>)}
              </ul>
              <p className="muted mt-6 text-xs">{p.note}</p>
              <button className={`btn mt-auto w-full !rounded-xl !py-3.5 ${p.popular ? "btn-primary" : "btn-ghost"}`} style={{ marginTop: 24 }} onClick={() => onPick(p.id)}>{p.cta}</button>
            </div>
          ))}
        </div>
        <p className="mt-8 text-xs text-zinc-500">Hackathon demo: no payment is taken.</p>
      </div>
    </Shell>
  );
}

type Pick = { kind: "bank" | "qbo" | "app"; title: string; sub: string; options: { name: string; note: string }[]; preset?: string };

const BANKS = [
  { name: "Chase", note: "chase.com" }, { name: "Huntington", note: "huntington.com" }, { name: "Fifth Third", note: "53.com" },
  { name: "PNC", note: "pnc.com" }, { name: "Bank of America", note: "bankofamerica.com" }, { name: "Wells Fargo", note: "wellsfargo.com" },
];

/* A secure-connection window in The Number's own style (not a copy of any company's page). */
export function AppConnect({ app, onClose, onDone, standalone = false }: { app: string; onClose: () => void; onDone: (app: string) => void; standalone?: boolean }) {
  const [step, setStep] = useState<"consent" | "login" | "sync">("consent");
  const [user, setUser] = useState(""), [pass, setPass] = useState(""), [err, setErr] = useState("");
  const [done, setDone] = useState(0);
  const slug = app.toLowerCase().replace(/\s+/g, "");
  const initial = app === "Cash App" ? "$" : app[0];
  const tasks = [`Verifying your ${app} account`, `Reading 2026 payments`, "Sorting business from personal", "Working out what you owe"];
  useEffect(() => {
    if (step !== "sync") return;
    const t = window.setInterval(() => setDone((d) => d + 1), 650);
    return () => window.clearInterval(t);
  }, [step]);
  useEffect(() => { if (step === "sync" && done === tasks.length) { const t = window.setTimeout(() => onDone(app), 400); return () => window.clearTimeout(t); } }, [done, step, app, onDone, tasks.length]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && step !== "sync" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, step]);
  const login = (e: React.FormEvent) => { e.preventDefault(); if (!user.trim() || !pass) return setErr("Enter a username and password."); setUser(""); setPass(""); setStep("sync"); };
  return (
    <div className={standalone ? "grid min-h-screen place-items-center bg-black p-4" : "fixed inset-0 z-40 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"} role="dialog" aria-modal="true" aria-label={`Connect ${app}`}>
      <div className={`toast w-full max-w-[420px] overflow-hidden bg-[#0b0b0b] ${standalone ? "" : "rounded-2xl border border-zinc-700 shadow-[0_30px_120px_rgba(0,0,0,.8)]"}`}>
        {/* window chrome (only when shown inside the page; a real pop-up has the browser's own) */}
        {!standalone && <div className="flex items-center gap-3 border-b border-zinc-800 bg-[#111] px-4 py-2.5">
          <span className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-zinc-600" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-600" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-600" /></span>
          <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-md bg-black/60 px-3 py-1 text-[11px] text-zinc-400"><Lock size={11} />connect.the-number12.vercel.app/{slug}</span>
          <button className="text-xs text-zinc-500 hover:text-white" onClick={onClose} disabled={step === "sync"} aria-label="Close">✕</button>
        </div>}
        <div className="p-6">
          <div className="flex items-center justify-center gap-3">
            <Logo size={44} />
            <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full bg-zinc-500 ${step === "sync" ? "live-dot" : ""}`} style={{ animationDelay: `${i * 0.2}s` }} />)}</span>
            <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-zinc-600 bg-gradient-to-b from-zinc-800 to-black font-display text-xl font-bold">{initial}</span>
          </div>
          <div className="mt-2 text-center"><span className="chip text-[10px] text-zinc-400">{app} · Sandbox</span></div>

          {step === "consent" && (
            <>
              <h3 className="font-display mt-5 text-center text-xl font-semibold">The Number wants to connect to {app}</h3>
              <ul className="mt-5 space-y-3 text-sm">
                {[["See your payments", "Money in and out, this tax year"], ["Read only", "We can't send, move or request money"], ["Disconnect anytime", "From your account settings"]].map(([t, d]) => (
                  <li key={t} className="flex gap-3"><Check size={18} className="mt-0.5 shrink-0" /><span><span className="block font-medium">{t}</span><span className="muted text-xs">{d}</span></span></li>
                ))}
              </ul>
              <button className="btn btn-primary mt-6 w-full !rounded-xl !py-3" onClick={() => setStep("login")}>Continue</button>
              <button className="mt-2 w-full py-2 text-sm text-zinc-500 hover:text-white" onClick={onClose}>Cancel</button>
            </>
          )}

          {step === "login" && (
            <form onSubmit={login} autoComplete="off" noValidate>
              <h3 className="font-display mt-5 text-center text-xl font-semibold">Sign in to {app}</h3>
              <label className="mt-5 block text-sm font-medium" htmlFor="ap-user">Enter username</label>
              <input id="ap-user" className="input mt-1.5" value={user} onChange={(e) => { setUser(e.target.value); setErr(""); }} autoComplete="off" autoFocus />
              <label className="mt-4 block text-sm font-medium" htmlFor="ap-pass">Enter password</label>
              <input id="ap-pass" type="password" className="input mt-1.5" value={pass} onChange={(e) => { setPass(e.target.value); setErr(""); }} autoComplete="new-password" />
              {err && <p className="mt-2 text-sm text-zinc-400">{err}</p>}
              <button className="btn btn-primary mt-5 w-full !rounded-xl !py-3">Sign in</button>
            </form>
          )}

          {step === "sync" && (
            <>
              <h3 className="font-display mt-5 text-center text-xl font-semibold">{done >= tasks.length ? "Connected" : `Connecting ${app}…`}</h3>
              <ul className="mt-5 space-y-3 text-sm">
                {tasks.map((t, i) => (
                  <li key={t} className="flex items-center gap-3">
                    <span className={`grid h-6 w-6 place-items-center rounded-full border ${i < done ? "border-white bg-white text-black" : "border-zinc-700"}`}>{i < done ? <Check size={14} strokeWidth={3} /> : i === done ? <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" /> : null}</span>
                    <span className={i <= done ? "text-white" : "text-zinc-500"}>{t}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${(done / tasks.length) * 100}%` }} /></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PickSheet({ pick, onPick, onClose, busy }: { pick: Pick; onPick: (name: string) => void; onClose: () => void; busy: boolean }) {
  const [chosen, setChosen] = useState(pick.preset || "");
  const [user, setUser] = useState(""), [pass, setPass] = useState(""), [err, setErr] = useState("");
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, busy]);
  const brand = pick.kind === "bank" ? "Plaid" : pick.kind === "qbo" ? "QuickBooks" : pick.preset || "App";
  // Sandbox test login: anything typed goes through. Nothing typed here is stored or sent anywhere.
  const login = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.trim() || !pass) return setErr("Enter a username and password.");
    setUser(""); setPass(""); onPick(chosen);
  };
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center" role="dialog" aria-modal="true" aria-label={pick.title} onClick={() => !busy && onClose()}>
      <div className="toast w-full max-w-md rounded-t-[28px] border border-zinc-800 bg-[#0b0b0b] p-6 text-left sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><span className="chip text-zinc-300">{brand} · Sandbox</span><button className="text-sm text-zinc-500 hover:text-white" onClick={() => (chosen && !busy && !pick.preset ? setChosen("") : onClose())} disabled={busy}>{chosen && !busy && !pick.preset ? "Back" : "Close"}</button></div>
        {busy ? (
          <>
            <h3 className="font-display mt-4 text-2xl font-semibold">Connecting…</h3>
            <p className="muted mt-1 text-sm">{brand} is pulling your business transactions from {chosen || "your bank"}. Read-only.</p>
            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/2 animate-pulse rounded-full bg-white" /></div>
          </>
        ) : chosen ? (
          <form onSubmit={login} autoComplete="off" noValidate>
            <h3 className="font-display mt-4 text-2xl font-semibold">Sign in · {chosen}</h3>
            <label className="mt-5 block text-sm font-medium" htmlFor="sb-user">Enter username</label>
            <input id="sb-user" className="input mt-1.5" value={user} onChange={(e) => { setUser(e.target.value); setErr(""); }} autoComplete="off" />
            <label className="mt-4 block text-sm font-medium" htmlFor="sb-pass">Enter password</label>
            <input id="sb-pass" type="password" className="input mt-1.5" value={pass} onChange={(e) => { setPass(e.target.value); setErr(""); }} autoComplete="new-password" />
            {err && <p className="mt-2 text-sm text-zinc-400">{err}</p>}
            <button className="btn btn-primary mt-5 w-full !rounded-xl !py-3.5">Sign in and connect</button>
          </form>
        ) : (
          <>
            <h3 className="font-display mt-4 text-2xl font-semibold">{pick.title}</h3>
            <p className="muted mt-1 text-sm">{pick.sub}</p>
            <ul className="mt-5 grid gap-2">
              {pick.options.map((o) => (
                <li key={o.name}><button className="flex w-full items-center justify-between rounded-2xl border border-zinc-800 px-4 py-3.5 text-left hover:border-zinc-500" onClick={() => setChosen(o.name)}>
                  <span><span className="block font-medium">{o.name}</span><span className="muted block text-xs">{o.note}</span></span><ArrowRight size={16} className="text-zinc-500" />
                </button></li>
              ))}
            </ul>
            <p className="mt-5 text-[11px] text-zinc-500">Sandbox mode: {brand} connects a test account for the bank you pick.</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Connect ---------------- */

export function Connect({ onPlaidSandbox, onQuickBooksSandbox, onPlaid, busy, error, onBack }: { onPlaidSandbox: (bank: string) => void; onQuickBooksSandbox: (company: string) => void; onPlaid: (d: { txns: Txn[]; balances: Profile["balances"] }) => void; busy: string; error: string; onBack: () => void }) {
  const [pick, setPick] = useState<Pick | null>(null);
  // The pop-up window tells us when the app is connected.
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === "tn-connected") onPlaidSandbox(String(e.data.app)); };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [onPlaidSandbox]);
  const live = process.env.NEXT_PUBLIC_PLAID_ENV === "production";
  return (
    <Shell step={2} onBack={onBack}>
      <div className="mx-auto max-w-3xl py-12 text-center">
        <span className="chip text-zinc-300">Last step</span>
        <h1 className="headline font-display mt-5 text-[clamp(2.4rem,6vw,4.25rem)] font-semibold leading-[1]">Connect your business.</h1>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400">We read your income and business costs and show what you owe the IRS. Read-only.</p>
        <div className="glass mx-auto mt-10 grid max-w-xl gap-6 p-6 text-left sm:p-8">
          <div>
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-black"><Landmark size={22} /></span>
              <div><div className="font-semibold">Your bank</div><div className="text-sm text-zinc-400">Chase, Huntington, Fifth Third and 12,000+ more, via Plaid</div></div>
            </div>
            <div className="mt-4">{live ? <PlaidButton onData={onPlaid} /> : <PlaidButton onSandbox={onPlaidSandbox} />}</div>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500"><span className="h-px flex-1 bg-zinc-800" />or<span className="h-px flex-1 bg-zinc-800" /></div>
          <div>
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-zinc-700 font-display text-lg font-bold">qb</span>
              <div><div className="font-semibold">QuickBooks</div><div className="text-sm text-zinc-400">Already use QuickBooks? Connect it in one tap.</div></div>
            </div>
            <div className="mt-4"><PlaidButton onSandbox={onQuickBooksSandbox} label="Connect QuickBooks" primary={false} /></div>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500"><span className="h-px flex-1 bg-zinc-800" />payment apps<span className="h-px flex-1 bg-zinc-800" /></div>
          <div className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3">
            <div className="font-display num shrink-0 text-4xl font-semibold text-white">74%</div>
            <div className="text-sm leading-snug text-zinc-300">of freelancers and app sellers don't know when Venmo, Cash App and PayPal report their income to the IRS. <a className="text-[11px] text-zinc-500 underline" href="https://finance.yahoo.com/news/gig-workers-may-unprepared-2025-123000859.html" target="_blank" rel="noreferrer">Avalara survey</a></div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["Venmo", "Cash App", "PayPal", "Stripe"] as const).map((app) => (
              <button key={app} className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-800 px-2 py-4 text-sm font-medium hover:border-zinc-500" disabled={!!busy}
                onClick={() => {
                  const slug = app.toLowerCase().replace(/\s+/g, "");
                  const w = 460, h = 700, left = window.screenX + (window.outerWidth - w) / 2, top = window.screenY + (window.outerHeight - h) / 2;
                  const pop = window.open(`/connect/${slug}`, "tn-connect", `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
                  if (!pop) setPick({ kind: "app", title: app, sub: "", options: [], preset: app });
                }}>
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-zinc-700 font-display text-base font-bold">{app === "Venmo" ? "V" : app === "Cash App" ? "$" : app === "PayPal" ? "P" : "S"}</span>
                {app}
              </button>
            ))}
          </div>
          {!live && <p className="rounded-xl border border-zinc-800 px-3 py-2 text-center text-xs text-zinc-400">Sandbox test login: <b className="text-white">user_good</b> / <b className="text-white">pass_good</b></p>}
          {busy && <p className="text-center text-sm text-zinc-300">Pulling your transactions…</p>}
          {error && <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
        </div>
        <div className="mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5"><ShieldCheck size={14} /> Read-only</span>
          <span className="flex items-center gap-1.5"><Lock size={14} /> We never move money</span>
          <span className="flex items-center gap-1.5"><Check size={14} /> Disconnect anytime</span>
        </div>
      </div>
      {pick && pick.kind === "app" && <AppConnect app={pick.preset || "App"} onClose={() => setPick(null)} onDone={(n) => onPlaidSandbox(n)} />}
      {pick && pick.kind !== "app" && <PickSheet pick={pick} busy={!!busy} onClose={() => setPick(null)} onPick={(n) => (pick.kind === "qbo" ? onQuickBooksSandbox(n) : onPlaidSandbox(n))} />}
    </Shell>
  );
}
