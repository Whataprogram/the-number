"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import type { Profile, Txn } from "@/lib/types";

/**
 * Opens the real Plaid Link window (bank search, logos, login).
 * Live mode: exchanges the token and pulls that bank's transactions.
 * Sandbox mode (`onSandbox` given): after a successful test login, loads our full-year sample business through Plaid Sandbox,
 * because Plaid's built-in test users don't have a realistic year of business income.
 */
export function PlaidButton({ onData, onSandbox, label = "Connect with Plaid", primary = true }: {
  onData?: (d: { txns: Txn[]; balances: Profile["balances"] }) => void;
  onSandbox?: (institution: string) => void;
  label?: string;
  primary?: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const onSuccess = useCallback(async (public_token: string, meta: PlaidLinkOnSuccessMetadata) => {
    setToken(null);
    if (onSandbox) { onSandbox(meta.institution?.name || "your bank"); return; }
    setBusy(true); setMsg("Pulling your transactions…");
    const r = await fetch("/api/plaid/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ public_token }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error);
    setMsg("");
    onData?.(j);
  }, [onData, onSandbox]);

  const { open, ready } = usePlaidLink({ token, onSuccess, onExit: () => { setToken(null); setBusy(false); } });
  useEffect(() => { if (token && ready) open(); }, [token, ready, open]);

  async function start() {
    setMsg(""); setBusy(true);
    try {
      const r = await fetch("/api/plaid/link-token", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setToken(j.link_token);
    } catch (e) { setMsg((e as Error).message || "Couldn't open Plaid. Try again."); }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <button className={`btn w-full !rounded-xl !py-3.5 ${primary ? "btn-primary" : "btn-ghost"}`} onClick={start} disabled={busy || !!token}>{busy || token ? "Opening…" : label}</button>
      {msg && <span className="text-xs" style={{ color: "var(--muted)" }}>{msg}</span>}
    </div>
  );
}
