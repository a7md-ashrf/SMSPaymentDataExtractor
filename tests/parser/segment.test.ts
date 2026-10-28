// tests/parser/segment.test.ts

import { describe, expect, test } from "bun:test";
import { segmentMessages } from "../../src/parser/segment-messages";
import { TWO_SMS_TEXT } from "../fixtures/two-sms";

describe("segmentMessages", () => {
  test("splits a screenshot containing two SMS messages", () => {
    const segments = segmentMessages(TWO_SMS_TEXT);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toContain("Saturday 9:33PM");
    expect(segments[0]).toContain("25 جنيه");
    expect(segments[0]).toContain("000000000001");
    expect(segments[0]).not.toContain("75 جنيه");

    expect(segments[1]).toContain("Sunday 11:32 PM");
    expect(segments[1]).toContain("75 جنيه");
    expect(segments[1]).toContain("000000000002");
    expect(segments[1]).not.toContain("25 جنيه");
  });

  test("falls back to timestamp headers when no transaction phrase is found", () => {
    const segments = segmentMessages(`Saturday 9:33 PM
Hello from the first conversation
Sunday 11:32 PM
Hello from the second conversation`);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toContain("first conversation");
    expect(segments[1]).toContain("second conversation");
  });

  test("keeps a single message intact when there is no header", () => {
    const text = "تم استلام مبلغ 25 جنيه\nرقم العملية: 123456789";

    expect(segmentMessages(text)).toEqual([text]);
  });

  test("tolerates OCR junk before the transaction phrase", () => {
    const segments = segmentMessages(`ag) تم الدفع بنجاح!
5 جنيه
اجمالي المبلغ`);
    const second = segmentMessages(`Saturday 9:33 PM
تم استلام مبلغ 50 جنيه
Sunday 11:32 PM
ag) تم الدفع بنجاح!
5 جنيه`);

    expect(segments).toHaveLength(1);
    expect(second).toHaveLength(2);
  });

  test("returns an empty array for empty text", () => {
    expect(segmentMessages("   \n\n ")).toEqual([]);
  });
});
