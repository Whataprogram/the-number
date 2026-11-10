import Link from "next/link";

export default function NotFound() {
  return <main className="landing" style={{ padding: "80px 24px", maxWidth: 760, margin: "auto" }}>
    <p className="eyebrow">THE NUMBER · 404</p><h1 style={{ margin: "24px 0" }}>That page isn’t here.</h1>
    <p>Return to your workspace to review records, open a saved file or explore the sample.</p>
    <Link className="button button-primary" style={{ marginTop: 24 }} href="/">Open The Number</Link>
  </main>;
}
