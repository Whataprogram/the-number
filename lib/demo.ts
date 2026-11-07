import type { Profile } from "./types";

// Synthetic demo profile. All people, businesses and numbers are fictional.
export const DEMO_PROFILE: Profile = {
  ownerName: "Jay",
  businessName: "Jay's Pressure Washing",
  age: 17,
  state: "Ohio",
  parentRule: { label: "Dad's $8,000 rule", amountCents: 800_000 },
  asOf: "2026-11-06",
  balances: [
    { name: "Chase checking", balanceCents: 742_316 },
    { name: "Cash App", balanceCents: 131_840 },
    { name: "Venmo", balanceCents: 54_210 },
  ],
  bills: [
    { name: "Verizon phone", amountCents: 8_500, due: "2026-11-20" },
    { name: "Liability insurance renewal", amountCents: 48_000, due: "2026-12-01" },
    { name: "Surface cleaner replacement", amountCents: 32_900, due: "2027-03-15" },
  ],
};

export const DEMO_FILES = ["/demo/chase.csv", "/demo/cashapp.csv", "/demo/venmo.csv"];
