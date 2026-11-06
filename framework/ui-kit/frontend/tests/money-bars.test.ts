import { expect, test } from "vitest";
import { moneyBars } from "../blocks/money-bars/bars.ts";

const row = (id: string, ...values: number[]) => ({
  id,
  label: id,
  values: values.map((value, i) => ({
    id: ["income", "expenses", "profit"][i],
    value,
    tone: "default" as const,
  })),
});

test("the biggest absolute value is 100 percent", () => {
  const [jan, feb] = moneyBars([
    row("Jan", 1000, 800, 200),
    row("Feb", 500, 900, -400),
  ]);
  expect(jan.bars.map((b) => b.h)).toEqual([100, 80, 20]);
  expect(feb.bars.map((b) => b.h)).toEqual([50, 90, 40]);
});

test("a loss grows down and a zero stays a hairline", () => {
  const [m] = moneyBars([row("Jan", 100, 0, -50)]);
  expect(m.bars.map((b) => b.neg)).toEqual([false, false, true]);
  expect(m.bars[1].h).toBe(1);
});

test("tips use the formatter, an empty list is fine", () => {
  const [m] = moneyBars([row("Jan", 1000)], (v) => `$${v}`);
  expect(m.bars[0].tip).toBe("Jan, income: $1000");
  expect(moneyBars([])).toEqual([]);
});
