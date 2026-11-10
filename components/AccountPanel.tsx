"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Cloud, FolderOpen, LogOut, RefreshCw, Trash2, X } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/cloud-client";
import type { CloudWorkspaceController } from "@/lib/use-cloud-workspace";
import AccountDeletion from "./AccountDeletion";

const publicEmailSignup = process.env.NEXT_PUBLIC_ENABLE_EMAIL_SIGNUP === "true";

export default function AccountPanel({ cloud, dirty, onClose }: { cloud: CloudWorkspaceController; dirty: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null; title.current?.focus(); return () => { requestAnimationFrame(() => { if (opener?.isConnected) opener.focus(); else document.querySelector<HTMLElement>(".page-heading h1, .landing-nav .brand")?.focus(); }); }; }, []);
  useEffect(() => { setPassword(""); setRepeat(""); setError(""); setMessage(""); }, [mode, cloud.session?.user.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const client = getSupabaseBrowser();
    if (!client) return;
    if (!publicEmailSignup && (mode === "signup" || mode === "reset")) { setError("Public email signup and recovery are not open during this private pilot."); return; }
    setError(""); setMessage("");
    if ((mode === "signup" || cloud.recovery) && (password.length < 12 || password !== repeat)) { setError("Use at least 12 characters and enter the same password twice."); return; }
    setPending(true);
    try {
      if (cloud.recovery) {
        const { error: updateError } = await client.auth.updateUser({ password });
        if (updateError) throw updateError;
        cloud.setRecovery(false); setPassword(""); setRepeat(""); setMessage("Password updated. You can now open your saved workspaces.");
      } else if (mode === "reset") {
        const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/?auth=recovery` });
        if (resetError) throw resetError;
        setMessage("If an account is registered for that address, a reset link will arrive by email. Open it in this browser.");
      } else if (mode === "signup") {
        const { error: signupError } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/?auth=confirmed` } });
        if (signupError) throw signupError;
        setPassword(""); setRepeat(""); setMessage("Check your email to verify your account. Open the link in this browser, then sign in. Your records have not been uploaded.");
      } else {
        const { error: signinError } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (signinError) throw signinError;
        setPassword(""); setMessage("Signed in. Choose a saved workspace or explicitly save the records in this tab.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not complete account request. Please try again."); }
    finally { setPending(false); }
  }

  return <section className="panel account-panel" aria-labelledby="account-heading">
    <div className="editor-heading"><div><span className="eyebrow">YOUR PRIVATE WORKSPACE</span><h2 id="account-heading" ref={title} tabIndex={-1}>{cloud.recovery ? "Choose a new password." : cloud.session ? "Your saved workspaces." : "Pick up where you left off."}</h2></div><button className="icon-button" aria-label="Close account panel" onClick={onClose}><X size={20} /></button></div>
    {!cloud.configured ? <p className="callout">Account saving is not configured on this deployment. You can still review records locally and download a restorable workspace file.</p> : !cloud.authReady ? <p role="status">Checking your account…</p> : cloud.session && !cloud.recovery ? <>
      <div className="account-identity"><span><Cloud size={17} />{cloud.session.user.email}</span><button className="text-button" disabled={cloud.busy} onClick={() => void cloud.signOut(dirty)}>Sign out <LogOut size={15} /></button></div>
      {!cloud.session.user.email_confirmed_at && <p className="callout">Verify your email before saving records to this account.</p>}
      <div className="saved-heading"><p>Saved to your account. Opening one replaces the workspace in this tab.</p><button className="text-button" disabled={cloud.loadingList || cloud.busy} onClick={() => void cloud.refresh()}><RefreshCw size={14} />Refresh</button></div>
      {cloud.loadingList ? <p role="status">Loading saved workspaces…</p> : cloud.items.length ? <div className="saved-workspaces">{cloud.items.map(item => <div className="saved-workspace" key={item.id}><div><strong>{item.title}</strong><small>Saved {new Date(item.updated_at).toLocaleString()} · version {item.version}{cloud.saved?.id === item.id ? " · open in this tab" : ""}</small></div><div><button className="button button-small button-secondary" disabled={cloud.busy} onClick={() => void cloud.open(item.id, dirty)}><FolderOpen size={14} />Open</button><button className="icon-button" aria-label={`Delete saved workspace ${item.title}`} disabled={cloud.busy} onClick={() => void cloud.remove(item)}><Trash2 size={16} /></button></div></div>)}</div> : <div className="account-empty"><Cloud size={28} /><h3>No saved workspaces yet.</h3><p>Start or open a personal workspace, then choose Save to account. Signing in does not upload your records automatically.</p></div>}
      <p className="small-note">Saving is manual. Delete removes the saved workspace; it does not erase files you downloaded. Account credentials and sign-in state are managed by Supabase.</p>
      <AccountDeletion email={cloud.session.user.email || ""} userId={cloud.session.user.id} />
    </> : <>
      {!cloud.recovery && <div className="account-tabs" aria-label="Account action"><button className={mode === "signin" ? "selected" : ""} aria-pressed={mode === "signin"} onClick={() => setMode("signin")}>Sign in</button>{publicEmailSignup && <button className={mode === "signup" ? "selected" : ""} aria-pressed={mode === "signup"} onClick={() => setMode("signup")}>Create account</button>}</div>}
      {!publicEmailSignup && <p className="callout">Accounts are in a private pilot. Public email signup is not open yet. You can review, import and export records locally without an account.</p>}
      <form className="account-form" onSubmit={submit}>
        <p>{cloud.recovery ? "Use a unique password with at least 12 characters." : mode === "reset" ? "We’ll email a link to reset your password. Open it in this browser." : mode === "signup" ? "Create an account to save personal workspaces across visits. You choose when records are uploaded." : "Sign in to your account. Your current local records stay here until you choose Save to account."}</p>
        {!cloud.recovery && <label className="field">Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>}
        {(cloud.recovery || mode !== "reset") && <label className="field">{cloud.recovery ? "New password" : "Password"}<input type="password" autoComplete={mode === "signup" || cloud.recovery ? "new-password" : "current-password"} required minLength={mode === "signup" || cloud.recovery ? 12 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>}
        {(cloud.recovery || mode === "signup") && <label className="field">Confirm password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={repeat} onChange={e => setRepeat(e.target.value)} /></label>}
        <button className="button button-primary" disabled={pending} type="submit">{pending ? "Please wait…" : cloud.recovery ? "Update password" : mode === "signup" ? "Create account" : mode === "reset" ? "Email reset link" : "Sign in"}<ArrowRight size={16} /></button>
        {!cloud.recovery && publicEmailSignup && <button className="text-button" type="button" onClick={() => setMode(mode === "reset" ? "signin" : "reset")}>{mode === "reset" ? "Back to sign in" : "Forgot your password?"}</button>}
      </form>
    </>}
    {(error || cloud.error) && <p className="notice error" role="alert">{error || cloud.error}</p>}
    {(message || cloud.message) && <p className="notice" role="status">{message || cloud.message}</p>}
  </section>;
}
