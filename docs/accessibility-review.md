# Accessibility and responsive source review

Reviewed November 10, 2026. Scope: `WorkspaceApp.tsx`, `AccountPanel.tsx`, `use-cloud-workspace.ts` and `globals.css` in the separate rebuild. This is a source review with computed color contrast, not a browser or assistive-technology certification. Browser checks below still need execution on the final deployed build.

## Findings and status

| Priority | Finding | Evidence and remedy | Status at handoff |
| --- | --- | --- | --- |
| P1 | Mobile backup button had no accessible name | At widths at or below 580 px, `.header-actions > .button > span` is hidden. The backup button originally had no other name. Added `aria-label="Back up workspace"`. | Fix verified in source. |
| P1 | Invisible file controls appeared in keyboard order | Both file inputs used clipping through `.visually-hidden` but remained focusable. Added `tabIndex={-1}`; visible import/restore buttons remain keyboard accessible. | Fix verified in source. |
| P2 | Selected decisions were conveyed only visually | Record filters, duplicate Keep/Skip buttons and account mode choices used CSS classes alone. Added `aria-pressed` to expose their selection. | Fix verified in source. |
| P2 | Closing inline panels lost keyboard position | Row editor, settings and account panel unmounted the focused control. Cleanup now restores the opener when connected, otherwise the workspace heading/home button. | Fix verified in source; check actual keyboard behavior after saves/deletes. |
| P2 | Explicit smooth scrolling ignored reduced motion | Review action called `scrollTo` with `behavior: "smooth"` regardless of preference. It now checks `prefers-reduced-motion`. | Fix verified in source. |
| P2 | Browser printing could yield a blank document | `PrintReport` originally returned null for personal workspaces and blocked samples, while print CSS hid all regular workspace children. It now renders a records-only report in those states, with no tax amounts. | Fix verified in source; print preview still needs browser verification. |
| P2 | Opening privacy information may appear ineffective | The top landing-page privacy button reveals a panel near the bottom. `Privacy` has no focus-on-open behavior, unlike settings/account. Move focus to its heading on open and return it on close; reflect expanded state on the opener. | Reported to root; verify final implementation. |
| P2 | Long workspace names lacked a wrapping safeguard | A restored name can contain 200 characters. Added `min-width: 0` on the heading container and `overflow-wrap: anywhere` on the name; print headings and paragraphs wrap too. | Fix verified in source; rendered overflow still needs a 320 px test. |

## Contrast calculations

Ratios were calculated from the actual CSS hex values using sRGB relative luminance. These are solid-color calculations; transparent layers and rendered states still need a browser check.

| Foreground | Background | Contrast |
| --- | --- | --- |
| Main text `#f2f4ed` | Page `#10130f` | 16.88:1 |
| Muted text `#a9b0a3` | Page `#10130f` | 8.40:1 |
| Subtle text `#818b7c` | Page `#10130f` | 5.27:1 |
| Subtle text `#818b7c` | Panel `#191d17` | 4.81:1 |
| Subtle text `#818b7c` | Raised panel `#22271e` | 4.30:1 |
| Placeholder `#7d8975` | Input `#10150e` | 5.03:1 |
| Sage `#c7e5aa` | Page `#10130f` | 13.56:1 |
| Amber `#e8c68b` | Page `#10130f` | 11.48:1 |

The main palette is readable by calculation. Avoid using subtle small text on the raised panel without increasing its contrast. This is a guardrail, not a claim that such a failing combination is currently rendered.

## Checks supported by source

Form controls have wrapping labels; amounts use tabular numerals; errors and success messages use alert/status roles. The primary navigation exposes its current view. Statuses have visible words as well as colors. Record descriptions, sources, large amounts, imported file headings and saved workspace names already have wrapping rules. Mobile forms use 16 px control text. CSS disables transitions/animations under reduced motion. Clearing, replacing and deleting records/workspaces require explicit confirmations that describe local, saved and downloaded copies separately.

## Required final browser checks

1. At 320, 375, 768 and desktop widths, test landing, account, import preview, duplicate decisions, record editor, overview and reports. Measure horizontal overflow with long names/descriptions and the maximum accepted amount.
2. Use only the keyboard to open/close every inline panel, import, review, save, cancel and remove a row. Confirm visible focus returns to a useful location. Check a removed row's fallback focus.
3. Check screen-reader names and pressed/current states for mobile icon actions, record filters and duplicate decisions. Confirm errors are announced once and the saved state updates without stealing focus.
4. Print a ready sample, blocked sample and personal workspace. Confirm the latter two never produce a blank document or an implied tax estimate. Test a long description in the printed ledger.
5. Load 5,000 rows and use search/review. The source currently maps all matching rows into the DOM. Measure responsiveness and keyboard traversal; if it becomes difficult, page the ledger into bounded groups while retaining all records in export. No performance result is claimed by this review.
6. Verify 200% zoom, increased text size and reduced motion. Some mobile metadata is 8–10 px; check readability on a physical phone, particularly the saved/unsaved status and source provenance.

The findings were sent to the UI owner and root while implementation was active. Recheck this document against the final code before treating any remaining item as closed.
