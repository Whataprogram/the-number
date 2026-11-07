import { toCents } from "./tax";
import type { Txn } from "./types";

// Small RFC-4180 CSV parser (quotes, escaped quotes, commas/newlines inside quotes).
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((v) => v.trim() !== "")) rows.push(row); }
  if (rows.length < 2) throw new Error("This file has no transactions. Export a CSV with a header row and at least one transaction.");
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const isoDate = (v: string) => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  throw new Error(`Unrecognized date: ${v}`);
};

// Normalize a bank / Cash App / Venmo export into raw transactions (unclassified).
export function normalize(text: string, fileName = "statement.csv"): Omit<Txn, "kind" | "reason">[] {
  const recs = parseCSV(text);
  const h = Object.keys(recs[0]);
  const has = (k: string) => h.includes(k);
  if (has("Posting Date") && has("Description") && has("Amount")) {
    return recs.map((r, i) => ({
      id: `chase-${i}`, source: "Chase", date: isoDate(r["Posting Date"]), description: r["Description"],
      counterparty: r["Description"], amountCents: toCents(r["Amount"]),
    }));
  }
  if (has("Transaction ID") && has("Net Amount")) {
    return recs.map((r) => ({
      id: `cashapp-${r["Transaction ID"]}`, source: "Cash App", date: isoDate(r["Date"]),
      description: r["Notes"] || r["Transaction Type"], counterparty: r["Name of sender/receiver"],
      amountCents: toCents(r["Net Amount"]),
    }));
  }
  if (has("Datetime") && has("Amount (total)")) {
    return recs.map((r) => ({
      id: `venmo-${r["ID"]}`, source: "Venmo", date: isoDate(r["Datetime"]), description: r["Note"],
      counterparty: toCents(r["Amount (total)"]) > 0 ? r["From"] : r["To"], amountCents: toCents(r["Amount (total)"]),
    }));
  }
  if (has("date") && has("description") && has("amount")) {
    return recs.map((r, i) => ({
      id: `generic-${i}`, source: r["account"] || fileName, date: isoDate(r["date"]), description: r["description"],
      counterparty: r["counterparty"] || r["description"], amountCents: toCents(r["amount"]),
    }));
  }
  throw new Error(`We couldn't read ${fileName}. Supported: Chase, Cash App, Venmo exports, or a CSV with date, description, amount columns.`);
}
