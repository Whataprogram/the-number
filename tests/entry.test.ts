import { describe, expect, it } from "vitest";
import { parseEntry } from "../lib/entry";

describe("typed money entries", () => {
  it("got", () => expect(parseEntry("got $350 for a house wash")).toMatchObject({ amountCents: 35000, kind: "business_income", description: "house wash" }));
  it("earned", () => expect(parseEntry("earned $350 washing a driveway")).toMatchObject({ amountCents: 35000, kind: "business_income" }));
  it("customer paid", () => expect(parseEntry("customer paid me 200")).toMatchObject({ amountCents: 20000, direction: "in" }));
  it("sold", () => expect(parseEntry("sold shoes for $90")).toMatchObject({ amountCents: 9000, direction: "in" }));
  it("k shorthand", () => expect(parseEntry("made 1.2k this weekend")).toMatchObject({ amountCents: 120000 }));
  it("whole k", () => expect(parseEntry("made 2k on a deck job")).toMatchObject({ amountCents: 200000 }));
  it("personal spend", () => expect(parseEntry("spent 180 on sneakers")).toMatchObject({ amountCents: 18000, kind: "personal", direction: "out" }));
  it("business spend", () => expect(parseEntry("bought $42.50 of surface cleaner soap")).toMatchObject({ amountCents: 4250, kind: "business_expense" }));
  it("bill", () => expect(parseEntry("insurance bill 480")).toMatchObject({ amountCents: 48000, kind: "business_expense" }));
  it("signs", () => { expect(parseEntry("+120 tip")).toMatchObject({ direction: "in" }); expect(parseEntry("-45 gas")).toMatchObject({ kind: "business_expense" }); });
  it("no verb, job word", () => expect(parseEntry("350 house wash")).toMatchObject({ direction: "in" }));
  it("commas", () => expect(parseEntry("made $1,200 on a deck job")).toMatchObject({ amountCents: 120000, kind: "business_income" }));
  it("needs an amount", () => expect(parseEntry("got paid")).toHaveProperty("error"));
  it("needs a direction", () => expect(parseEntry("$50 sneakers")).toHaveProperty("error"));
});
