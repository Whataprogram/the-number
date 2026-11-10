"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { cloudConfigured, cloudFetch, CloudRequestError, getSupabaseBrowser, type CloudWorkspaceDetail, type CloudWorkspaceSummary } from "./cloud-client";
import { restoreWorkspace, serializeWorkspace } from "./workspace-io";
import type { Workspace } from "./workspace-types";

type Saved = { id: string; version: number; revision: number; updatedAt: string };
export function useCloudWorkspace(workspace: Workspace | null, onOpen: (workspace: Workspace) => void, onAccountCleared: () => void, onIdentityChanged: () => void) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!cloudConfigured);
  const [accountOpen, setAccountOpen] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [items, setItems] = useState<CloudWorkspaceSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const owner = useRef<string | null>(null);
  const context = useRef(0);
  const operation = useRef(false);
  const pendingCreate = useRef<{ id: string; snapshot: Workspace } | null>(null);
  const callbacks = useRef({ onOpen, onAccountCleared, onIdentityChanged });
  callbacks.current = { onOpen, onAccountCleared, onIdentityChanged };
  const latestWorkspace = useRef(workspace);
  latestWorkspace.current = workspace;

  function detach() {
    context.current += 1; operation.current = false; pendingCreate.current = null;
    setSaved(null); setBusy(false); setConflict(false); setError(""); setMessage("");
  }

  useEffect(() => {
    const client = getSupabaseBrowser();
    if (!client) return;
    if (new URLSearchParams(window.location.search).has("auth")) setAccountOpen(true);
    let alive = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      const nextOwner = next?.user.id || null;
      if (owner.current !== nextOwner) callbacks.current.onIdentityChanged();
      if (owner.current && owner.current !== nextOwner) {
        context.current += 1; operation.current = false; pendingCreate.current = null;
        setSaved(null); setItems([]); setBusy(false); setLoadingList(false); setConflict(false);
        setError(""); setMessage("Account changed. Records from the previous session have been cleared from this tab.");
        callbacks.current.onAccountCleared();
      }
      owner.current = nextOwner;
      setSession(next); setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") { setRecovery(true); setAccountOpen(true); }
      if (event === "SIGNED_OUT") setRecovery(false);
    });
    void client.auth.getSession().then(({ error: authError }) => {
      if (!alive) return;
      if (authError) setError("Your sign-in link could not be completed. Request a new link or sign in again.");
      setAuthReady(true);
    }).catch(() => { if (alive) { setAuthReady(true); setError("Could not check your account. You can keep working locally."); } });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  function current(capturedOwner: string, capturedContext: number) {
    return owner.current === capturedOwner && context.current === capturedContext;
  }
  function report(e: unknown, saving = false) {
    setError(e instanceof Error ? e.message : "Cloud request failed. Your local records are unchanged.");
    if (saving && e instanceof CloudRequestError && e.status === 409) setConflict(true);
  }

  async function refresh() {
    const userId = owner.current;
    if (!userId) return;
    const epoch = context.current;
    setLoadingList(true); setError("");
    try {
      const result = await cloudFetch<{ workspaces: CloudWorkspaceSummary[] }>("/api/workspaces", { expectedUserId: userId });
      if (current(userId, epoch)) setItems(result.workspaces);
    } catch (e) { if (current(userId, epoch)) report(e); }
    finally { if (current(userId, epoch)) setLoadingList(false); }
  }

  useEffect(() => {
    if (accountOpen && session?.user.id) void refresh();
    // Refresh only when opening the panel or the account changes, never on record edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountOpen, session?.user.id]);

  async function save(asNew = false) {
    const userId = owner.current;
    if (!userId) { setAccountOpen(true); return; }
    if (!workspace || workspace.mode !== "personal" || operation.current) return;
    const epoch = context.current;
    operation.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const target = !asNew && saved ? saved : null;
      if (!target && !pendingCreate.current) pendingCreate.current = { id: crypto.randomUUID(), snapshot: restoreWorkspace(serializeWorkspace(workspace)) };
      const snapshot = target ? restoreWorkspace(serializeWorkspace(workspace)) : pendingCreate.current!.snapshot;
      let result: CloudWorkspaceDetail;
      try {
        result = await cloudFetch<CloudWorkspaceDetail>(target ? `/api/workspaces/${target.id}` : "/api/workspaces", {
          method: target ? "PATCH" : "POST", expectedUserId: userId,
          body: target ? { workspace: snapshot, expectedVersion: target.version } : { workspace: snapshot, id: pendingCreate.current!.id },
        });
      } catch (saveError) {
        if (target || !pendingCreate.current || !current(userId, epoch)) throw saveError;
        if (saveError instanceof CloudRequestError && saveError.status >= 400 && saveError.status < 500 && saveError.status !== 409) {
          pendingCreate.current = null; // A definite rejection did not save the snapshot; a corrected retry may use current edits.
          throw saveError;
        }
        // A lost response may hide a successful first save. Reuse its ID and verify the exact stored snapshot.
        let recovered: CloudWorkspaceDetail;
        try { recovered = await cloudFetch<CloudWorkspaceDetail>(`/api/workspaces/${pendingCreate.current.id}`, { expectedUserId: userId }); }
        catch { throw saveError; }
        if (serializeWorkspace(recovered.workspace) !== serializeWorkspace(snapshot)) throw new Error("A saved copy exists with different contents. Open your account and inspect it before saving again. Your local changes remain here.");
        result = recovered;
      }
      if (!current(userId, epoch)) return;
      pendingCreate.current = null;
      setSaved({ id: result.id, version: result.version, revision: snapshot.revision, updatedAt: result.updated_at });
      setConflict(false); setMessage("Saved to your private account. New edits still need Save to account.");
      setItems(previous => [{ id: result.id, title: snapshot.title, version: result.version, updated_at: result.updated_at }, ...previous.filter(item => item.id !== result.id)]);
    } catch (e) { if (current(userId, epoch)) report(e, true); }
    finally { if (current(userId, epoch)) { operation.current = false; setBusy(false); } }
  }

  async function open(id: string, hasUnsavedChanges: boolean) {
    const userId = owner.current;
    if (!userId || operation.current) return;
    if (hasUnsavedChanges && !window.confirm("Replace this tab's unsaved records with the saved workspace? Download a backup first to keep your current changes.")) return;
    const beforeOpen = latestWorkspace.current;
    const epoch = context.current;
    operation.current = true; setBusy(true); setError("");
    try {
      const result = await cloudFetch<CloudWorkspaceDetail>(`/api/workspaces/${id}`, { expectedUserId: userId });
      if (!current(userId, epoch)) return;
      const restored = restoreWorkspace(JSON.stringify(result.workspace));
      if (latestWorkspace.current !== beforeOpen && !window.confirm("You made more changes while this workspace was loading. Replace those changes with the saved version? Cancel to keep your changes and download a backup.")) return;
      operation.current = false; setBusy(false);
      pendingCreate.current = null;
      context.current += 1;
      setSaved({ id: result.id, version: result.version, revision: restored.revision, updatedAt: result.updated_at });
      setConflict(false); setMessage("Saved workspace opened. Changes are saved only when you choose Save to account.");
      callbacks.current.onOpen(restored); setAccountOpen(false);
    } catch (e) { if (current(userId, epoch)) report(e); }
    finally { if (current(userId, epoch)) { operation.current = false; setBusy(false); } }
  }

  async function remove(item: CloudWorkspaceSummary) {
    const userId = owner.current;
    if (!userId || operation.current) return;
    if (!window.confirm(`Delete the saved workspace “${item.title}” from your account? This cannot be undone. Download a backup first. Downloaded files are not deleted.`)) return;
    const epoch = context.current;
    operation.current = true; setBusy(true); setError("");
    try {
      await cloudFetch(`/api/workspaces/${item.id}`, { method: "DELETE", body: { expectedVersion: item.version }, expectedUserId: userId });
      if (!current(userId, epoch)) return;
      setItems(previous => previous.filter(existing => existing.id !== item.id));
      if (saved?.id === item.id) setSaved(null);
      setMessage("Saved workspace deleted. Any open copy is now local only; downloaded files are unchanged.");
    } catch (e) { if (current(userId, epoch)) report(e); }
    finally { if (current(userId, epoch)) { operation.current = false; setBusy(false); } }
  }

  async function signOut(hasUnsavedChanges: boolean) {
    const client = getSupabaseBrowser();
    if (!client || operation.current) return;
    if (!window.confirm(hasUnsavedChanges ? "Sign out and clear this tab? There are unsaved changes. Save to your account or download a backup first if you want to keep them." : "Sign out and clear this tab? Saved account workspaces and downloaded backups will remain.")) return;
    setError("");
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) report(signOutError);
    else { setAccountOpen(false); setMessage(""); }
  }

  const savedCurrent = !!workspace && !!saved && saved.revision === workspace.revision;
  return { configured: cloudConfigured, session, authReady, accountOpen, setAccountOpen, recovery, setRecovery, saved, savedCurrent, items, busy, loadingList, error, message, conflict, detach, refresh, save, open, remove, signOut };
}

export type CloudWorkspaceController = ReturnType<typeof useCloudWorkspace>;
