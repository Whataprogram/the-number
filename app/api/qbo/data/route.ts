import { cookies } from "next/headers";
import { plToTxns, qboBase } from "@/lib/qbo";
import { TAX_YEAR } from "@/lib/taxConfig";

// Step 3: read this year's Profit & Loss (by month) and turn it into entries the tax engine uses.
export async function GET() {
  const at = cookies().get("qbo_at")?.value, realm = cookies().get("qbo_realm")?.value;
  if (!at || !realm) return Response.json({ error: "QuickBooks isn't connected. Connect it again." }, { status: 401 });
  const today = new Date().toISOString().slice(0, 10);
  const q = new URLSearchParams({ start_date: `${TAX_YEAR}-01-01`, end_date: today, summarize_column_by: "Month", accounting_method: "Cash", minorversion: "75" });
  const r = await fetch(`${qboBase()}/v3/company/${encodeURIComponent(realm)}/reports/ProfitAndLoss?${q}`, { headers: { Authorization: `Bearer ${at}`, Accept: "application/json" }, cache: "no-store" });
  if (!r.ok) return Response.json({ error: `QuickBooks said ${r.status}. Try connecting again.` }, { status: 502 });
  const report = await r.json();
  return Response.json({ txns: plToTxns(report, today) });
}
