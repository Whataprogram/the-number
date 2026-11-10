import type { FederalEstimate } from './tax';

export type Treatment = 'review' | 'income' | 'expense' | 'personal' | 'transfer' | 'tax_payment' | 'unsupported';
export type ExpenseCategory = 'supplies' | 'advertising' | 'fees' | 'software' | 'other';
export interface LedgerRow {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  source: string;
  sourceId?: string;
  batchId?: string;
  treatment: Treatment;
  reviewed: boolean;
  expenseCategory?: ExpenseCategory;
  paymentYear?: number;
  paymentPurpose?: 'estimated' | 'balance' | 'other';
  note?: string;
}
export interface WorkspaceProfile {
  taxYear: number;
  throughDate: string;
  adultUS: boolean;
  singleSoleProprietor: boolean;
  noOtherIncome: boolean;
  notDependent: boolean;
  cashBasis: boolean;
  coverageComplete: boolean;
}
export interface ImportBatch { id: string; name: string; fingerprint: string; }
export interface Workspace {
  schemaVersion: 1;
  id: string;
  mode: 'sample' | 'personal';
  title: string;
  profile: WorkspaceProfile;
  rows: LedgerRow[];
  imports: ImportBatch[];
  revision: number;
}
export interface EstimateBlocker { code: string; message: string; rowId?: string; }
export interface WorkspaceResult {
  status: 'ready' | 'blocked';
  blockers: EstimateBlocker[];
  unresolvedCount: number;
  incomeCents: number;
  costsCents: number;
  profitCents: number;
  paymentsCents: number;
  federal: FederalEstimate | null;
  remainingCents: number | null;
  excessCents: number | null;
  ruleVersion: string;
  reviewStatus: string;
}
