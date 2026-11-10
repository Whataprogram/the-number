import type { ExpenseCategory, LedgerRow, Treatment, Workspace, WorkspaceProfile } from './workspace-types';
import { calculateWorkspace } from './engine';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;
export const MAX_AMOUNT_CENTS = 1_000_000_000_000;
const MAX_TEXT = 2000;
const treatments: Treatment[] = ['review', 'income', 'expense', 'personal', 'transfer', 'tax_payment', 'unsupported'];
const categories: ExpenseCategory[] = ['supplies', 'advertising', 'fees', 'software', 'other'];
const purposes = ['estimated', 'balance', 'other'] as const;

export interface ImportError { row: number; message: string; }
export interface CSVPreview { rows: LedgerRow[]; errors: ImportError[]; fingerprint: string; }
export interface DuplicateCandidate { incomingId: string; existingId: string; reason: string; }

function withinFileLimit(text: string): boolean {
  return text.length <= MAX_FILE_BYTES && new TextEncoder().encode(text).byteLength <= MAX_FILE_BYTES;
}

// A repeat-file hint, not a cryptographic integrity or authenticity check.
function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
}

export function isISODate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  if (y < 1900 || y > 2100 || m < 1 || m > 12) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return d >= 1 && d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

function parseAmount(value: string): number | null {
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^[+-]/, '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents === 0 || cents > MAX_AMOUNT_CENTS) return null;
  return negative ? -cents : cents;
}

interface CSVRecord { fields: string[]; line: number; }

function readCSV(text: string): { records: CSVRecord[]; errors: ImportError[] } {
  const records: CSVRecord[] = [];
  const errors: ImportError[] = [];
  let fields: string[] = [], field = '', quoted = false, closed = false, line = 1, rowLine = 1;
  const finishField = () => { fields.push(field); field = ''; closed = false; };
  const finishRow = () => {
    finishField();
    if (fields.some((v) => v.trim() !== '')) records.push({ fields, line: rowLine });
    fields = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else {
        if (c === '\r' || c === '\n') {
          if (c === '\r' && text[i + 1] === '\n') i++;
          field += '\n'; line++;
        } else field += c;
      }
    } else if (c === ',') finishField();
    else if (c === '\r' || c === '\n') {
      finishRow();
      if (c === '\r' && text[i + 1] === '\n') i++;
      line++; rowLine = line;
      if (records.length > MAX_ROWS + 1) return { records: [], errors: [{ row: rowLine, message: `Use a file with at most ${MAX_ROWS.toLocaleString('en-US')} transactions.` }] };
    } else if (c === '"' && field.length === 0 && !closed) quoted = true;
    else if (c === '"' || (closed && c.trim() !== '')) {
      return { records: [], errors: [{ row: line, message: 'Invalid quotation marks. Quote the entire field and double any quotation marks inside it.' }] };
    } else if (!closed) field += c;
    if (field.length > MAX_TEXT) return { records: [], errors: [{ row: rowLine, message: `A field exceeds ${MAX_TEXT} characters.` }] };
    if (fields.length > 5) return { records: [], errors: [{ row: rowLine, message: 'Too many columns. Use date, description, amount, and optional account and transaction_id.' }] };
  }
  if (quoted) errors.push({ row: rowLine, message: 'An opening quotation mark has no closing quotation mark.' });
  else if (field !== '' || fields.length || closed) finishRow();
  return { records, errors };
}

/** Strict template import. Every failure is atomic: rows is empty if any error exists. */
export function parseCSV(text: string, fileName = 'transactions.csv'): CSVPreview {
  if (!withinFileLimit(text)) return { rows: [], errors: [{ row: 0, message: 'File is too large. Maximum size is 5 MB.' }], fingerprint: '' };
  if (text.includes('\u0000')) return { rows: [], errors: [{ row: 0, message: 'The file contains invalid null characters. Export a UTF-8 CSV and try again.' }], fingerprint: '' };
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const digest = fingerprint(normalized);
  const { records, errors } = readCSV(normalized);
  const fail = (row: number, message: string) => errors.push({ row, message });
  if (!records.length && !errors.length) fail(1, 'The file is empty. Start with the downloadable CSV template.');
  if (errors.length) return { rows: [], errors, fingerprint: digest };
  const header = records[0].fields.map((v) => v.trim().toLowerCase());
  const allowed = ['date', 'description', 'amount', 'account', 'transaction_id'];
  if (new Set(header).size !== header.length) fail(1, 'Each column name must appear only once.');
  const missing = ['date', 'description', 'amount'].filter((name) => !header.includes(name));
  if (missing.length) fail(1, `Missing required columns: ${missing.join(', ')}.`);
  const unknown = header.filter((name) => !allowed.includes(name));
  if (unknown.length) fail(1, `Unsupported columns: ${unknown.map((name) => name || '(blank)').join(', ')}. Use the CSV template; use a workspace JSON to restore reviewed work.`);
  if (records.length < 2) fail(2, 'The file has a header but no transactions.');
  if (records.length - 1 > MAX_ROWS) fail(0, `Maximum ${MAX_ROWS.toLocaleString('en-US')} transactions per file.`);
  if (errors.length) return { rows: [], errors, fingerprint: digest };
  const rows: LedgerRow[] = [];
  const occurrences = new Map<string, number>();
  let absoluteTotal = 0;
  for (let i = 1; i < records.length; i++) {
    const { fields, line } = records[i];
    if (fields.length !== header.length) { fail(line, `Expected ${header.length} columns; found ${fields.length}.`); continue; }
    const values = Object.fromEntries(header.map((name, index) => [name, fields[index].trim()]));
    const before = errors.length;
    if (!isISODate(values.date)) fail(line, 'Date must be a real calendar date in YYYY-MM-DD format.');
    if (!values.description) fail(line, 'Description is required.');
    const cents = parseAmount(values.amount);
    if (cents === null) fail(line, 'Amount must be nonzero signed USD dollars with at most two decimals, no currency symbols or exponent, and at most $10,000,000,000.');
    const source = values.account || 'Unspecified account';
    if (source.length > 160) fail(line, 'Account name must be at most 160 characters.');
    if ((values.transaction_id || '').length > 160) fail(line, 'Transaction ID must be at most 160 characters.');
    if (errors.length !== before || cents === null) continue;
    absoluteTotal += Math.abs(cents);
    if (!Number.isSafeInteger(absoluteTotal)) { fail(line, 'Total transaction amounts exceed the safe calculation limit.'); continue; }
    const base = values.transaction_id ? `external:${JSON.stringify([source, values.transaction_id])}` : `csv:${digest}:${i}`;
    const occurrence = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, occurrence);
    rows.push({
      id: occurrence === 1 ? base : `${base}:occurrence:${occurrence}`,
      date: values.date, description: values.description, amountCents: cents, source,
      ...(values.transaction_id ? { sourceId: values.transaction_id } : {}),
      batchId: `import-${digest}`, treatment: 'review', reviewed: false,
    });
  }
  // fileName belongs in the caller's ImportBatch; no filename controls financial treatment.
  void fileName;
  return { rows: errors.length ? [] : rows, errors, fingerprint: digest };
}

/** Flags one representative match per incoming row, including within the incoming batch. Never removes rows. */
export function findDuplicates(existing: LedgerRow[], incoming: LedgerRow[]): DuplicateCandidate[] {
  const ids = new Map<string, LedgerRow>(), external = new Map<string, LedgerRow>(), amounts = new Map<string, LedgerRow>();
  const sourceKey = (r: LedgerRow) => JSON.stringify([r.source, r.sourceId]);
  const amountKey = (r: LedgerRow) => `${r.date}|${r.amountCents}`;
  const add = (r: LedgerRow) => {
    if (!ids.has(r.id)) ids.set(r.id, r);
    if (r.sourceId && !external.has(sourceKey(r))) external.set(sourceKey(r), r);
    if (!amounts.has(amountKey(r))) amounts.set(amountKey(r), r);
  };
  existing.forEach(add);
  const candidates: DuplicateCandidate[] = [];
  for (const row of incoming) {
    const sameExternal = row.sourceId ? external.get(sourceKey(row)) : undefined;
    const sameId = ids.get(row.id);
    const possible = amounts.get(amountKey(row));
    const match = sameExternal || sameId || possible;
    if (match) candidates.push({ incomingId: row.id, existingId: match.id, reason: sameExternal
      ? 'Same account and transaction ID. Link or replace this record; do not count the same event twice.'
      : sameId ? 'This imported record already exists.'
      : 'Same date and amount. These may be separate transactions; compare the records before keeping both.' });
    add(row);
  }
  return candidates;
}

function quoted(value: string): string { return `"${value.replace(/"/g, '""')}"`; }
function csvText(value: string): string {
  // Prefix even if a formula marker is hidden after whitespace. Quote alone is insufficient.
  return quoted(/^[\s\uFEFF]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value);
}
function dollars(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** A records packet, not a tax-return form or a restorable workspace. */
export function exportLedgerCSV(workspace: Workspace): string {
  const w = validateWorkspace(workspace);
  const result = calculateWorkspace(w);
  const workspaceIssues = result.blockers.filter((b) => !b.rowId).map((b) => b.message).join('; ');
  const header = ['date', 'description', 'amount', 'account', 'transaction_id', 'treatment', 'reviewed', 'expense_category', 'payment_year', 'payment_purpose', 'note', 'data_mode', 'tax_year', 'through_date', 'coverage_confirmed', 'record_issues', 'workspace_issues', 'tax_status', 'rule_version'];
  const lines = w.rows.map((r) => [csvText(r.date), csvText(r.description), dollars(r.amountCents), csvText(r.source), csvText(r.sourceId || ''), csvText(r.treatment), csvText(String(r.reviewed)), csvText(r.expenseCategory || ''), r.paymentYear === undefined ? '' : String(r.paymentYear), csvText(r.paymentPurpose || ''), csvText(r.note || ''), csvText(w.mode), String(w.profile.taxYear), csvText(w.profile.throughDate), csvText(String(w.profile.coverageComplete)), csvText(result.blockers.filter((b) => b.rowId === r.id).map((b) => b.message).join('; ')), csvText(workspaceIssues), csvText(result.status), csvText(result.ruleVersion)].join(','));
  return '\uFEFF' + [header.join(','), ...lines].join('\r\n') + '\r\n';
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], path: string) {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) throw new Error(`${path} contains an unsupported field: ${extra}. Use a supported workspace file, not a calculated result.`);
}
function string(value: unknown, path: string, max = MAX_TEXT, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max || value.includes('\u0000')) throw new Error(`${path} must be ${empty ? 'text' : 'nonempty text'} of at most ${max} characters.`);
  return value;
}
function integer(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${path} must be a whole number between ${min} and ${max}.`);
  return value;
}
function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be true or false.`);
  return value;
}
function date(value: unknown, path: string): string {
  const result = string(value, path, 10);
  if (!isISODate(result)) throw new Error(`${path} must be a real YYYY-MM-DD date.`);
  return result;
}
function choice<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) throw new Error(`${path} has an unsupported value.`);
  return value as T;
}
function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_ROWS) throw new Error(`${path} must be an array with at most ${MAX_ROWS} entries.`);
  return value;
}

function validateWorkspace(input: unknown): Workspace {
  const w = record(input, 'Workspace');
  keys(w, ['schemaVersion', 'id', 'mode', 'title', 'profile', 'rows', 'imports', 'revision'], 'Workspace');
  if (w.schemaVersion !== 1) throw new Error('This workspace version is not supported. Use a version 1 workspace.');
  const p = record(w.profile, 'Profile');
  const booleans = ['adultUS', 'singleSoleProprietor', 'noOtherIncome', 'notDependent', 'cashBasis', 'coverageComplete'] as const;
  keys(p, ['taxYear', 'throughDate', ...booleans], 'Profile');
  if (p.taxYear !== 2026) throw new Error('Only the 2026 tax-year workspace is supported by this build.');
  const profile: WorkspaceProfile = { taxYear: 2026, throughDate: date(p.throughDate, 'Through date'), ...Object.fromEntries(booleans.map((key) => [key, bool(p[key], `Profile.${key}`)])) } as WorkspaceProfile;
  const ids = new Set<string>();
  let absoluteTotal = 0;
  const rows = list(w.rows, 'Rows').map((inputRow, index): LedgerRow => {
    const path = `Record ${index + 1}`;
    const r = record(inputRow, path);
    keys(r, ['id', 'date', 'description', 'amountCents', 'source', 'sourceId', 'batchId', 'treatment', 'reviewed', 'expenseCategory', 'paymentYear', 'paymentPurpose', 'note'], path);
    const id = string(r.id, `${path} ID`, 1024);
    if (ids.has(id)) throw new Error(`${path} repeats an internal record ID. Restore was cancelled.`);
    ids.add(id);
    const amountCents = integer(r.amountCents, `${path} amount`, -MAX_AMOUNT_CENTS, MAX_AMOUNT_CENTS);
    if (amountCents === 0) throw new Error(`${path} amount must be nonzero.`);
    absoluteTotal += Math.abs(amountCents);
    if (!Number.isSafeInteger(absoluteTotal)) throw new Error('Total record amounts exceed the safe calculation limit.');
    const treatment = choice(r.treatment, treatments, `${path} treatment`);
    const reviewed = bool(r.reviewed, `${path} reviewed`);
    const expenseCategory = r.expenseCategory === undefined ? undefined : choice(r.expenseCategory, categories, `${path} expense category`);
    const paymentYear = r.paymentYear === undefined ? undefined : integer(r.paymentYear, `${path} payment year`, 1900, 2100);
    const paymentPurpose = r.paymentPurpose === undefined ? undefined : choice(r.paymentPurpose, purposes, `${path} payment purpose`);
    if (reviewed && ((treatment === 'income' && amountCents <= 0) || (['expense', 'tax_payment'].includes(treatment) && amountCents >= 0))) throw new Error(`${path} has a direction inconsistent with its reviewed treatment.`);
    if (reviewed && treatment === 'expense' && !expenseCategory) throw new Error(`${path} needs an expense category.`);
    if (reviewed && treatment === 'tax_payment' && (paymentYear === undefined || paymentPurpose === undefined)) throw new Error(`${path} needs a designated payment year and purpose.`);
    return { id, date: date(r.date, `${path} date`), description: string(r.description, `${path} description`), amountCents, source: string(r.source, `${path} account`, 160), treatment, reviewed,
      ...(r.sourceId === undefined ? {} : { sourceId: string(r.sourceId, `${path} transaction ID`, 160) }),
      ...(r.batchId === undefined ? {} : { batchId: string(r.batchId, `${path} batch ID`, 160) }),
      ...(expenseCategory === undefined ? {} : { expenseCategory }), ...(paymentYear === undefined ? {} : { paymentYear }), ...(paymentPurpose === undefined ? {} : { paymentPurpose }),
      ...(r.note === undefined ? {} : { note: string(r.note, `${path} note`, MAX_TEXT, true) }),
    };
  });
  const batchIds = new Set<string>();
  const imports = list(w.imports, 'Imports').map((inputBatch, index) => {
    const path = `Import ${index + 1}`;
    const b = record(inputBatch, path);
    keys(b, ['id', 'name', 'fingerprint'], path);
    const id = string(b.id, `${path} ID`, 160);
    if (batchIds.has(id)) throw new Error('Import IDs must be unique.');
    batchIds.add(id);
    return { id, name: string(b.name, `${path} name`, 260), fingerprint: string(b.fingerprint, `${path} fingerprint`, 128) };
  });
  return { schemaVersion: 1, id: string(w.id, 'Workspace ID', 160), mode: choice(w.mode, ['sample', 'personal'] as const, 'Workspace mode'), title: string(w.title, 'Workspace title', 200), profile, rows, imports, revision: integer(w.revision, 'Workspace revision', 0, Number.MAX_SAFE_INTEGER) };
}

export function serializeWorkspace(workspace: Workspace): string {
  const text = JSON.stringify(validateWorkspace(workspace), null, 2);
  if (!withinFileLimit(text)) throw new Error('Workspace backup exceeds 5 MB. Reduce long notes or export a smaller workspace.');
  return text;
}

/** Uploaded JSON can never activate trusted sample policy. All tax readiness is derived elsewhere. */
export function restoreWorkspace(text: string): Workspace {
  if (!withinFileLimit(text)) throw new Error('Workspace file is too large. Maximum size is 5 MB.');
  let input: unknown;
  try { input = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('This file is not valid workspace JSON. Your current records have not changed.'); }
  const w = validateWorkspace(input);
  return { ...w, mode: 'personal' };
}
