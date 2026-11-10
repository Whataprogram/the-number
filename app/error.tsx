"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="landing" style={{ padding: "80px 24px", maxWidth: 760, margin: "auto" }}>
    <p className="eyebrow">THE NUMBER</p><h1 style={{ margin: "24px 0" }}>Something interrupted this view.</h1>
    <p>Try opening it again. Your last cloud save and downloaded backups are separate from this page; unsaved changes may need to be restored.</p>
    <button className="button button-primary" style={{ marginTop: 24 }} onClick={reset}>Try again</button>
  </main>;
}
