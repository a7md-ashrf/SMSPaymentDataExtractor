// tests/parser/normalize.test.ts

import { describe, expect, test } from "bun:test";
import {
  normalizeDigits,
  normalizeText,
  parseNumber,
} from "../../src/parser/normalize";

describe("normalizeDigits", () => {
  test("converts Arabic-Indic and Persian digits", () => {
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });
});

describe("normalizeText", () => {
  test("folds Arabic letter variants and whitespace", () => {
    expect(normalizeText("إلى   الخدمة")).toBe("الي الخدمه");
    expect(normalizeText("رقم ٠١٢٣")).toBe("رقم 0123");
  });
});

describe("parseNumber", () => {
  test("parses grouped and decimal numbers", () => {
    expect(parseNumber("1,563.49")).toBe(1563.49);
    expect(parseNumber(null)).toBeNull();
  });
});
