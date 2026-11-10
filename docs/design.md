# Design direction

The user requested a cleaner dark design and specifically asked for 21st.dev while preserving The Number name and logo. The interface adapts public patterns from these references, reviewed November 10, 2026:

- [Finance Bento, Roman Vasnev](https://21st.dev/@romanvasnev/components/finance-bento): prominent financial headline, subordinate totals and responsive card hierarchy. The page lists MIT licensing.
- [Adjustable Glass Dashboard, Automate Flows](https://21st.dev/@automate_flows/components/adjustable-glass-dashboard): warm charcoal and sage surfaces, searchable activity and separate reports.

The signed-in Adjustable Glass Dashboard source was reviewed with one free source view. Its accessible progress-bar pattern and subtle inset panel highlights were adapted in `components/ReviewProgress.tsx` and `app/globals.css`. The MIT attribution and license are preserved in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). The complete dashboard and its animation dependencies are not bundled. Finance Bento remains a visual reference. No 21st.dev runtime dependency is required. This is not an endorsement by 21st.dev or its authors.

The original number-mark icon remains. Geist and Geist Mono are served locally. Sage emphasizes primary actions and resolved work; amber identifies reviews. Large amounts establish the hierarchy; smaller reconciled lines explain the amount. Overview, Transactions and Reports are the only workspace sections. Import and manual entry are visible actions.

The sample is labeled throughout. Personal mode makes bookkeeping available and explains the tax review gate. Empty, invalid-import, unresolved, out-of-scope and successful states belong to one design system. No animated trading charts, random balances, bank logos implying integrations or invented testimonials were added.

Records stay in page memory; uncertain treatment needs a decision. Motion respects reduced-motion preferences. Print styles remove navigation and expose the sample assumptions and rule version.
