import { expect, test } from "vitest";
import { codeLines, tokenizeLine } from "../blocks/code-block/code-block.ts";
import {
  contactState,
  validateContact,
} from "../blocks/contact-form/contact-form.ts";
import {
  cardsOf,
  money,
  PLANS,
  priceFor,
  pricingState,
} from "../blocks/pricing-table/pricing-table.ts";
import {
  passwordStrength,
  signupState,
  validateSignup,
} from "../blocks/signup-form/signup-form.ts";

test("money shows whole dollars without cents", () => {
  expect(money(12)).toBe("12");
  expect(money(9.5)).toBe("9.50");
  expect(money(0)).toBe("0");
});

test("priceFor: monthly is the list price, yearly takes the discount off", () => {
  expect(priceFor(12, false, 25)).toEqual({
    perMonth: 12,
    billedTotal: 12,
    saved: 0,
  });
  expect(priceFor(12, true, 25)).toEqual({
    perMonth: 9,
    billedTotal: 108,
    saved: 36,
  });
  expect(priceFor(24, true, 25).saved).toBe(72);
  expect(priceFor(10, true, 0).saved).toBe(0);
});

test("cardsOf follows the billing period and keeps a free plan free", () => {
  const monthly = cardsOf(PLANS, false, 25);
  const yearly = cardsOf(PLANS, true, 25);
  expect(monthly.map((c) => c.price)).toEqual(["$0", "$12", "$24"]);
  expect(yearly.map((c) => c.price)).toEqual(["$0", "$9", "$18"]);
  expect(yearly[1].billed).toContain("$108");
  expect(monthly[1].billed).toContain("monthly");
  expect(yearly[0].billed).toBe(monthly[0].billed);
});

test("pricingState starts monthly with cards computed", () => {
  const s = pricingState({ discount: 50 });
  expect(s.yearly).toBe(false);
  expect(s.cards).toHaveLength(PLANS.length);
  expect(pricingState({ yearly: true, discount: 50 }).cards[1].price).toBe(
    "$6",
  );
});

test("validateContact names every wrong field", () => {
  const empty = contactState();
  expect(Object.keys(validateContact(empty)).sort()).toEqual([
    "consent",
    "email",
    "message",
    "name",
  ]);
  const ok = {
    ...empty,
    name: "Ann Lee",
    email: "ann@company.com",
    message: "We need a mobile app for our clinic by June.",
    consent: true,
  };
  expect(validateContact(ok)).toEqual({});
  expect(validateContact({ ...ok, email: "ann@company" }).email).toBeDefined();
  expect(validateContact({ ...ok, message: "Hello there" }).message).toBe(
    "Write at least a few words (5 or more).",
  );
});

test("validateSignup and passwordStrength", () => {
  const s = signupState();
  expect(Object.keys(validateSignup(s)).sort()).toEqual([
    "email",
    "name",
    "password",
    "terms",
  ]);
  expect(
    validateSignup({
      ...s,
      name: "Ann",
      email: "a@b.co",
      password: "longenough",
      terms: true,
    }),
  ).toEqual({});
  expect(passwordStrength("").level).toBe(0);
  expect(passwordStrength("abc").label).toBe("Weak");
  expect(passwordStrength("abcdefgh").level).toBe(1);
  expect(passwordStrength("Abcdefgh12!x").level).toBe(4);
  expect(passwordStrength("Abcdefgh12!x").label).toBe("Strong");
});

test("tokenizeLine colours TypeScript and gives the line back", () => {
  const line = 'const x = fetchUser("id", 42); // go';
  const tokens = tokenizeLine(line, "ts");
  expect(tokens.map((t) => t.t).join("")).toBe(line);
  const kind = (text: string) => tokens.find((t) => t.t === text)?.k;
  expect(kind("const")).toBe("k");
  expect(kind("fetchUser")).toBe("f");
  expect(kind('"id"')).toBe("s");
  expect(kind("42")).toBe("n");
  expect(kind("// go")).toBe("c");
});

test("tokenizeLine handles shell, JSON and unknown languages", () => {
  const sh = tokenizeLine("npm run dev --port 5173 # now", "sh");
  expect(sh[0]).toEqual({ t: "npm", k: "f" });
  expect(sh.find((t) => t.t === "--port")?.k).toBe("k");
  expect(sh.find((t) => t.t === "# now")?.k).toBe("c");
  const word = tokenizeLine("npm i @scope/some-pkg", "sh");
  expect(word.some((t) => t.k === "k")).toBe(false);
  const json = tokenizeLine('  "a": [1, true, "b"]', "json");
  expect(json.find((t) => t.t === '"a"')?.k).toBe("t");
  expect(json.find((t) => t.t === '"b"')?.k).toBe("s");
  expect(json.find((t) => t.t === "true")?.k).toBe("k");
  expect(tokenizeLine("whatever", "text")).toEqual([{ t: "whatever", k: "p" }]);
});

test("codeLines numbers the lines and ignores a trailing newline", () => {
  const lines = codeLines("a\n\nb\n", "ts");
  expect(lines.map((l) => l.n)).toEqual([1, 2, 3]);
  expect(lines[1].tokens).toEqual([]);
});
