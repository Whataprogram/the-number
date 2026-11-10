import { describe, expect, it } from 'vitest';
import { exportLedgerCSV, findDuplicates, MAX_FILE_BYTES, parseCSV, restoreWorkspace, serializeWorkspace } from '../lib/workspace-io';
import type { LedgerRow, Workspace } from '../lib/workspace-types';

const input = 'date,description,amount,account,transaction_id\n2026-10-01,House wash,350.25,Checking,bank-1\n';
const row = (change: Partial<LedgerRow> = {}): LedgerRow => ({ id: 'one', date: '2026-10-01', description: 'Cash job', amountCents: 35025, source: 'Manual', treatment: 'income', reviewed: true, ...change });
const workspace = (change: Partial<Workspace> = {}): Workspace => ({
  schemaVersion: 1, id: 'workspace-one', mode: 'personal', title: 'My records', revision: 2,
  profile: { taxYear: 2026, throughDate: '2026-11-10', adultUS: true, singleSoleProprietor: true, noOtherIncome: true, notDependent: true, cashBasis: true, coverageComplete: true },
  rows: [row()], imports: [], ...change,
});

describe('supported CSV intake', () => {
  it('uses exact cents and stable account-scoped external identity without classifying merchants', () => {
    const first = parseCSV(input, 'first.csv');
    const second = parseCSV(input, 'another-name.csv');
    expect(first.errors).toEqual([]);
    expect(first.rows[0]).toMatchObject({ amountCents: 35025, source: 'Checking', sourceId: 'bank-1', treatment: 'review', reviewed: false });
    expect(second.rows[0].id).toBe(first.rows[0].id);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(parseCSV(input.replace('Checking', 'Savings')).rows[0].id).not.toBe(first.rows[0].id);
  });

  it('handles BOM, CRLF, quoted commas/newlines and escaped quotation marks', () => {
    const p = parseCSV('\uFEFFdate,description,amount\r\n2026-02-28,"Wash, rear patio\r\nwith ""extra"" work",+100.01\r\n');
    expect(p.errors).toEqual([]);
    expect(p.rows[0]).toMatchObject({ description: 'Wash, rear patio\nwith "extra" work', amountCents: 10001 });
  });

  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '10/01/2026', '2026-1-01', '2026-10-01T00:00:00Z'])('rejects invalid or noncanonical date %s atomically', (date) => {
    const p = parseCSV(input + `${date},Bad row,1,Checking,bank-2\n`);
    expect(p.rows).toEqual([]);
    expect(p.errors[0]).toMatchObject({ row: 3 });
  });

  it('accepts leap-day without timezone conversion', () => {
    const p = parseCSV('date,description,amount\n2024-02-29,Prior record,10.00\n');
    expect(p.rows[0].date).toBe('2024-02-29');
  });

  it.each(['1e6', 'NaN', 'Infinity', '', '$100', '12.345', '9007199254740993', '10000000000.01', '1,000', '0', '-0.00'])('rejects unsupported money %s', (amount) => {
    const p = parseCSV(`date,description,amount\n2026-10-01,Job,"${amount}"\n`);
    expect(p.rows).toEqual([]);
    expect(p.errors.length).toBeGreaterThan(0);
  });

  it('keeps negative cents instead of rounding them to zero', () => {
    const p = parseCSV('date,description,amount\n2026-10-01,Cost,-0.01\n');
    expect(p.rows.map((r) => r.amountCents)).toEqual([-1]);
  });

  it.each([
    'date,description,amount\n2026-10-01,"Missing close,1',
    'date,description,amount\n2026-10-01,A"bad quote,1',
    'date,description,amount\n2026-10-01,"closed"junk,1',
    'date,description,amount\n2026-10-01,Too,few,1',
    'date,amount\n2026-10-01,1',
    'date,description,amount,amount\n2026-10-01,Job,1,1',
    'date,description,amount,status\n2026-10-01,Job,1,ready',
    '', 'date,description,amount\n',
  ])('reports malformed input without partial import', (csv) => {
    const p = parseCSV(csv);
    expect(p.rows).toEqual([]);
    expect(p.errors.length).toBeGreaterThan(0);
  });

  it('reports physical line numbers after a multiline quoted record', () => {
    const p = parseCSV('date,description,amount\n2026-10-01,"two\nlines",1\n2026-02-30,Invalid,2\n');
    expect(p.errors[0].row).toBe(4);
  });

  it('enforces 5000 records and byte-aware 5 MB bounds', () => {
    const header = 'date,description,amount\n';
    const dataRow = '2026-10-01,Job,1\n';
    expect(parseCSV(header + dataRow.repeat(5000)).rows).toHaveLength(5000);
    expect(parseCSV(header + dataRow.repeat(5001)).rows).toEqual([]);
    expect(parseCSV('a'.repeat(MAX_FILE_BYTES + 1)).errors[0].message).toMatch(/5 MB/);
    expect(parseCSV('€'.repeat(Math.floor(MAX_FILE_BYTES / 2))).errors[0].message).toMatch(/5 MB/);
  });

  it('keeps distinct internal IDs for repeated external IDs within a file', () => {
    const p = parseCSV(input + '2026-10-01,House wash,350.25,Checking,bank-1\n');
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0].id).not.toBe(p.rows[1].id);
    expect(findDuplicates([], p.rows)[0]).toMatchObject({ incomingId: p.rows[1].id, existingId: p.rows[0].id });
  });
});

describe('duplicate candidates preserve financial events', () => {
  it('detects stable external identity even when bank description/amount changes', () => {
    const old = row({ source: 'Checking', sourceId: '123' });
    const incoming = row({ id: 'two', source: 'Checking', sourceId: '123', description: 'Changed', amountCents: 45025 });
    expect(findDuplicates([old], [incoming])[0].reason).toMatch(/transaction ID/);
  });

  it('flags manual versus imported economic event without automatically deleting either', () => {
    const manual = row({ id: 'manual-payment', description: 'Estimated payment', amountCents: -100000, treatment: 'tax_payment', paymentYear: 2026, paymentPurpose: 'estimated' });
    const imported = row({ id: 'bank-payment', description: 'US Treasury', amountCents: -100000, source: 'Checking', sourceId: 'payment-1', treatment: 'review', reviewed: false });
    const actual = [imported];
    expect(findDuplicates([manual], actual)[0]).toMatchObject({ incomingId: 'bank-payment', existingId: 'manual-payment' });
    expect(actual).toHaveLength(1);
  });

  it('never treats identical-looking jobs with distinct external IDs as automatic duplicates', () => {
    const rows = [row({ id: 'a', source: 'Checking', sourceId: 'a' }), row({ id: 'b', source: 'Checking', sourceId: 'b' })];
    expect(findDuplicates([], rows)[0].reason).toMatch(/may be separate/);
    expect(rows).toHaveLength(2);
  });

  it('bounds candidate growth when many legitimate transactions share a date/amount', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => row({ id: String(i) }));
    expect(findDuplicates([], rows)).toHaveLength(4999);
  });
});

describe('workspace files and record exports', () => {
  it('roundtrips primitive records/profile/current decisions, with no derived financial output', () => {
    const w = workspace();
    const serialized = serializeWorkspace(w);
    expect(restoreWorkspace(serialized)).toEqual(w);
    expect(serialized).not.toContain('totalTaxCents');
    expect(serialized).not.toContain('ready');
  });

  it('never trusts uploaded sample mode to enable a tax-policy bypass', () => {
    const w = workspace({ mode: 'sample' });
    const restored = restoreWorkspace(serializeWorkspace(w));
    expect(restored.mode).toBe('personal');
    expect(restored.rows).toEqual(w.rows);
  });

  it.each(['ready', 'isEligible', 'computed', 'federal', 'result', '__proto__'])('rejects fabricated derived field %s', (field) => {
    const raw = serializeWorkspace(workspace());
    const tampered = raw.slice(0, -1) + `,"${field}":true}`;
    expect(() => restoreWorkspace(tampered)).toThrow(/unsupported field/);
  });

  it('rejects invalid primitive types and treatment codes instead of coercing', () => {
    expect(() => restoreWorkspace(JSON.stringify(workspace({ rows: [row({ amountCents: '35025' as unknown as number })] })))).toThrow(/whole number/);
    expect(() => restoreWorkspace(JSON.stringify(workspace({ rows: [row({ amountCents: 1.5 })] })))).toThrow(/whole number/);
    expect(() => restoreWorkspace(JSON.stringify(workspace({ rows: [row({ treatment: 'IRS-approved' as LedgerRow['treatment'] })] })))).toThrow(/unsupported value/);
    const badProfile = workspace();
    (badProfile.profile as unknown as Record<string, unknown>).coverageComplete = 'true';
    expect(() => restoreWorkspace(JSON.stringify(badProfile))).toThrow(/true or false/);
  });

  it('rejects inconsistent reviewed records and missing designated payment details', () => {
    expect(() => restoreWorkspace(JSON.stringify(workspace({ rows: [row({ amountCents: 0, treatment: 'review', reviewed: false })] })))).toThrow(/nonzero/);
    expect(() => restoreWorkspace(JSON.stringify(workspace({ rows: [row({ amountCents: -100 })] })))).toThrow(/direction/);
    expect(() => restoreWorkspace(JSON.stringify(workspace({ rows: [row({ amountCents: -100, treatment: 'expense' })] })))).toThrow(/expense category/);
    expect(() => restoreWorkspace(JSON.stringify(workspace({ rows: [row({ amountCents: -100, treatment: 'tax_payment' })] })))).toThrow(/payment year/);
  });

  it('retains unresolved records without manufacturing a Ready state', () => {
    const w = workspace({ rows: [row({ treatment: 'unsupported', reviewed: false })] });
    expect(restoreWorkspace(serializeWorkspace(w)).rows[0]).toMatchObject({ treatment: 'unsupported', reviewed: false });
  });

  it('rejects duplicate internal IDs, future schema, unsupported tax year and corrupt JSON', () => {
    expect(() => restoreWorkspace(JSON.stringify(workspace({ rows: [row(), row()] })))).toThrow(/repeats/);
    expect(() => restoreWorkspace(JSON.stringify({ ...workspace(), schemaVersion: 2 }))).toThrow(/version/);
    expect(() => restoreWorkspace(JSON.stringify({ ...workspace(), profile: { ...workspace().profile, taxYear: 2027 } }))).toThrow(/2026/);
    expect(() => restoreWorkspace('{"schemaVersion":1')).toThrow(/not valid/);
    expect(() => restoreWorkspace('a'.repeat(MAX_FILE_BYTES + 1))).toThrow(/5 MB/);
  });

  it('exports safe text, signed numeric amounts, coverage/mode and unresolved flags', () => {
    const w = workspace({ mode: 'sample', rows: [row({ description: ' \t=HYPERLINK("https://example.test")', amountCents: -4250, source: '@SUM(A1)', treatment: 'review', reviewed: false, note: '\tunsafe' })] });
    const csv = exportLedgerCSV(w);
    expect(csv).toContain('"\' \t=HYPERLINK(""https://example.test"")"');
    expect(csv).toContain(',-42.50,');
    expect(csv).toContain('"\'@SUM(A1)"');
    expect(csv).toContain('"\'\tunsafe"');
    expect(csv).toContain('"review","false"');
    expect(csv).toContain('"sample",2026,"2026-11-10","true"');
    expect(csv).toContain('record_issues,workspace_issues,tax_status,rule_version');
    expect(csv).toContain('Confirm the financial treatment');
    expect(csv).toContain('"blocked"');
  });

  it('includes model-known duplicate-source blockers even when rows claim reviewed', () => {
    const w = workspace({ rows: [row({ id: 'a', source: 'Checking', sourceId: 'same' }), row({ id: 'b', source: 'Checking', sourceId: 'same' })] });
    expect(exportLedgerCSV(w)).toContain('Two records share a source transaction ID');
  });
});
