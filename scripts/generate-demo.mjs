// Generates the synthetic demo statements for "Jay's Pressure Washing" (age 17, Ohio).
// Deterministic (seeded) so the demo Number is the same every run. All data is fictional.
import { writeFileSync, mkdirSync } from "node:fs";

let seed = 20261107;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const money = (cents) => (cents / 100).toFixed(2);
const iso = (d) => d.toISOString().slice(0, 10);
const us = (d) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;

const START = Date.UTC(2026, 0, 1), END = Date.UTC(2026, 10, 6);
const DAY = 86400000;
// Jobs per week by month (Jan..Nov): pressure washing is seasonal.
// Sized to real teen businesses: e.g. a 17-year-old's lawn business expecting ~$15K a summer (WMTV, 2025),
// a high-school landscaping company's ~$11K first year (Lawn & Landscape). Target: ~$18–20K gross.
const JOBS_PER_WEEK = [0.1, 0.15, 0.5, 1.5, 2.1, 2.3, 2.3, 2.1, 1.9, 1.3, 0.6];
const CUSTOMERS = ["Linda Morris", "Dave Kessler", "Priya Shah", "Tom Becker", "Karen Ohlman", "Mike Reyes", "Sarah Lindqvist", "Greg Patel", "Amy Turner", "Bill Hendricks", "Jen Walsh", "Carlos Ruiz", "Megan Fox", "Ray Dunn", "Nina Brooks", "Steve Yoder"];
const JOB_NOTES = ["driveway wash", "house wash", "deck + patio", "house soft wash 🏠", "driveway & sidewalk", "fence wash", "gutter clean", "patio wash", "siding wash", "pressure wash job"];

const chase = [], cashapp = [], venmo = [];
let n = 0;

for (let t = START; t <= END; t += DAY) {
  const d = new Date(t), m = d.getUTCMonth();
  // Jobs
  if (rnd() < JOBS_PER_WEEK[m] / 7) {
    const amt = between(15, 45) * 1000; // $150 – $450
    const who = pick(CUSTOMERS), note = pick(JOB_NOTES), r = rnd();
    if (r < 0.48) cashapp.push({ d, amt, type: "P2P", who, note: rnd() < 0.1 ? "" : note });
    else if (r < 0.72) venmo.push({ d, amt, who, note: rnd() < 0.1 ? "🙏" : note });
    else if (r < 0.88) chase.push({ d, amt, desc: `Zelle payment from ${who.toUpperCase()}` });
    else chase.push({ d, amt: amt - Math.round(amt * 0.029 + 30), desc: "SQUARE INC DEPOSIT" });
  }
  // Business expenses (small solo operation)
  const season = m >= 3 && m <= 9;
  if (d.getUTCDay() === 6 && season && rnd() < 0.6) chase.push({ d, amt: -between(2500, 4500), desc: pick(["SPEEDWAY 9183 AMELIA OH", "SHELL OIL 5741", "MARATHON PETRO 2231", "KROGER FUEL #412"]) });
  if (season && rnd() < 0.04) chase.push({ d, amt: -between(4000, 12000), desc: pick(["THE HOME DEPOT #3812", "LOWE'S #1452", "SH SUPPLY CO - SODIUM HYPOCHLORITE"]) });
  if (d.getUTCDate() === 3 && m >= 2) chase.push({ d, amt: -3500, desc: "NEXT INSURANCE GENERAL LIAB" });
  if (d.getUTCDate() === 20) chase.push({ d, amt: -4500, desc: "VERIZON WIRELESS AUTOPAY" });
  if (m >= 2 && m <= 5 && d.getUTCDate() === 1) chase.push({ d, amt: -2500, desc: "GOOGLE ADS 8844" });
  // Personal spending
  if (rnd() < 0.08) chase.push({ d, amt: -between(900, 2400), desc: pick(["CHIPOTLE 2291", "STARBUCKS #1180", "TACO BELL 3321", "DOORDASH*MCDONALDS"]) });
  if (rnd() < 0.015) chase.push({ d, amt: -between(2000, 12000), desc: pick(["NIKE.COM", "AMAZON.COM*2K3", "STEAM GAMES", "AMC THEATRES 41", "TARGET 00012"]) });
  if (d.getUTCDate() === 12) chase.push({ d, amt: -1199, desc: "SPOTIFY USA" });
  if (rnd() < 0.025) cashapp.push({ d, amt: -between(1000, 3500), type: "P2P", who: pick(["Ethan K", "Noah P", "Luke M"]), note: pick(["pizza", "split dinner", "tickets", "gas money"]) });
  if (rnd() < 0.015) venmo.push({ d, amt: between(1500, 4000), who: pick(["Ethan K", "Noah P"]), note: pick(["pizza", "concert tickets", "split"]) });
  // Cash-out from Cash App to Chase every other Monday in season
  if (d.getUTCDay() === 1 && season && Math.floor((t - START) / (7 * DAY)) % 2 === 0) {
    const amt = between(30000, 70000);
    cashapp.push({ d, amt: -amt, type: "Cash Out", who: "Chase Checking", note: "Cash Out" });
    chase.push({ d, amt, desc: "CASH APP*CASH OUT TRANSFER FROM" });
  }
}
// One-off events
chase.push({ d: new Date(Date.UTC(2026, 2, 21)), amt: -18900, desc: "NORTHERN TOOL + EQUIPMENT - SURFACE CLEANER" });
chase.push({ d: new Date(Date.UTC(2026, 6, 14)), amt: -12000, desc: "MIKES SMALL ENGINE REPAIR - PUMP" });
venmo.push({ d: new Date(Date.UTC(2026, 4, 9)), amt: 10000, who: "Mom", note: "bday 🎂" });
cashapp.push({ d: new Date(Date.UTC(2026, 7, 2)), amt: 20000, type: "P2P", who: "Bill Hendricks", note: "" });

const sortByDate = (a, b) => a.d - b.d;
mkdirSync("public/demo", { recursive: true });
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;

writeFileSync("public/demo/chase.csv", ["Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #",
  ...chase.sort(sortByDate).map((r) => [r.amt > 0 ? "CREDIT" : "DEBIT", us(r.d), q(r.desc), money(r.amt), r.amt > 0 ? "ACH_CREDIT" : "DEBIT_CARD", "", ""].join(","))].join("\n") + "\n");

writeFileSync("public/demo/cashapp.csv", ["Transaction ID,Date,Transaction Type,Currency,Amount,Fee,Net Amount,Asset Type,Asset Price,Asset Amount,Status,Notes,Name of sender/receiver,Account",
  ...cashapp.sort(sortByDate).map((r) => [`CA${(++n).toString(36).toUpperCase()}`, `${iso(r.d)} 14:${String(between(10, 59))}:00 EDT`, r.type === "Cash Out" ? "Cash out" : r.amt > 0 ? "P2P" : "P2P", "USD", money(r.amt), "0.00", money(r.amt), "", "", "", "COMPLETE", q(r.note), q(r.who), "Your Cash"].join(","))].join("\n") + "\n");

writeFileSync("public/demo/venmo.csv", ["ID,Datetime,Type,Status,Note,From,To,Amount (total)",
  ...venmo.sort(sortByDate).map((r) => [`${4000000 + ++n}`, `${iso(r.d)}T18:${String(between(10, 59))}:00`, "Payment", "Complete", q(r.note), q(r.amt > 0 ? r.who : "Jay W."), q(r.amt > 0 ? "Jay W." : r.who), (r.amt > 0 ? "+ " : "- ") + "$" + money(Math.abs(r.amt))].map((x, i) => i === 7 ? x.replace("+ $", "").replace("- $", "-") : x).join(","))].join("\n") + "\n");

// Plaid Sandbox custom user: same activity as one checking account (internal cash-outs left out).
// Plaid convention: positive amount = money leaving the account.
const plaidTx = [
  ...chase.filter((r) => !/CASH OUT/.test(r.desc)).map((r) => ({ d: r.d, amt: r.amt, desc: r.desc })),
  ...cashapp.filter((r) => r.type !== "Cash Out").map((r) => ({ d: r.d, amt: r.amt, desc: `CASH APP ${r.amt > 0 ? "FROM" : "TO"} ${r.who.toUpperCase()}${r.note ? " - " + r.note : ""}` })),
  ...venmo.map((r) => ({ d: r.d, amt: r.amt, desc: `VENMO ${r.amt > 0 ? "FROM" : "TO"} ${r.who.toUpperCase()}${r.note ? " - " + r.note : ""}` })),
].sort(sortByDate);
writeFileSync("public/demo/plaid-custom-user.json", JSON.stringify({
  override_accounts: [{
    type: "depository", subtype: "checking", starting_balance: Number(process.env.DEMO_BALANCE || 2650),
    meta: { name: "Jay's Pressure Washing Checking" },
    transactions: plaidTx.map((r) => ({ date_transacted: iso(r.d), date_posted: iso(r.d), amount: Number((-r.amt / 100).toFixed(2)), description: r.desc, currency: "USD" })),
  }],
}, null, 2));
console.log({ plaid: plaidTx.length });
console.log({ chase: chase.length, cashapp: cashapp.length, venmo: venmo.length });
