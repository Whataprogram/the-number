"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/cloud-client";

export default function AccountDeletion({ email, userId }: { email: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const activeIdentity = useRef(userId); activeIdentity.current = userId;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function remove(event: FormEvent) {
    event.preventDefault(); setError("");
    const client = getSupabaseBrowser();
    if (!client || confirmation.trim().toLowerCase() !== email.toLowerCase()) { setError("Enter this account’s email address to confirm."); return; }
    if (!window.confirm("Permanently delete this account and every workspace saved to it? This cannot be undone. Downloaded files will remain on your device.")) return;
    const captured = userId; setPending(true);
    try {
      const { data: before } = await client.auth.getSession();
      if (before.session?.user.id !== captured) throw new Error("The account changed. Close this panel and try again.");
      // Reauthenticate in an isolated, nonpersistent client so a delayed result
      // cannot replace the browser's signed-in account after a panel closes.
      const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data, error: authError } = await verifier.auth.signInWithPassword({ email, password });
      if (authError || data.user?.id !== captured || !data.session) throw new Error("Could not verify your password. Nothing was deleted.");
      const { data: current } = await client.auth.getSession();
      if (!alive.current || activeIdentity.current !== captured || current.session?.user.id !== captured) return;
      const response = await fetch("/api/account", { method: "DELETE", cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(30000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ confirmEmail: confirmation.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Account deletion did not complete. Try again.");
      // A later sign-in must not be cleared by this earlier deletion request.
      const { data: after } = await client.auth.getSession();
      if (activeIdentity.current === captured && after.session?.user.id === captured) {
        await client.auth.signOut({ scope: "local" });
      }
    } catch (e) { if (alive.current && activeIdentity.current === captured) setError(e instanceof Error ? e.message : "Could not confirm deletion. Sign in again to check the account before retrying."); }
    finally { if (alive.current && activeIdentity.current === captured) { setPending(false); setPassword(""); } }
  }
  return <div className="account-deletion">
    <button className="text-button" aria-expanded={open} onClick={() => setOpen(!open)} disabled={pending}>Delete my account</button>
    {open && <form onSubmit={remove} className="account-form">
      <h3>Delete your account and saved records.</h3>
      <p>This permanently removes all workspaces saved to your account. Download a backup first. Files already downloaded are not erased. Service backups and security logs follow the providers’ retention schedules.</p>
      <label className="field">Type your account email<input type="email" autoComplete="off" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      <label className="field">Current password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button className="button button-danger" type="submit" disabled={pending}>{pending ? "Verifying and deleting…" : "Permanently delete my account"}</button>
      {error && <p className="notice error" role="alert">{error}</p>}
    </form>}
  </div>;
}
