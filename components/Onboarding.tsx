"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronRight, FileUp, Hash, Landmark, Lock, ShieldCheck, Sparkles } from "lucide-react";
import type { Profile, Txn } from "@/lib/types";
import { PlaidButton } from "./PlaidButton";

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <div className="grid place-items-center rounded-xl bg-white text-black" style={{ width: size, height: size }} aria-hidden>
      <Hash size={size * 0.55} strokeWidth={2.6} />
    </div>
  );
}

const pad = { paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" };

/* ---------------- Landing ---------------- */

export function Landing({ onStart, onDemo, onSignIn, busy }: { onStart: () => void; onDemo: () => void; onSignIn: () => void; busy?: boolean }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between py-5" style={pad}>
        <div className="flex items-center gap-3"><Logo size={36} /><span className="font-display text-lg font-semibold">The Number</span></div>
        <button className="text-sm font-medium text-zinc-300 hover:text-white" onClick={onSignIn}>Sign in</button>
      </header>

      <main className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-4 pb-[38vh] pt-[10vh] text-center">
        <button onClick={onDemo} className="chip rise mb-8 uppercase tracking-[0.14em] text-zinc-300 hover:text-white">
          For young business owners <ChevronRight size={14} />
        </button>
        <h1 className="headline font-display rise text-[clamp(3rem,9vw,7.25rem)] font-semibold leading-[0.95]" style={{ textWrap: "balance" as never }}>
          Know what's<br />actually yours.
        </h1>
        <p className="rise mt-7 max-w-2xl text-[clamp(1.05rem,2vw,1.35rem)] leading-relaxed text-zinc-400">
          The Number connects your bank, works out what you owe the IRS, and tells you the one number your money should never drop below, in plain English.
        </p>
        <div className="rise mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <button className="btn btn-primary min-w-[200px] !rounded-xl !py-3.5 text-base" onClick={onStart}>Get Started</button>
          <button className="btn btn-ghost !rounded-xl !py-3.5 text-base" onClick={onDemo} disabled={busy}>{busy ? "Connecting to the sample bank…" : "See a live demo"}</button>
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
        <button onClick={onBack} className="flex items-center gap-3"><Logo size={34} /><span className="font-display text-lg font-semibold">The Number</span></button>
        <ol className="flex items-center gap-2 text-xs font-medium text-zinc-500" aria-label="Setup progress">
          {["Account", "Plan", "Connect"].map((s, i) => (
            <li key={s} className="flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full border ${i < step ? "border-white bg-white text-black" : i === step ? "border-white text-white" : "border-zinc-700"}`}>{i < step ? <Check size={13} /> : i + 1}</span><span className={`hidden sm:inline ${i === step ? "text-white" : ""}`}>{s}</span>{i < 2 && <span className="mx-1 hidden h-px w-6 bg-zinc-700 sm:inline-block" />}</li>
          ))}
        </ol>
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
    onDone({ name: name.trim().split(" ")[0], email: email.trim(), business });
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
          <select id="su-biz" className="input mt-1.5" value={business} onChange={(e) => setBusiness(e.target.value)}>
            {["Pressure washing", "Lawn care", "Car detailing", "Reselling", "Streaming / content", "Tutoring", "Something else"].map((b) => <option key={b}>{b}</option>)}
          </select>
          {err && <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>{err}</p>}
          <button className="btn btn-primary mt-6 w-full !rounded-xl !py-3.5">Create account <ArrowRight size={16} /></button>
          <p className="mt-4 text-center text-xs text-zinc-500">Hackathon demo: your account stays on this device.</p>
        </form>
      </div>
    </Shell>
  );
}

/* ---------------- Pricing (no subscriptions) ---------------- */

const PLANS = [
  { id: "free", name: "Starter", blurb: "See where you stand.", price: "$0", unit: "forever", cta: "Start free", features: ["Your Number + money jars", "1 bank account", "Learn tab explainers", "Myth buster"] },
  { id: "season", name: "Season Pass", blurb: "Everything for one tax year.", price: "$49", unit: "one-time · per tax year", popular: true, cta: "Get Season Pass", features: ["Everything in Starter", "Text alerts before you dip below your Number", "Bank + Cash App + Venmo", "Business-or-personal sorting", "Parent view", "CPA-ready export at tax time"] },
  { id: "family", name: "Family Pass", blurb: "For siblings and a parent.", price: "$79", unit: "one-time · per tax year", cta: "Get Family Pass", features: ["Everything in Season Pass", "Up to 3 young business owners", "One parent dashboard for all of them", "Priority help from a CPA partner"] },
];

export function Pricing({ name, onPick, onBack }: { name: string; onPick: (plan: string) => void; onBack: () => void }) {
  return (
    <Shell step={1} onBack={onBack}>
      <div className="mx-auto max-w-6xl py-10 text-center">
        <span className="chip text-zinc-300">No subscriptions. Ever.</span>
        <h1 className="headline font-display mt-5 text-[clamp(2.4rem,6vw,4.25rem)] font-semibold leading-[1]">Pay once a tax year, {name}.</h1>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400">No auto-renew, no surprise charges. One payment covers you from January to the April filing deadline. If it doesn't save you more than it costs, next season is on us.</p>
        <div className="mt-12 grid items-end gap-5 text-left md:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.id} className={`relative rounded-[28px] p-7 ${p.popular ? "border-2 border-white bg-[#101010] shadow-[0_0_80px_rgba(255,255,255,.12)] md:-translate-y-4 md:py-10" : "glass"}`}>
              {p.popular && <span className="absolute -top-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black">★ Most popular</span>}
              <div className="text-center">
                <div className="font-display text-2xl font-semibold">{p.name}</div>
                <div className="mt-1 text-sm text-zinc-400">{p.blurb}</div>
                <div className="mt-6 flex items-baseline justify-center gap-1.5"><span className="font-display num text-6xl font-semibold">{p.price}</span></div>
                <div className="mt-1 text-xs text-zinc-400">{p.unit}</div>
              </div>
              <ul className="mt-7 space-y-3 text-sm">
                {p.features.map((f) => <li key={f} className="flex gap-3"><Check size={18} className="shrink-0" />{f}</li>)}
              </ul>
              <button className={`btn mt-8 w-full !rounded-xl !py-3.5 ${p.popular ? "btn-primary" : "btn-ghost"}`} onClick={() => onPick(p.id)}>{p.cta}</button>
            </div>
          ))}
        </div>
        <p className="mt-8 text-xs text-zinc-500">Hackathon demo: no payment is taken. Pricing shown is our proposed model.</p>
      </div>
    </Shell>
  );
}

/* ---------------- Connect ---------------- */

export function Connect({ name, onSample, onFiles, onPlaid, busy, error, onBack }: { name: string; onSample: () => void; onFiles: (f: FileList | null) => void; onPlaid: (d: { txns: Txn[]; balances: Profile["balances"] }) => void; busy: string; error: string; onBack: () => void }) {
  return (
    <Shell step={2} onBack={onBack}>
      <div className="mx-auto max-w-3xl py-12 text-center">
        {name && <span className="chip text-zinc-300">Last step, {name}</span>}
        <h1 className="headline font-display mt-5 text-[clamp(2.4rem,6vw,4.25rem)] font-semibold leading-[1]">Connect your money.</h1>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400">We read your transactions, sort business from personal, and work out your Number. Read-only. We can't move a cent.</p>
        <div className="glass mx-auto mt-10 max-w-xl p-6 text-left sm:p-8">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-black"><Landmark size={22} /></span>
            <div><div className="font-semibold">Connect your bank</div><div className="text-sm text-zinc-400">Chase, Huntington, Fifth Third and 12,000+ more, via Plaid</div></div>
          </div>
          <div className="mt-5"><PlaidButton onData={onPlaid} /></div>
          <div className="my-6 flex items-center gap-3 text-xs text-zinc-500"><span className="h-px flex-1 bg-zinc-800" />or<span className="h-px flex-1 bg-zinc-800" /></div>
          <button className="btn btn-ghost w-full !rounded-xl !py-3.5" onClick={onSample} disabled={!!busy}>{busy === "bank" ? "Connecting through Plaid…" : "Use a sample bank: Jay, 17, pressure washing"}</button>
          <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 text-sm text-zinc-400 hover:text-white">
            <FileUp size={16} /> Upload Chase / Cash App / Venmo CSVs (stays in your browser)
            <input type="file" accept=".csv,text/csv" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
          </label>
          {error && <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>{error}</p>}
        </div>
        <div className="mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5"><ShieldCheck size={14} /> Bank-level encryption via Plaid</span>
          <span className="flex items-center gap-1.5"><Lock size={14} /> Read-only access</span>
          <span className="flex items-center gap-1.5"><Check size={14} /> Disconnect anytime</span>
        </div>
      </div>
    </Shell>
  );
}
