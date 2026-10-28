// tests/cli/output.test.ts

import { describe, expect, test } from "bun:test";
import { buildExtractionResult, formatResultSummary } from "../../src/cli/output";
import { extractPayment } from "../../src/parser/extract-payment";

const TEXT = `Saturday 9:33 PM
تم استلام مبلغ 25 جنيه من رقم
000000000001 رقم العملية:
24-10-26 21:33 تاريخ العملية:`;

describe("CLI output", () => {
  test("adds file, message index and missing fields", () => {
    const payment = extractPayment(TEXT);
    const result = buildExtractionResult("receipt.png", payment, 1);

    expect(result.file).toBe("receipt.png");
    expect(result.messageIndex).toBe(1);
    expect(result.amount).toBe(25);
    expect(Array.isArray(result.missingFields)).toBe(true);
  });

  test("formats a readable stderr summary", () => {
    const payment = extractPayment(TEXT);
    const result = buildExtractionResult("receipt.png", payment, 1);
    const summary = formatResultSummary(result, 2, 91.4);

    expect(summary).toContain("receipt.png [message 2/2]");
    expect(summary).toContain("OCR 91%");
    expect(summary).toContain("amount=25");
  });
});
