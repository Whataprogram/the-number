# The Number: Devpost submission draft

**Tagline:** Know what's actually yours. A tax and cash coach for young business owners.

**Challenge:** #21 Variable-income budgeting, sharpened for young business owners.

## Inspiration
I run a home services business. My dad's rule was "never let the account drop below $8,000." I followed it for years and never knew why. When we ran my kind of numbers, the real answer was over $11,000, because nobody had told me about self-employment tax.

That turned out to be common. The IRS says young entrepreneurs owe self-employment tax once they net $400, at any age. At this hackathon we interviewed a young owner who gets paid mostly through Cash App, doesn't know what he owes, and said he'd "100%" pay for an app that just tells him. A judge told us he'd had the same problem selling t-shirts.

## What it does
The Number connects to the bank you already use (through Plaid) or reads Chase, Cash App and Venmo statements. Then it:
- **Sorts** every transaction into business income, business cost, personal, transfer or tax payment, with a plain-English reason for each, and asks "business or personal?" about anything it isn't sure of.
- **Calculates your Number:** federal taxes owed so far (self-employment + income tax, minus payments already made), plus one month of business costs, plus bills due soon. That's the line your accounts should never drop below.
- **Explains every line** with a "Why?" button that shows the actual math.
- **Alerts** the owner and their parent when they dip below their Number, miss an estimated tax date, or when a rule of thumb is too low.
- **Plans around the IRS's lopsided "quarters,"** which cover 3, 2, 3 and 4 months, by turning them into one monthly set-aside.
- **Sends to a CPA:** a one-page summary plus a CSV of every tagged transaction, so a young owner can graduate to a CPA without showing up with a shoebox.

## How we built it
- Next.js + TypeScript + Tailwind, deployed on Vercel.
- **Tax math is deterministic code, not AI:** integer cents and 2026 IRS parameters (standard deduction $16,100; brackets 10% to $12,400, then 12% to $50,400; Social Security wage base $184,500; SE tax 15.3% on 92.35% of net earnings), each with its source in `lib/taxConfig.ts`.
- 14 automated tests, including hand-checked tax cases and reconciliation checks: the Number equals the sum of its lines, income sums from the tagged transactions, and transfers aren't counted as income.
- Plaid Sandbox for live bank connection (Link, token exchange, `/transactions/sync`, a webhook endpoint).
- CSV parsers for Chase, Cash App and Venmo exports.
- Design guided by the UI/UX Pro Max skill (trust blue + profit green, mobile-first).

## Real vs. mocked
| Piece | Status |
|---|---|
| Demo statements (Jay, 17, pressure washing) | Synthetic, seeded generator, fictional people |
| Bank connection | Real Plaid API in Sandbox (test data). Production banks need Plaid approval |
| Tax rules | Real 2026 IRS parameters with sources |
| Text alerts | Shown in-app; SMS delivery not wired up yet |

## Challenges we ran into
Deciding who it's for. We went through deal diligence, covenant monitoring and accountant onboarding before landing on the user we actually are: the young owner with no accountant. Also keeping AI out of the math so every number is reproducible.

## Accomplishments we're proud of
A working product a 16-year-old can understand in 60 seconds, with numbers a CPA can trace line by line.

## What we learned
Taxes are mostly math. The hard part is that nobody explains them to people who start earning young.

## What's next
Real SMS alerts, state taxes, one-tap estimated payments, payment-app connections, and partnerships with entrepreneurship programs and small CPA firms.

## Business model
Free to see your Number. $49.99 per tax year for alerts, sorting, parent view and CPA export (no monthly subscription). Referral fees from small CPA firms that want organized young clients.

## Built with
nextjs, typescript, tailwindcss, plaid, vercel, vitest

**Disclaimer:** Educational estimate, not tax advice.
