"use client";

import ReviewProgress from "./ReviewProgress";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Cloud, FileCheck2, FileSpreadsheet, FolderOpen, Info, ListFilter, LockKeyhole, Plus, Search, Settings2, ShieldCheck, Upload, UserRound, X } from "lucide-react";
import AccountPanel from "@/components/AccountPanel";
import { useCloudWorkspace } from "@/lib/use-cloud-workspace";
import { calculateWorkspace, createEmptyWorkspace, createSampleWorkspace, RULE_VERSION } from "@/lib/engine";
import { MAX_AMOUNT_CENTS, exportLedgerCSV, findDuplicates, parseCSV, restoreWorkspace, serializeWorkspace } from "@/lib/workspace-io";
import { formatUSD, toCents } from "@/lib/tax";
import type { ExpenseCategory, LedgerRow, Treatment, Workspace, WorkspaceProfile, WorkspaceResult } from "@/lib/workspace-types";

type View = "overview" | "transactions" | "reports";
type ImportPreview = ReturnType<typeof parseCSV> & { name: string };
const TREATMENTS: Record<Treatment, string> = { review: "Needs review", income: "Business income", expense: "Business cost", personal: "Personal money", transfer: "Transfer", tax_payment: "Recorded tax payment", unsupported: "Needs specialist review" };
const CATEGORIES: Record<ExpenseCategory, string> = { supplies: "Supplies used in the business", advertising: "Advertising", fees: "Business processing fees", software: "Business software", other: "Other / not sure" };
const money = (n: number) => formatUSD(n, { cents: true });
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const uid = () => crypto.randomUUID();
const TEMPLATE = "date,description,amount,account,transaction_id\n";

function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Brand({ onClick }: { onClick?: () => void }) {
  return <button className="brand" onClick={onClick} aria-label="The Number home"><img className="brand-icon" src="/icon.svg" width="39" height="39" alt="" /><span>The Number<span className="brand-period">.</span></span></button>;
}

export default function WorkspaceApp() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [view, setView] = useState<View>("overview");
  const [settings, setSettings] = useState(false);
  const [editor, setEditor] = useState<LedgerRow | "new" | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "keep" | "skip">>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [exportedRevision, setExportedRevision] = useState<number | null>(null);
  const [privacy, setPrivacy] = useState(false);
  const csvInput = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const fileGeneration = useRef(0);
  const cloud = useCloudWorkspace(workspace, (opened) => {
    fileGeneration.current += 1;
    setWorkspace(opened); setExportedRevision(null); setView("transactions"); setSettings(false); setEditor(null); setPreview(null); setQuery(""); setFilter("all"); setError(""); setNotice("");
  }, () => {
    fileGeneration.current += 1;
    setWorkspace(null); setExportedRevision(null); setSettings(false); setEditor(null); setPreview(null); setQuery(""); setFilter("all"); setError(""); setNotice("");
  }, () => { fileGeneration.current += 1; });
  const result = useMemo(() => workspace ? calculateWorkspace(workspace) : null, [workspace]);
  const samplePreview = useMemo(() => {
    const sample = createSampleWorkspace();
    return calculateWorkspace({ ...sample, rows: sample.rows.map(row => row.id === "sample-gift" ? { ...row, treatment: "personal" as const, reviewed: true } : row) });
  }, []);
  const dirty = !!workspace && (workspace.rows.length > 0 || workspace.revision > 0) && exportedRevision !== workspace.revision && !cloud.savedCurrent;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => { if (workspace) { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); heading.current?.focus(); } }, [view, workspace?.id]);

  function start(mode: "sample" | "personal") {
    if (workspace && dirty && !window.confirm("Replace this workspace? Download a workspace backup first if you want to keep your changes.")) return;
    fileGeneration.current += 1;
    cloud.detach();
    setWorkspace(mode === "sample" ? createSampleWorkspace() : createEmptyWorkspace());
    setView(mode === "sample" ? "overview" : "transactions"); setSettings(false); setEditor(null); setPreview(null); setError(""); setNotice(""); setExportedRevision(null); setFilter("all");
  }

  function change(update: (current: Workspace) => Workspace): boolean {
    if (!workspace) return false;
    try {
      const next = { ...update(workspace), revision: workspace.revision + 1 };
      serializeWorkspace(next); // Every accepted workspace must remain valid and portable.
      fileGeneration.current += 1;
      setWorkspace(next); setError(""); return true;
    } catch (e) { setError(`Change not saved: ${(e as Error).message}`); return false; }
  }

  function navigate(next: View) { setView(next); setEditor(null); setPreview(null); setNotice(""); setError(""); }
  function goHome() {
    if (dirty && !window.confirm("Leave this workspace? Unsaved records will be cleared. Download a workspace backup to keep them.")) return;
    fileGeneration.current += 1;
    cloud.detach();
    setWorkspace(null); setSettings(false); setNotice(""); setError("");
  }
  function review() { navigate("transactions"); setFilter("review"); }
  function backup() {
    if (!workspace) return;
    try {
      download(serializeWorkspace(workspace), `the-number-workspace-${workspace.profile.taxYear}.json`, "application/json");
      setExportedRevision(workspace.revision); setNotice("Workspace download started. Keep this file to restore your records and decisions later.");
    } catch (e) { setError(`Backup not created: ${(e as Error).message}`); }
  }
  function beginImport() {
    if (workspace?.mode === "sample") {
      if (!window.confirm("Import your own records in a new personal workspace? This replaces the fictional sample. Personal tax estimates remain unavailable pending independent policy review.")) return;
      fileGeneration.current += 1;
      cloud.detach();
      setWorkspace(createEmptyWorkspace()); setExportedRevision(null); setView("transactions"); setEditor(null); setPreview(null); setSettings(false); setNotice(""); setFilter("all");
    }
    csvInput.current?.click();
  }
  function exportCSV() {
    if (!workspace) return;
    try {
      download(exportLedgerCSV(workspace), `the-number-${workspace.mode}-ledger-${workspace.profile.taxYear}.csv`, "text/csv");
      setNotice("Categorized ledger download started. Review flags and source records are included.");
    } catch (e) { setError(`Ledger not exported: ${(e as Error).message}`); }
  }
  async function importFile(file?: File) {
    if (!file) return;
    const generation = ++fileGeneration.current;
    setError(""); setNotice(""); setEditor(null);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a CSV smaller than 5 MB.");
      const contents = await file.text();
      if (generation !== fileGeneration.current) return;
      const parsed = parseCSV(contents, file.name);
      setPreview({ ...parsed, name: file.name }); setDecisions({});
    } catch (e) { if (generation === fileGeneration.current) setError((e as Error).message); }
  }
  async function restoreFile(file?: File) {
    if (!file) return;
    const generation = ++fileGeneration.current;
    setError("");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a workspace file smaller than 5 MB.");
      const contents = await file.text();
      if (generation !== fileGeneration.current) return;
      const restored = restoreWorkspace(contents);
      if (workspace?.rows.length && !window.confirm("Replace the current workspace with this file? Download a backup first if you need the current records.")) return;
      fileGeneration.current += 1;
      cloud.detach();
      setWorkspace(restored); setExportedRevision(restored.revision); setView("transactions"); setEditor(null); setPreview(null); setSettings(false); setFilter("all");
      setNotice("Records restored as a personal workspace. Personal tax estimates remain paused pending independent policy review.");
    } catch (e) { if (generation === fileGeneration.current) setError(`Workspace not restored: ${(e as Error).message}`); }
  }

  const duplicates = useMemo(() => workspace && preview ? findDuplicates(workspace.rows, preview.rows) : [], [workspace, preview]);
  const duplicateIds = [...new Set(duplicates.map(d => d.incomingId))];
  const alreadyImported = !!workspace && !!preview && workspace.imports.some(batch => batch.fingerprint === preview.fingerprint);

  function commitImport() {
    if (!workspace || !preview || preview.errors.length || alreadyImported || duplicateIds.some(id => !decisions[id])) return;
    if (workspace.mode === "sample") { setError("External records belong in a personal workspace. Start a personal workspace before importing."); return; }
    const batchId = `import-${preview.fingerprint}`;
    const used = new Set(workspace.rows.map(row => row.id));
    const rows = preview.rows.filter(row => decisions[row.id] !== "skip").map(row => {
      const id = used.has(row.id) ? uid() : row.id; used.add(id); return { ...row, id, batchId };
    });
    if (!rows.length) { setError("All incoming records were skipped. Nothing was imported."); return; }
    if (!change(w => ({ ...w, rows: [...w.rows, ...rows], imports: [...w.imports, { id: batchId, name: preview.name, fingerprint: preview.fingerprint }], profile: { ...w.profile, coverageComplete: false } }))) return;
    setNotice(`${rows.length} records imported. Review their business treatment, then confirm your date coverage.`); setPreview(null); setFilter("review");
  }

  function saveRow(row: LedgerRow) {
    const before = result;
    if (!workspace) return;
    const exists = workspace.rows.some(r => r.id === row.id);
    const next = { ...workspace, rows: exists ? workspace.rows.map(r => r.id === row.id ? row : r) : [...workspace.rows, row], profile: exists || workspace.mode === "sample" ? workspace.profile : { ...workspace.profile, coverageComplete: false }, revision: workspace.revision + 1 };
    try { serializeWorkspace(next); } catch (e) { setError(`Record not saved: ${(e as Error).message}`); return; }
    const after = calculateWorkspace(next);
    fileGeneration.current += 1;
    setWorkspace(next); setEditor(null);
    const delta = before?.status === "ready" && after.status === "ready" && before.remainingCents !== null && after.remainingCents !== null ? after.remainingCents - before.remainingCents : null;
    setNotice(`${exists ? "Record updated" : "Record added"}.${delta !== null ? ` Sample estimate ${delta >= 0 ? "increased" : "decreased"} by ${money(Math.abs(delta))}.` : " Your ledger and reports now use this decision."}`);
  }

  function removeRow(row: LedgerRow) {
    if (!window.confirm(`Remove “${row.description}” from this workspace? Download a backup first if you need to keep it. A saved account copy changes only when you save again.`)) return;
    if (!change(w => ({ ...w, rows: w.rows.filter(existing => existing.id !== row.id), profile: { ...w.profile, coverageComplete: false } }))) return;
    setEditor(null); setNotice("Record removed from this workspace. Check your coverage again. Save to account to update a saved copy.");
  }

  const inputFields = <><input className="visually-hidden" tabIndex={-1} ref={csvInput} type="file" accept=".csv,text/csv" aria-label="Choose supported CSV" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }} /><input className="visually-hidden" tabIndex={-1} ref={restoreInput} type="file" accept=".json,application/json" aria-label="Restore workspace file" onChange={e => { void restoreFile(e.target.files?.[0]); e.target.value = ""; }} /></>;

  if (!workspace || !result) return <div className="landing">{inputFields}
    <header className="landing-nav"><Brand /><div className="landing-links"><a href="#how-it-works">How it works</a><button onClick={() => setPrivacy(!privacy)}>Data & privacy</button><button className="button button-small button-quiet" onClick={() => start("sample")}>Explore sample <ArrowUpRight size={15} /></button><button className="button button-small button-secondary account-entry" onClick={() => cloud.setAccountOpen(!cloud.accountOpen)}>{cloud.session ? "My account" : "Sign in"}<UserRound size={15} /></button></div></header>
    <main>
      {cloud.accountOpen && <AccountPanel cloud={cloud} dirty={dirty} onClose={() => cloud.setAccountOpen(false)} />}
      <section className="landing-hero"><div className="hero-copy"><div className="eyebrow"><span className="status-dot" /> FOR YOUR FIRST BUSINESS</div><h1>First the records.<br /><span>Then the number.</span></h1><p className="hero-description">Make sense of what came in, what went out, and what belongs to your business. One clear view. Every dollar accounted for.</p><div className="hero-actions"><button className="button button-primary" onClick={() => start("personal")}>Review my records <ArrowRight size={18} /></button><button className="button button-secondary" onClick={() => start("sample")}>Try the sample business</button></div><div className="hero-footnote"><LockKeyhole size={15} /><span>Start locally. Sign in when you want to save. No bank passwords.</span></div><p className="availability-note">Personal bookkeeping is ready to explore. Tax calculations are illustrative and available only in the sample while independent policy review is pending.</p></div>
      <div className="hero-preview"><div className="preview-label"><span>THE VIEW AFTER REVIEW</span><span className="pill">Sample data</span></div><div className="preview-card"><div className="preview-card-top"><span className="small-label">AVERY’S DETAILING</span><span className="icon-check"><Check size={15} /></span></div><p className="preview-number-label">Illustrative federal estimate remaining</p><div className="preview-number">{samplePreview.remainingCents === null ? "Review complete" : money(samplePreview.remainingCents)}</div><p className="preview-number-note">After recorded sample payments · 2026</p><div className="preview-lines"><div><span>Reviewed business profit</span><b>{money(samplePreview.profitCents)}</b></div><div><span>Recorded tax payments</span><b>{money(samplePreview.paymentsCents)}</b></div></div><div className="preview-correction"><span className="icon-check"><CheckCheck size={17} /></span><div><strong>That gift isn’t business income.</strong><p>Reviewed. Corrected. Reflected everywhere.</p></div></div><button className="preview-link" onClick={() => start("sample")}>See the records behind the number <ArrowRight size={16} /></button></div><div className="preview-bottom"><span><span className="status-dot" /> Deterministic code. No AI tax calculations.</span><span>01 / 03</span></div></div></section>
      <section className="how-section" id="how-it-works"><div className="section-intro"><span className="eyebrow">A SMALLER, CLEARER WORKFLOW</span><h2>Less sorting later.<br />More clarity now.</h2><p>Start with a CSV or add a cash job. You make the decisions; the ledger keeps everything consistent.</p></div><div className="steps"><article><span className="step-number">01</span><FileSpreadsheet size={23} /><h3>Bring your records.</h3><p>Upload a supported CSV or add income and costs by hand. Preview every row before it enters your workspace.</p></article><article><span className="step-number">02</span><ListFilter size={23} /><h3>Give each dollar a place.</h3><p>Separate customer payments, business costs and personal money. Unclear records stay visible until reviewed.</p></article><article><span className="step-number">03</span><FileCheck2 size={23} /><h3>Leave with a clear picture.</h3><p>Export your reviewed ledger and a portable workspace. Explore the sample to follow the federal tax calculation.</p></article></div></section>
      <section className="honesty-section"><div><ShieldCheck size={26} /><h2>Clear about your money.<br />Clear about our limits.</h2></div><div><p>We organize records; we don’t connect to your bank, move money or file taxes. Personal-record tax estimates stay unavailable until the calculation policy receives independent review.</p><button className="text-button" onClick={() => setPrivacy(!privacy)}>How your data is handled <ArrowRight size={16} /></button></div></section>
      {privacy && <Privacy onClose={() => setPrivacy(false)} />}
      {error && <p className="notice error" role="alert">{error}</p>}
    </main><footer className="landing-footer"><Brand /><p>Business money, with a little more clarity.</p><button onClick={() => restoreInput.current?.click()}>Restore a workspace <FolderOpen size={15} /></button><span>2026</span></footer>
  </div>;

  const blockedRowIds = new Set(result.blockers.flatMap(blocker => blocker.rowId ? [blocker.rowId] : []));
  const reviewed = workspace.rows.filter(row => row.reviewed && row.treatment !== "review" && row.treatment !== "unsupported" && !blockedRowIds.has(row.id)).length;
  const visibleRows = workspace.rows.filter(row => (filter === "all" || (filter === "review" ? !row.reviewed || row.treatment === "review" || row.treatment === "unsupported" || blockedRowIds.has(row.id) : row.treatment === filter)) && `${row.description} ${row.source}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="workspace-shell">{inputFields}
    <header className="app-header"><Brand onClick={goHome} /><div className="header-context"><span className={`pill ${workspace.mode === "sample" ? "pill-sage" : ""}`}>{workspace.mode === "sample" ? "Sample business" : "Personal workspace"}</span><span>{workspace.profile.taxYear}</span></div><div className="header-actions">{workspace.mode === "personal" && <button className="button button-small button-primary" aria-label={cloud.busy ? "Saving workspace" : "Save workspace to account"} disabled={cloud.busy || !cloud.authReady} onClick={() => void cloud.save()}><Cloud size={16} /><span>{cloud.busy ? "Saving…" : "Save to account"}</span></button>}<button className="icon-button" aria-label="Account and saved workspaces" aria-expanded={cloud.accountOpen} onClick={() => cloud.setAccountOpen(!cloud.accountOpen)}><UserRound size={18} /></button><button className="button button-small button-quiet" aria-label="Back up workspace" onClick={backup} disabled={!workspace.rows.length}><ArrowDownToLine size={16} /><span>Back up workspace</span></button><button className={`icon-button ${settings ? "active" : ""}`} aria-label="Workspace settings" aria-expanded={settings} onClick={() => setSettings(!settings)}><Settings2 size={20} /></button></div></header>
    <div className="workspace-topline"><span>{workspace.mode === "sample" ? "Avery’s fictional business. Try changing a record." : "Records are processed here, in your browser."}</span><span className="save-status" role="status"><span className={`status-dot ${dirty ? "amber" : ""}`} />{cloud.busy ? "Saving / loading…" : cloud.conflict ? "Save conflict · your changes are still here" : cloud.savedCurrent ? `Saved to account · ${new Date(cloud.saved!.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : cloud.saved ? "Unsaved changes · choose Save to account" : !workspace.rows.length && !workspace.revision ? "Empty local workspace" : dirty ? "Changes in this tab only" : "Workspace file downloaded or restored"}</span></div>
    <nav className="app-nav" aria-label="Workspace"><div>{([['overview', 'Overview'], ['transactions', 'Transactions'], ['reports', 'Reports']] as const).map(([key, title]) => <button key={key} className={view === key ? "selected" : ""} aria-current={view === key ? "page" : undefined} onClick={() => navigate(key)}>{title}{key === "transactions" && result.unresolvedCount > 0 && <span className="nav-count">{result.unresolvedCount}</span>}</button>)}</div><span className="nav-meta">THROUGH {dateLabel(workspace.profile.throughDate).toUpperCase()}</span></nav>
    <main className="workspace-main">
      {cloud.accountOpen && <AccountPanel cloud={cloud} dirty={dirty} onClose={() => cloud.setAccountOpen(false)} />}
      {!cloud.accountOpen && cloud.message && <p className="notice" role="status">{cloud.message}</p>}
      {!cloud.accountOpen && cloud.error && <p className="notice error" role="alert">{cloud.error}</p>}
      {cloud.conflict && <section className="callout cloud-conflict"><h3>A newer version is saved.</h3><p>Your changes are still in this tab. Download a backup before loading the newer version, or save these changes as a separate workspace.</p><div className="form-actions"><button className="button button-small button-secondary" disabled={cloud.busy} onClick={backup}>Download my changes</button>{cloud.saved && <button className="button button-small button-secondary" disabled={cloud.busy} onClick={() => void cloud.open(cloud.saved!.id, dirty)}>Load saved version</button>}<button className="button button-small button-primary" disabled={cloud.busy} onClick={() => void cloud.save(true)}>Save as new workspace</button></div></section>}
      {settings && <Settings workspace={workspace} onSave={(title, profile) => { if (!change(w => ({ ...w, title, profile }))) return; setSettings(false); setNotice("Workspace details updated. Your records are unchanged."); }} onClose={() => setSettings(false)} onRestore={() => restoreInput.current?.click()} onNew={() => start("personal")} onSample={() => start("sample")} onPrivacy={() => setPrivacy(!privacy)} />}
      {privacy && <Privacy onClose={() => setPrivacy(false)} />}
      {notice && <div className="notice" role="status"><Check size={17} /><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={16} /></button></div>}
      {error && <div className="notice error" role="alert"><Info size={17} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
      <div className="page-heading"><div><div className="eyebrow">{workspace.title || "YOUR BUSINESS"}</div><h1 ref={heading} tabIndex={-1}>{view === "overview" ? "Your money, in focus." : view === "transactions" ? "Every record. Your call." : "A clear paper trail."}</h1><p>{view === "overview" ? "The records, the decisions, and the numbers behind them." : view === "transactions" ? "Review what belongs to your business. We’ll keep the totals in step." : "Take your records with you. Keep a copy of your work."}</p></div>{view === "transactions" && <div className="page-actions"><button className="button button-secondary" onClick={() => { setPreview(null); setEditor("new"); }}><Plus size={16} />Add record</button><button className="button button-primary" onClick={beginImport}><Upload size={16} />Import CSV</button></div>}</div>
      {view === "overview" && <>
        <div className="overview-grid"><section className="panel number-panel"><div className="panel-top"><span className="small-label">{workspace.mode === "sample" ? "ILLUSTRATIVE FEDERAL ESTIMATE" : "YOUR WORKSPACE"}</span><span className={`pill ${result.status === "ready" ? "pill-sage" : "pill-amber"}`}>{result.status === "ready" ? "Reviewed sample" : result.unresolvedCount ? "Review needed" : "Records only"}</span></div>
          {result.status === "ready" && result.federal ? <><p className="number-label">Estimated federal tax remaining</p><div className="main-number">{money(result.remainingCents ?? 0)}</div><p className="number-context">On profit recorded through {dateLabel(workspace.profile.throughDate)}, after recorded payments.</p>{(result.excessCents ?? 0) > 0 && <p className="callout">{money(result.excessCents!)} in potential excess payments. This is not an IRS-approved credit or refund.</p>}<div className="number-footer"><span><CheckCheck size={17} />{reviewed} records reviewed</span><button className="text-button" onClick={() => navigate("reports")}>View report <ArrowRight size={16} /></button></div></> : <><div className="blocked-icon">{result.unresolvedCount ? <ListFilter size={27} /> : <ShieldCheck size={27} />}</div><h2>{result.unresolvedCount ? `${result.unresolvedCount === 1 ? "One quick check" : `${result.unresolvedCount} records to review`}.` : workspace.rows.length ? "Your ledger comes first." : "A fresh start for your records."}</h2><p className="number-context">{result.unresolvedCount ? "A payment method doesn’t tell us what a payment was for. Review the open records to complete your picture." : workspace.mode === "personal" ? "Your records are ready to organize and export. Tax estimates for personal records are paused pending independent policy review." : "Confirm the scope and date coverage before this sample can show an illustrative calculation."}</p><button className="button button-primary" onClick={result.unresolvedCount ? review : !workspace.rows.length ? () => navigate("transactions") : () => setSettings(true)}>{result.unresolvedCount ? "Review records" : !workspace.rows.length ? "Add your first record" : "Review workspace details"}<ArrowRight size={17} /></button></>}
        </section><section className="panel profit-panel"><div className="panel-top"><span className="small-label">REVIEWED BUSINESS RECORDS</span><span className="round-icon"><ArrowUpRight size={20} /></span></div><p className="number-label">Business profit</p><div className="profit-number">{money(result.profitCents)}</div><div className="profit-lines"><div><span><span className="legend-dot income" />Business income</span><b>{money(result.incomeCents)}</b></div><div><span><span className="legend-dot costs" />Business costs</span><b>−{money(result.costsCents)}</b></div></div><div className="profit-rule"><span style={{ width: `${result.incomeCents > 0 ? Math.min(100, Math.max(0, result.profitCents / result.incomeCents * 100)) : 0}%` }} /></div><p className="small-note">{result.unresolvedCount ? `${result.unresolvedCount} unresolved records are not represented as reviewed business profit.` : "From the business treatment you confirmed. Personal money and transfers stay separate."}</p></section></div>
        <div className="section-heading"><h2>The details make the difference.</h2><span>{workspace.rows.length} records · {workspace.imports.length} imports</span></div>
        <div className="details-grid"><section className="panel review-panel"><div className="section-card-title"><span className="round-icon"><FileCheck2 size={20} /></span><div><h3>{result.unresolvedCount ? "A second look, not a guess." : "Keep your records in order."}</h3><p>{result.unresolvedCount ? "Your decisions are part of the calculation." : "Add income, costs, or a payment record."}</p></div></div><div className="review-progress"><div><span>{reviewed} of {workspace.rows.length} records reviewed</span><b>{workspace.rows.length ? Math.round(reviewed / workspace.rows.length * 100) : 0}%</b></div><ReviewProgress reviewed={reviewed} total={workspace.rows.length} /></div><button className="text-button" onClick={() => { navigate("transactions"); setFilter(result.unresolvedCount ? "review" : "all"); }}>{result.unresolvedCount ? "Finish reviewing" : "Open transactions"}<ArrowRight size={16} /></button></section><section className="panel trust-panel"><span className="small-label">BUILT TO BE EXPLAINED</span><h3>Code does the math.<br />You can follow every step.</h3><p>No AI-generated tax amounts. The sample uses versioned calculations with visible assumptions and sources.</p><details><summary>Calculation scope & sources <ChevronDown size={16} /></summary><p>2026 federal illustration for the supported single sole-proprietor profile. State and local taxes, other income and required installments are not determined. Rules: {RULE_VERSION}. Independent tax-policy review is pending.</p><a href="https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes" target="_blank" rel="noreferrer">IRS self-employment tax <ArrowUpRight size={13} /></a><a href="https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill" target="_blank" rel="noreferrer">IRS 2026 parameters <ArrowUpRight size={13} /></a></details></section></div>
        {result.blockers.length > 0 && <details className="blocker-details"><summary>What’s keeping the tax estimate unavailable? <span>{result.blockers.length}</span><ChevronDown size={16} /></summary><ul>{result.blockers.map((b, index) => <li key={`${b.code}-${index}`}>{b.message}{b.rowId && <button onClick={() => { navigate("transactions"); setFilter("all"); setEditor(workspace.rows.find(row => row.id === b.rowId) || null); }}>Review record <ArrowRight size={13} /></button>}</li>)}</ul></details>}
        {result.status === "ready" && <Calculation result={result} />}
      </>}

      {view === "transactions" && <>
        {workspace.mode === "personal" && <div className="policy-note"><Info size={17} /><p>Bookkeeping works with your records. Personal tax estimates remain unavailable pending independent policy review. <button onClick={() => start("sample")}>Explore illustrative sample math <ArrowUpRight size={13} /></button></p></div>}
        {preview && <section className="panel import-preview"><div className="editor-heading"><div><span className="eyebrow">IMPORT PREVIEW</span><h2>{preview.name}</h2></div><button className="icon-button" aria-label="Cancel import" onClick={() => setPreview(null)}><X size={20} /></button></div>{preview.errors.length ? <><p className="error-text">Nothing has been imported. Fix these rows and upload the file again.</p><ul className="import-errors">{preview.errors.map((e, i) => <li key={i}><b>{e.row ? `Row ${e.row}` : "File"}</b>{e.message}</li>)}</ul></> : <><div className="import-stats"><div><strong>{preview.rows.length}</strong><span>records found</span></div><div><strong>{duplicateIds.length}</strong><span>possible duplicates</span></div><div><strong>{preview.rows.length ? dateLabel([...preview.rows].sort((a, b) => a.date.localeCompare(b.date))[0].date) : "—"}</strong><span>first record</span></div></div>{alreadyImported && <p className="callout">This exact file is already in this workspace. It won’t be imported again.</p>}{!alreadyImported && duplicateIds.map(id => {
          const row = preview.rows.find(r => r.id === id)!;
          const matches = duplicates.filter(d => d.incomingId === id);
          const exactSource = matches.some(d => { const other = [...workspace.rows, ...preview.rows].find(r => r.id === d.existingId); return !!row.sourceId && other?.sourceId === row.sourceId && other.source === row.source; });
          return <div className="duplicate-row" key={id}><div><span className="pill pill-amber">Possible duplicate</span><strong>{row.description} · {money(row.amountCents)}</strong><p>{row.date} · {exactSource ? "This source already uses the same transaction ID. Keep the existing record." : "Same-looking payments can still be separate. Choose what to do."}</p></div><div><button className={`button button-small ${decisions[id] === "skip" ? "button-primary" : "button-secondary"}`} aria-pressed={decisions[id] === "skip"} onClick={() => setDecisions(d => ({ ...d, [id]: "skip" }))}>Skip duplicate</button>{!exactSource && <button className={`button button-small ${decisions[id] === "keep" ? "button-primary" : "button-secondary"}`} aria-pressed={decisions[id] === "keep"} onClick={() => setDecisions(d => ({ ...d, [id]: "keep" }))}>Keep separate</button>}</div></div>;
        })}<div className="preview-table">{preview.rows.slice(0, 5).map((row, i) => <div key={`${row.id}-${i}`}><span>{row.date}</span><strong>{row.description}</strong><b>{money(row.amountCents)}</b></div>)}</div>{preview.rows.length > 5 && <p className="small-note">Showing the first 5 of {preview.rows.length} records. All imported rows will be available for review.</p>}<div className="form-actions"><button className="button button-primary" disabled={alreadyImported || duplicateIds.some(id => !decisions[id]) || !preview.rows.length} onClick={commitImport}>Import records <ArrowRight size={16} /></button><button className="button button-quiet" onClick={() => setPreview(null)}>Cancel</button></div></>}<button className="text-button" onClick={() => download(TEMPLATE, "the-number-template.csv", "text/csv")}>Download the supported CSV template <ArrowDownToLine size={15} /></button></section>}
        {editor && <RowEditor key={editor === "new" ? "new" : editor.id} row={editor === "new" ? undefined : editor} workspace={workspace} onSave={saveRow} onCancel={() => setEditor(null)} onRemove={removeRow} />}
        {!workspace.rows.length && !editor && !preview ? <section className="panel empty-state"><span className="empty-icon"><FileSpreadsheet size={35} strokeWidth={1.4} /></span><h2>Start with what you have.</h2><p>A CSV works. So does one cash job.<br />Your first clear picture starts with your first record.</p><div className="hero-actions"><button className="button button-primary" onClick={beginImport}><Upload size={16} />Choose CSV</button><button className="button button-secondary" onClick={() => setEditor("new")}><Plus size={16} />Add a record</button></div><button className="text-button" onClick={() => download(TEMPLATE, "the-number-template.csv", "text/csv")}>Download template <ArrowDownToLine size={15} /></button><div className="empty-formats">Required: date, description, amount. Optional: account, transaction_id.<br />Positive amounts are money in; negative amounts are money out. Up to 5 MB / 5,000 rows.</div></section> : <>
          <div className="ledger-toolbar"><div className="filter-pills">{([['all', 'All records'], ['review', 'Needs review'], ['income', 'Income'], ['expense', 'Costs']] as const).map(([key, label]) => <button key={key} className={filter === key ? "selected" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}{key === "review" && <span>{result.unresolvedCount}</span>}</button>)}</div><label className="search-field"><Search size={16} /><span className="visually-hidden">Search records</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a record" /></label></div>
          <section className="panel ledger"><div className="ledger-column-head"><span>RECORD</span><span>TREATMENT</span><span>AMOUNT</span><span /></div>{visibleRows.length ? visibleRows.map(row => <div className="ledger-row" key={row.id}><div className="ledger-description"><span className={`transaction-icon ${row.amountCents > 0 ? "positive" : ""}`}>{row.amountCents > 0 ? <ArrowDown size={17} /> : <ArrowUpRight size={17} />}</span><div><strong>{row.description}</strong><p>{dateLabel(row.date)} <span>·</span> {row.source}</p></div></div><div className="ledger-treatment"><span className={`treatment ${!row.reviewed || row.treatment === "review" || row.treatment === "unsupported" || blockedRowIds.has(row.id) ? "needs-review" : ""}`}>{row.reviewed && row.treatment !== "unsupported" && !blockedRowIds.has(row.id) ? <Check size={12} /> : <span className="status-dot amber" />}{blockedRowIds.has(row.id) && row.reviewed ? "Needs review" : TREATMENTS[row.treatment]}</span>{row.treatment === "tax_payment" && <small>{row.paymentYear || "Year needed"} · {row.paymentPurpose || "Purpose needed"}</small>}</div><div className={`ledger-amount ${row.amountCents > 0 ? "positive" : ""}`}>{row.amountCents > 0 ? "+" : ""}{money(row.amountCents)}</div><button className="row-edit" aria-label={`Review ${row.description}`} onClick={() => { setEditor(row); setPreview(null); window.scrollTo({ top: 130, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}>{row.reviewed && !blockedRowIds.has(row.id) ? "Edit" : "Review"}<ChevronRight size={15} /></button></div>) : <div className="empty-filter"><CheckCheck size={25} /><h3>{filter === "review" ? "No open reviews in this view." : "No matching records."}</h3><p>{filter === "review" ? "Check your coverage and assumptions before exploring the sample estimate." : "Try another search or filter."}</p><button className="text-button" onClick={() => { setFilter("all"); setQuery(""); }}>Show all records <ArrowRight size={15} /></button></div>}</section>
          <div className="ledger-footer"><span>{visibleRows.length} of {workspace.rows.length} records</span><button className="text-button" onClick={() => download(TEMPLATE, "the-number-template.csv", "text/csv")}>CSV template <ArrowDownToLine size={14} /></button></div>
        </>}
        {!!workspace.rows.length && <div className="coverage-card"><div><h3>{workspace.profile.coverageComplete ? "Coverage confirmed by you" : "One more detail: what do these records cover?"}</h3><p>Through {dateLabel(workspace.profile.throughDate)} · {workspace.profile.coverageComplete ? "This is your confirmation, not a verified bank history." : "Confirm the through-date and whether any supported business records are missing."}</p></div><button className="button button-secondary button-small" onClick={() => setSettings(true)}>Review details <ArrowRight size={15} /></button></div>}
      </>}

      {view === "reports" && <><div className="report-grid"><section className="panel report-main"><div className="panel-top"><span className="small-label">YOUR REVIEW PACKET</span><FileCheck2 size={23} /></div><h2>Good records travel well.</h2><p>Export the decisions behind your business totals. Bring the ledger to the person who helps with your books or taxes.</p><div className="report-stat-line"><span>{workspace.rows.length} source records</span><span>{reviewed} reviewed</span><span>{result.unresolvedCount} need review</span></div><div className="report-preview"><div><span>Reviewed business income</span><b>{money(result.incomeCents)}</b></div><div><span>Reviewed business costs</span><b>{money(result.costsCents)}</b></div><div className="total-line"><span>Reviewed profit</span><b>{money(result.profitCents)}</b></div><p>{result.status === "ready" ? "The sample tax summary below uses the same calculation as Overview." : "Tax amounts are not included while the estimate is unavailable. Unresolved records remain flagged in the ledger."}</p></div><button className="button button-primary" disabled={!workspace.rows.length} onClick={exportCSV}><ArrowDownToLine size={17} />Download ledger CSV</button></section><div className="report-side"><section className="panel export-option"><span className="round-icon"><FolderOpen size={21} /></span><h3>Your workspace, to keep.</h3><p>A restorable file with your records, review decisions and settings. CSV alone does not restore the whole workspace.</p><button className="button button-secondary" onClick={backup} disabled={!workspace.rows.length}>Download workspace <ArrowDownToLine size={16} /></button><button className="text-button" onClick={() => restoreInput.current?.click()}>Restore a saved file <ArrowRight size={15} /></button></section><section className="panel export-option"><span className="round-icon"><FileCheck2 size={21} /></span><h3>A report you can share.</h3><p>{result.status === "ready" ? "Print the reconciled sample calculation and records, or save a PDF using your browser." : "Print your records and review status, or save a PDF. Unavailable tax amounts are not included."}</p><button className="button button-secondary" disabled={!workspace.rows.length} onClick={() => window.print()}>Print / save PDF <ArrowUpRight size={16} /></button></section></div></div>{result.status === "ready" && <Calculation result={result} />}<div className="report-provenance"><span><ShieldCheck size={17} />Same records. Same calculation.</span><p>Through {dateLabel(workspace.profile.throughDate)} · rules {result.ruleVersion} · workspace revision {workspace.revision}. Payment records are user-confirmed, not verified with the IRS.</p></div></>}
      <footer className="workspace-footer"><span><LockKeyhole size={13} />No bank connection. No money moved.</span><span>{workspace.mode === "sample" ? "Illustrative sample · not an IRS bill" : "Personal bookkeeping · tax estimates paused"}</span><button onClick={() => setPrivacy(!privacy)}>Data & privacy</button></footer>
    </main><PrintReport workspace={workspace} result={result} />
  </div>;
}

function RowEditor({ row, workspace, onSave, onCancel, onRemove }: { row?: LedgerRow; workspace: Workspace; onSave: (row: LedgerRow) => void; onCancel: () => void; onRemove: (row: LedgerRow) => void }) {
  const [date, setDate] = useState(row?.date || workspace.profile.throughDate);
  const [description, setDescription] = useState(row?.description || "");
  const [amount, setAmount] = useState(row ? (Math.abs(row.amountCents) / 100).toFixed(2) : "");
  const [direction, setDirection] = useState(row && row.amountCents < 0 ? "out" : "in");
  const [treatment, setTreatment] = useState<Treatment>(row?.treatment || "review");
  const [category, setCategory] = useState<ExpenseCategory>(row?.expenseCategory || "other");
  const [paymentYear, setPaymentYear] = useState(row?.paymentYear || workspace.profile.taxYear);
  const [purpose, setPurpose] = useState<"estimated" | "balance" | "other">(row?.paymentPurpose || "estimated");
  const [note, setNote] = useState(row?.note || "");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const imported = !!row && row.source !== "Manual";
  const title = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const target = title.current;
    if (!opener.current && document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    target?.focus();
    return () => { requestAnimationFrame(() => {
      // Strict Mode replays effects while the panel is still mounted.
      if (target?.isConnected) return;
      if (opener.current?.isConnected) opener.current.focus();
      else document.querySelector<HTMLElement>(".page-heading h1, .landing-nav .brand")?.focus();
    }); };
  }, []);
  function save(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const cents = toCents(amount);
      if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_AMOUNT_CENTS) throw new Error("Enter a positive amount up to $10,000,000,000, with no more than two decimal places.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Enter a valid calendar date.");
      if (!description.trim()) throw new Error("Add a description so you can recognize this record later.");
      if (treatment === "income" && direction !== "in") throw new Error("Business income must be money in. For a refund or other adjustment, choose specialist review.");
      if ((treatment === "expense" || treatment === "tax_payment") && direction !== "out") throw new Error("A cost or tax payment must be money out. Refunds need specialist review.");
      if (treatment === "tax_payment" && !confirmed) throw new Error("Confirm the payment purpose and designated tax year before recording it.");
      onSave({ ...(row || {}), id: row?.id || uid(), source: row?.source || "Manual", date, description: description.trim(), amountCents: cents * (direction === "out" ? -1 : 1), treatment, reviewed: treatment !== "review" && treatment !== "unsupported", expenseCategory: treatment === "expense" ? category : undefined, paymentYear: treatment === "tax_payment" ? paymentYear : undefined, paymentPurpose: treatment === "tax_payment" ? purpose : undefined, note: note.trim() || undefined });
    } catch (e) { setError((e as Error).message); }
  }
  return <section className="panel row-editor"><div className="editor-heading"><div><span className="eyebrow">{row ? "REVIEW A RECORD" : workspace.mode === "sample" ? "ADD A FICTIONAL SAMPLE RECORD" : "ADD A RECORD"}</span><h2 tabIndex={-1} ref={title}>{row ? "What was this money for?" : "A job, a cost, a clearer picture."}</h2></div><button className="icon-button" aria-label="Close record editor" onClick={onCancel}><X size={20} /></button></div><form onSubmit={save}>{workspace.mode === "sample" && <p className="callout">Sample mode is for fictional records only. To work with your own money, start a personal workspace.</p>}<div className="form-grid"><label className="field field-wide">Description<input value={description} onChange={e => setDescription(e.target.value)} maxLength={200} disabled={imported} placeholder="e.g. Front lawn service" required /></label><label className="field">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={imported} required /></label><label className="field">Amount (USD)<input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" disabled={imported} placeholder="0.00" required /></label><label className="field">Direction<select value={direction} onChange={e => setDirection(e.target.value)} disabled={imported}><option value="in">Money in</option><option value="out">Money out</option></select></label><label className="field">Treatment<select value={treatment} onChange={e => setTreatment(e.target.value as Treatment)}>{Object.entries(TREATMENTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{treatment === "expense" && <label className="field field-wide">Business cost category<select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)}>{Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="field-hint">Only wholly business-use costs in supported categories. Mixed use, equipment, depreciation, refunds and uncertain deductions need specialist review.</span></label>}{treatment === "tax_payment" && <><label className="field">Designated tax year<input type="number" value={paymentYear} min="1900" max="2100" onChange={e => setPaymentYear(Number(e.target.value))} required /></label><label className="field">Payment purpose<select value={purpose} onChange={e => setPurpose(e.target.value as typeof purpose)}><option value="estimated">Estimated federal income tax</option><option value="balance">Return balance payment</option><option value="other">Other / not sure</option></select></label><label className="checkbox-row field-wide"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>I checked the payment record and its designated tax year. This is my confirmation, not IRS verification.</span></label></>}<label className="field field-wide">Note <span className="optional">optional</span><input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Why did you choose this treatment?" /></label></div>{imported && <p className="small-note">Original imported facts stay unchanged. Your treatment and note are saved separately in this workspace.</p>}{treatment === "unsupported" && <p className="callout">This record will stay unresolved. You can export it for review, but it won’t unlock a tax estimate.</p>}{error && <p className="error-text" role="alert">{error}</p>}<div className="form-actions"><button className="button button-primary" type="submit">Save record <Check size={17} /></button><button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button>{row && <button className="button button-quiet remove-record" type="button" onClick={() => onRemove(row)}>Remove record</button>}</div></form></section>;
}

function Settings({ workspace, onSave, onClose, onRestore, onNew, onSample, onPrivacy }: { workspace: Workspace; onSave: (title: string, profile: WorkspaceProfile) => void; onClose: () => void; onRestore: () => void; onNew: () => void; onSample: () => void; onPrivacy: () => void }) {
  const [title, setTitle] = useState(workspace.title);
  const [profile, setProfile] = useState(workspace.profile);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const target = titleRef.current;
    if (!opener.current && document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    target?.focus();
    return () => { requestAnimationFrame(() => {
      if (target?.isConnected) return;
      if (opener.current?.isConnected) opener.current.focus();
      else document.querySelector<HTMLElement>(".page-heading h1, .landing-nav .brand")?.focus();
    }); };
  }, []);
  const fields: [keyof WorkspaceProfile, string, string][] = [["adultUS", "Adult US individual", "This sample scope is for an adult US taxpayer."], ["singleSoleProprietor", "Single filer and sole proprietor", "A sole proprietorship using Schedule C; not a corporation or partnership."], ["noOtherIncome", "No other income", "No wages, investment income or other taxable income in this scenario."], ["notDependent", "Not claimed as someone else’s dependent", "Dependent tax situations are not supported."], ["cashBasis", "Cash-basis service business", "Supported simple service income and costs; no inventory or special adjustments."]];
  return <section className="panel settings-panel"><div className="editor-heading"><div><span className="eyebrow">WORKSPACE DETAILS</span><h2 tabIndex={-1} ref={titleRef}>The context matters.</h2></div><button className="icon-button" aria-label="Close workspace settings" onClick={onClose}><X size={20} /></button></div><form onSubmit={e => { e.preventDefault(); onSave(title, profile); }}><div className="form-grid"><label className="field field-wide">Workspace name<input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} required /></label><label className="field">Tax year<select value={profile.taxYear} onChange={e => setProfile(p => ({ ...p, taxYear: Number(e.target.value), coverageComplete: false }))}><option value={2026}>2026</option></select></label><label className="field">Records through<input type="date" value={profile.throughDate} onChange={e => setProfile(p => ({ ...p, throughDate: e.target.value, coverageComplete: false }))} required /></label></div><div className="settings-heading"><h3>Calculation scope</h3><p>Check only what is true. If you’re unsure, leave it unchecked. Your records still work even when the tax scenario isn’t supported.</p></div><div className="scope-grid">{fields.map(([key, label, help]) => <label className="scope-option" key={key}><input type="checkbox" checked={!!profile[key]} onChange={e => setProfile(p => ({ ...p, [key]: e.target.checked }))} /><span><strong>{label}</strong><small>{help}</small></span></label>)}</div><label className="scope-option coverage-option"><input type="checkbox" checked={profile.coverageComplete} onChange={e => setProfile(p => ({ ...p, coverageComplete: e.target.checked }))} /><span><strong>I have included the supported business records through this date.</strong><small>This is your confirmation of coverage, not a verified bank connection. Missing records can change the result.</small></span></label>{workspace.mode === "personal" && <p className="policy-note">These settings organize your workspace. They do not enable personal tax estimates while independent policy review is pending.</p>}<div className="form-actions"><button className="button button-primary" type="submit">Save details <Check size={17} /></button><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button></div></form><div className="workspace-management"><button onClick={onRestore}><FolderOpen size={16} />Restore a workspace</button><button onClick={onSample}><CircleHelp size={16} />Load the sample business</button><button onClick={onPrivacy}><ShieldCheck size={16} />Data & privacy</button><button className="clear-button" onClick={onNew}>Clear & start a personal workspace</button></div></section>;
}

function Calculation({ result }: { result: WorkspaceResult }) {
  const f = result.federal;
  if (result.status !== "ready" || !f) return null;
  return <section className="panel calculation"><div className="calculation-intro"><span className="eyebrow">FOLLOW THE MATH</span><h2>A number you can<br />take apart.</h2><p>Illustrative federal math, computed in code. No model-generated amounts and no payment instructions.</p><span className="pill">{result.ruleVersion}</span></div><div className="calculation-lines"><div><span><i>01</i>Reviewed business profit</span><b>{money(result.profitCents)}</b></div><div><span><i>02</i>Self-employment tax</span><b>{money(f.se.totalCents)}</b></div><div><span><i>03</i>Federal income tax</span><b>{money(f.incomeTaxCents)}</b></div><div className="subtotal"><span>Gross federal estimate</span><b>{money(f.totalTaxCents)}</b></div><div><span>Recorded payments for this tax year</span><b>−{money(result.paymentsCents)}</b></div><div className="calculation-total"><span>Estimated amount remaining</span><b>{money(result.remainingCents ?? 0)}</b></div>{(result.excessCents ?? 0) > 0 && <div><span>Potential excess payments</span><b>{money(result.excessCents!)}</b></div>}<details><summary>Show deductions and taxable income <ChevronDown size={15} /></summary><div><span>Half of self-employment tax deduction</span><b>{money(f.halfSeDeductionCents)}</b></div><div><span>Standard deduction</span><b>{money(f.standardDeductionCents)}</b></div><div><span>QBI deduction</span><b>{money(f.qbiDeductionCents)}</b></div><div><span>Taxable income in this sample</span><b>{money(f.taxableIncomeCents)}</b></div></details><p className="small-note">This is not an IRS bill. It does not determine a required payment, a penalty, an approved credit or a full-year forecast. State and local taxes are excluded.</p></div></section>;
}

function Privacy({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const target = panel.current;
    if (!opener.current && document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    target?.focus();
    target?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    return () => { requestAnimationFrame(() => {
      if (target?.isConnected) return;
      if (opener.current?.isConnected) opener.current.focus();
      else document.querySelector<HTMLElement>(".page-heading h1, .landing-nav .brand")?.focus();
    }); };
  }, []);
  return <section className="panel privacy-panel" ref={panel} tabIndex={-1} aria-label="Data and privacy"><div className="editor-heading"><div><span className="eyebrow">DATA & PRIVACY</span><h2>Your records. Your choice of storage.</h2></div><button className="icon-button" aria-label="Close privacy information" onClick={onClose}><X size={20} /></button></div><div className="privacy-grid"><div><h3>Review locally.</h3><p>CSV records, descriptions and amounts are processed in this browser. They are never sent to an AI service. Choosing Save to account uploads that personal workspace to our Supabase database. Signing in alone does not upload records. The hosting provider receives ordinary page-request information.</p></div><div><h3>Saving is your decision.</h3><p>Unsaved work is held in this tab and can be lost on reload. Save to account for persistence, or download a workspace backup. Account workspaces are restricted to their owner. Your sign-in session can persist in this browser; sign out on a shared device.</p></div><div><h3>Export or delete.</h3><p>Download a workspace or ledger to keep a copy. Use Delete in your account panel to remove a saved workspace. Clearing this tab does not delete cloud copies or downloaded files. Exports are not encrypted by this app; store them privately.</p></div><div><h3>Boundaries are visible.</h3><p>No bank login, money movement, tax filing or automatic notifications. Only the bundled fictional sample can display illustrative tax math while independent policy review is pending.</p></div></div></section>;
}


function PrintReport({ workspace, result }: { workspace: Workspace; result: WorkspaceResult }) {
  const illustrative = result.status === "ready" && !!result.federal;
  const summary: [string, number][] = [["Reviewed business income", result.incomeCents], ["Reviewed business costs", result.costsCents], ["Reviewed business profit", result.profitCents]];
  if (illustrative && result.federal) summary.push(["Self-employment tax", result.federal.se.totalCents], ["Income tax", result.federal.incomeTaxCents], ["Gross federal estimate", result.federal.totalTaxCents], ["Recorded designated-year payments", result.paymentsCents], ["Estimated amount remaining", result.remainingCents ?? 0], ["Potential excess payments", result.excessCents ?? 0]);
  const blocked = new Set(result.blockers.flatMap(item => item.rowId ? [item.rowId] : []));
  return <div className="print-report"><div className="print-brand">The Number.</div><p className="print-watermark">{workspace.mode === "sample" ? "FICTIONAL SAMPLE" : "PERSONAL BUSINESS RECORDS"} · {illustrative ? "ILLUSTRATIVE CALCULATION" : "RECORDS ONLY · NO TAX ESTIMATE"}</p><h1>{illustrative ? "Reviewed records & federal illustration" : "Business records & review status"}</h1><p>{workspace.title} · {workspace.profile.taxYear} · Records through {workspace.profile.throughDate}</p><p>{result.unresolvedCount} records need review. Coverage {workspace.profile.coverageComplete ? "confirmed by the user" : "not yet confirmed"}. Business totals include only supported, reviewed activity in the selected period.</p><table><tbody>{summary.map(([label, value]) => <tr key={label}><td>{label}</td><td>{money(value)}</td></tr>)}</tbody></table><h2>Basis & limitations</h2><p>{illustrative ? "Fictional adult US sole proprietor, single, not a dependent, no other income and supported cash-basis service records. Federal only. This is not a tax bill, required installment, full-year forecast, approved credit or tax advice." : "This report organizes user-provided records. It is not a tax return or a verification of deductibility. Tax amounts are unavailable and are not included."} Independent policy review is pending. Payments and coverage are user-confirmed, not IRS or bank verification.</p><p>Rule version: {result.ruleVersion} · Revision {workspace.revision} · {workspace.rows.length} records · Generated {new Date().toLocaleDateString("en-US")}</p><h2>Source records</h2><table className="print-ledger"><thead><tr><th>Date</th><th>Description</th><th>Treatment</th><th>Amount</th></tr></thead><tbody>{workspace.rows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.description}</td><td>{blocked.has(row.id) || !row.reviewed ? "Needs review" : TREATMENTS[row.treatment]}{row.paymentYear ? " / " + row.paymentYear : ""}</td><td>{money(row.amountCents)}</td></tr>)}</tbody></table></div>;
}
