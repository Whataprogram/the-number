import { describe, expect, it } from "vitest";
import { parseEntry } from "../lib/entry";

describe("typed money entries", () => {
  it("income", () => expect(parseEntry("got $350 for a house wash")).toMatchObject({ amountCents: 35000, kind: "business_income", description: "house wash" }));
  it("personal spend", () => expect(parseEntry("spent 180 on sneakers")).toMatchObject({ amountCents: 18000, kind: "personal", direction: "out" }));
  it("business spend", () => expect(parseEntry("bought $42.50 of surface cleaner soap")).toMatchObject({ amountCents: 4250, kind: "business_expense" }));
  it("commas", () => expect(parseEntry("made $1,200 on a deck job")).toMatchObject({ amountCents: 120000, kind: "business_income" }));
  it("needs an amount", () => expect(parseEntry("got paid")).toHaveProperty("error"));
  it("needs a direction", () => expect(parseEntry("$50 sneakers")).toHaveProperty("error"));
});
