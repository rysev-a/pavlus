import { expect, test } from "vitest";
import {
  brandOf,
  fieldError,
  formatExpiry,
  formatField,
  formatNumber,
  luhn,
  preview,
  validate,
} from "../blocks/credit-card/credit-card.ts";

test("the brand comes from the first digits", () => {
  expect(brandOf("4242")).toBe("visa");
  expect(brandOf("5555 5555")).toBe("mastercard");
  expect(brandOf("2221")).toBe("mastercard");
  expect(brandOf("37")).toBe("amex");
  expect(brandOf("34")).toBe("amex");
  expect(brandOf("6011")).toBe("unknown");
  expect(brandOf("")).toBe("unknown");
});

test("numbers are grouped by four, Amex as 4-6-5", () => {
  expect(formatNumber("4242424242424242")).toBe("4242 4242 4242 4242");
  expect(formatNumber("42424")).toBe("4242 4");
  expect(formatNumber("4242 ab 4242 4242 4242 99")).toBe("4242 4242 4242 4242");
  expect(formatNumber("378282246310005")).toBe("3782 822463 10005");
});

test("expiry gets a slash and a leading zero", () => {
  expect(formatExpiry("1")).toBe("1");
  expect(formatExpiry("4")).toBe("04");
  expect(formatExpiry("0430")).toBe("04/30");
  expect(formatExpiry("1330")).toBe("12/30");
  expect(formatExpiry("04/3099")).toBe("04/30");
});

test("the Luhn checksum", () => {
  expect(luhn("4242 4242 4242 4242")).toBe(true);
  expect(luhn("5555555555554444")).toBe(true);
  expect(luhn("378282246310005")).toBe(true);
  expect(luhn("4242 4242 4242 4241")).toBe(false);
  expect(luhn("1234")).toBe(false);
});

test("each field has its own error", () => {
  const ok = {
    number: "4242 4242 4242 4242",
    name: "Ann Lee",
    expiry: "04/30",
    cvc: "123",
  };
  expect(validate(ok)).toEqual({});
  expect(fieldError("number", { ...ok, number: "" })).toMatch(/Enter/);
  expect(fieldError("number", { ...ok, number: "4242 42" })).toMatch(/short/);
  expect(
    fieldError("number", { ...ok, number: "4242 4242 4242 4241" }),
  ).toMatch(/not valid/);
  expect(fieldError("name", { ...ok, name: "Ann" })).toMatch(/name/);
  expect(fieldError("expiry", { ...ok, expiry: "04/2" })).toMatch(/MM\/YY/);
  expect(fieldError("expiry", { ...ok, expiry: "10/26" })).toMatch(/expired/);
  expect(fieldError("expiry", { ...ok, expiry: "11/26" })).toBe("");
  expect(fieldError("cvc", { ...ok, cvc: "12" })).toMatch(/3 digits/);
  const amex = { ...ok, number: "3782 822463 10005" };
  expect(fieldError("cvc", { ...amex, cvc: "123" })).toMatch(/4 digits/);
  expect(fieldError("cvc", { ...amex, cvc: "1234" })).toBe("");
});

test("typing is filtered per field", () => {
  expect(formatField("cvc", "12a34", "visa")).toBe("123");
  expect(formatField("cvc", "12345", "amex")).toBe("1234");
  expect(formatField("name", "Ann 4 Lee", "visa")).toBe("Ann  Lee");
});

test("the preview fills what is missing", () => {
  const p = preview({ number: "4242", name: "", expiry: "0", cvc: "1" });
  expect(p.brand).toBe("visa");
  expect(p.shownNumber).toBe("4242 •••• •••• ••••");
  expect(p.shownName).toBe("FULL NAME");
  expect(p.shownExpiry).toBe("0M/YY");
  expect(p.shownCvc).toBe("•··");
});
