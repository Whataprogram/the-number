// Progress-bar semantics adapted from Adjustable Glass Dashboard by
// Automate Flows w/ Troy, via 21st.dev. See THIRD_PARTY_NOTICES.md (MIT).
export default function ReviewProgress({ reviewed, total }: { reviewed: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.max(0, reviewed / total * 100)) : 0;
  return <div className="progress-track" role="progressbar" aria-label="Record review progress"
    aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}
    aria-valuetext={`${reviewed} of ${total} records reviewed`}>
    <span style={{ width: `${percent}%` }} />
  </div>;
}
