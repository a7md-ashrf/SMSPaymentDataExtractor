// tests/parser/payment.test.ts

import { describe, expect, test } from "bun:test";
import { extractPayment, findMissingFields } from "../../src/parser/extract-payment";

describe("extractPayment", () => {
  test("bank instant-transfer SMS with a reference number", () => {
    const text = `Wednesday 2:04 PM

تم تنفيذ تحويل لحظي من حسابكم
رقم 12345 بمبلغ 125 جم إلى
على |**++ ‎kkkkkk|‏ |*** |****** رقم
مرجعي 260000000000 يوم
21-10-2026 الساعه 14:03
للمزيد اتصل ب 19888`;

    expect(extractPayment(text)).toMatchObject({
      provider: "instapay",
      channel: "sms",
      direction: "sent",
      status: "success",
      amount: 125,
      currency: "EGP",
      date: "2026-10-21",
      time: "14:03",
      reference: "260000000000",
      sender: { account: "12345" },
    });
  });

  test("bank transfer SMS with a date split by OCR", () => {
    const text = `Fri, 2 Oct at 2:31PM
من 135EGP تم تحويل مبلغ
فش01- xxx1234 حساب رقم
عن طريق التحويل OCT-2026
اللحظي`;

    expect(extractPayment(text)).toMatchObject({
      provider: "instapay",
      direction: "sent",
      amount: 135,
      currency: "EGP",
      date: "2026-10-01",
      time: null,
      sender: { account: "xxx1234" },
    });
  });

  test("received wallet transfer with label after value", () => {
    const text = `Yesterday 11:32PM
تم استلام مبلغ 75 جنيه من رقم
المسجل بإسم 1
على رقم Example User
.01012345678 محفظتك
رصيدك الحالي: 200.00 جنيه
25-10-26 21:54 تاريخ العملية:
000000000002 رقم العملية:
تابع كل مصروفاتك من تاريخ
المعاملات على أبلكيشن أنا فودافون
http://vf.eg/vfcash`;

    const payment = extractPayment(text);

    expect(payment).toMatchObject({
      provider: "vodafone_cash",
      direction: "received",
      amount: 75,
      currency: "EGP",
      balanceAfter: 200.00,
      date: "2026-10-25",
      time: "21:54",
      transactionId: "000000000002",
      sender: { name: "Example User" },
      recipient: { wallet: "01012345678" },
    });
    expect(findMissingFields(payment)).toEqual([]);
  });

  test("outgoing wallet SMS with fee and balance", () => {
    const text = `Today 3:47 PM

تم تحويل 12 جنيه لرقم
1 مصاريف
الخدمة 1 جنيه رصيد حسابك
فى فودافون كاش الحالي 7.00.
تاريخ العملية 15:47
21-08-26 :
رقم العملية 022000000000 :
حول فلوسك أسرع وأسهل من
خلال تطبيق فودافون, وتحكم
في معاملاتك من خلال http://
vf.eg/vfcash`;

    expect(extractPayment(text)).toMatchObject({
      provider: "vodafone_cash",
      direction: "sent",
      amount: 12,
      currency: "EGP",
      fee: 1,
      total: null,
      balanceAfter: 7.00,
      date: "2026-08-21",
      time: "15:47",
      transactionId: "022000000000",
    });
  });

  test("clean app receipt with Arabic-Indic digits", () => {
    const text = `لقد تم الدفع بنجاح!
٥ جنيه
اجمالي المبلغ
كاشا
من
٠١٠٩٨٧٦٥٤٣٢
كانفنا
إلي
٠١٠١٢٣٤٥٦٧٨
اسم تجريبي
Abim
الرسوم
الإجمالي
١جنيه
٦ جنيه
رقم العملية
تاريخ العملية
٠١٦٠٠٠٠٠٠٠٠٠
٠٧:٠٤ ص, ١٤ يناير ٢٠٢٦
كا نشا`;

    expect(extractPayment(text)).toMatchObject({
      provider: "unknown",
      channel: "app",
      direction: "sent",
      status: "success",
      amount: 5,
      currency: "EGP",
      fee: 1,
      total: 6,
      sender: { wallet: "01098765432" },
      recipient: { wallet: "01012345678" },
      date: "2026-01-14",
      time: "07:04",
      transactionId: "016000000000",
    });
  });

  test("does not invent a total or date from noisy OCR", () => {
    const text = `ag) تم الدفع بنجام!
اجمالي المبلعغ
من
Rd 12345678
wl
IPAOVEA 5
ري احمد اج اب اه اي
اسان
الرسوم اجنيه
الإجمالي arian
رقم العملية 12/3456
تاريخ العملية WaE ضار ا يناير 67
0`;

    expect(extractPayment(text)).toMatchObject({
      amount: null,
      total: null,
      date: null,
    });
  });
});
