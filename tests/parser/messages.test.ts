// tests/parser/messages.test.ts

import { describe, expect, test } from "bun:test";
import { extractPaymentsFromText } from "../../src/parser/messages";
import { TWO_SMS_TEXT } from "../fixtures/two-sms";

describe("extractPaymentsFromText", () => {
  test("returns every message in reading order", () => {
    const payments = extractPaymentsFromText(TWO_SMS_TEXT);

    expect(payments).toHaveLength(2);
    expect(payments.map((payment) => payment.amount)).toEqual([25, 75]);
    expect(payments.map((payment) => payment.transactionId)).toEqual([
      "000000000001",
      "000000000002",
    ]);
    expect(payments.map((payment) => payment.date)).toEqual([
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(payments.every((payment) => payment.direction === "received")).toBe(
      true,
    );
  });

  test("returns one payment for single-message text", () => {
    const payments = extractPaymentsFromText(`Saturday 9:33 PM
تم استلام مبلغ 25 جنيه من رقم
000000000001 رقم العملية:
24-10-26 21:33 تاريخ العملية:`);

    expect(payments).toHaveLength(1);
    expect(payments[0]?.amount).toBe(25);
  });

  test("returns an empty array for empty text", () => {
    expect(extractPaymentsFromText("")).toEqual([]);
  });
});
