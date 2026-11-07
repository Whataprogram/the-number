"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import type { Profile, Txn } from "@/lib/types";

export function PlaidButton({ onData }: { onData: (d: { txns: Txn[]; balances: Profile["balances"] }) => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const onSuccess = useCallback(async (public_token: string) => {
    setBusy(true); setMsg("Pulling your transactions…");
    const r = await fetch("/api/plaid/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ public_token }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error);
    setMsg("");
    onData(j);
  }, [onData]);

  const { open, ready } = usePlaidLink({ token, onSuccess });
  useEffect(() => { if (token && ready) open(); }, [token, ready, open]);

  async function start() {
    setMsg(""); setBusy(true);
    const r = await fetch("/api/plaid/link-token", { method: "POST" });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error);
    setToken(j.link_token);
  }

  return (
    <div className="flex flex-col gap-2">
      <button className="btn btn-primary w-full !rounded-xl !py-3.5" onClick={start} disabled={busy}>{busy ? "Connecting…" : "Connect with Plaid"}</button>
      {msg && <span className="text-xs" style={{ color: "var(--muted)" }}>{msg}</span>}
      <span className="text-center text-[11px]" style={{ color: "var(--muted)" }}>Sandbox test login: user_good / pass_good</span>
    </div>
  );
}
