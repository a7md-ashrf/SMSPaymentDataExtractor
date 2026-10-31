// src/parser/extract.ts

import { PaymentSchema, type ExtractedPayment, type Party } from "../schema";
import { normalizeText, parseNumber, to24HourTime } from "./normalize";

const NUM = String.raw`\d[\d,]*(?:\.\d{1,2})?`;
const CURRENCY = String.raw`(?:جنيه|اجنيه|جم|ج\.م|EGP|LE|L\.E|USD|EUR|SAR|AED|ريال|درهم|دولار|يورو|pounds?)`;
const WALLET = String.raw`01[0125]\d{8}`;

const MONTH_PATTERN = String.raw`(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?|يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر)`;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
  يناير: 1,
  فبراير: 2,
  مارس: 3,
  ابريل: 4,
  مايو: 5,
  يونيو: 6,
  يوليو: 7,
  اغسطس: 8,
  سبتمبر: 9,
  اكتوبر: 10,
  نوفمبر: 11,
  ديسمبر: 12,
};

interface NumberCandidate {
  raw: string;
  value: number;
  index: number;
  score: number;
}

interface DateCandidate {
  raw: string;
  iso: string;
  index: number;
  score: number;
}

interface TimeCandidate {
  raw: string;
  value: string;
  index: number;
  score: number;
}

interface WalletHit {
  value: string;
  index: number;
}

function emptyParty(): Party {
  return { name: null, wallet: null, account: null };
}

function isPhoneLike(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return /^01[0125]\d{8}$/.test(digits);
}

function isLikelyDate(value: string): boolean {
  return /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(value);
}

function collectNumbers(
  text: string,
  patterns: Array<{ regex: RegExp; score: number }>,
): NumberCandidate[] {
  const candidates = new Map<string, NumberCandidate>();

  for (const { regex, score } of patterns) {
    regex.lastIndex = 0;

    for (const match of text.matchAll(regex)) {
      const raw = match[1];
      if (!raw) continue;

      const value = parseNumber(raw);
      if (value === null) continue;

      const offset = match[0].indexOf(raw);
      const index = (match.index ?? 0) + Math.max(offset, 0);
      const key = `${index}:${raw}`;
      const existing = candidates.get(key);

      if (!existing || existing.score < score) {
        candidates.set(key, { raw, value, index, score });
      }
    }
  }

  return [...candidates.values()];
}

function contextAround(text: string, candidate: NumberCandidate, radius = 32) {
  return {
    before: text.slice(
      Math.max(0, candidate.index - radius),
      candidate.index,
    ),
    after: text.slice(
      candidate.index + candidate.raw.length,
      candidate.index + candidate.raw.length + radius,
    ),
  };
}

function pickAmount(text: string): number | null {
  const patterns = [
    // "بمبلغ 120" / "مبلغ 100"
    {
      regex: new RegExp(`(?:بمبلغ|مبلغ)\\s*:?\\s*(${NUM})`, "gi"),
      score: 100,
    },
    // "تم تحويل 10 جنيه" / "تم استلام مبلغ 100 جنيه"
    {
      regex: new RegExp(
        `(?:تحويل|استلام|دفع|سداد|شراء|ارسال|إرسال)\\s*(?:مبلغ|قيمه|قيمة)?\\s*:?\\s*(${NUM})\\s*${CURRENCY}?`,
        "gi",
      ),
      score: 90,
    },
    // "اجمالي المبلغ" followed by the amount
    {
      regex: new RegExp(
        `اجمال[يى]?\\s*المبل\\S*\\s*:?\\s*(${NUM})`,
        "gi",
      ),
      score: 90,
    },
    // Amount line followed by "اجمالي المبلغ" (common app-receipt layout)
    {
      regex: new RegExp(
        `(${NUM})\\s*${CURRENCY}\\s*(?:\\n\\s*)?اجمال[يى]?\\s*المبل\\S*`,
        "gi",
      ),
      score: 105,
    },
    // Any amount written next to a currency, checked with context below.
    {
      regex: new RegExp(`(${NUM})\\s*${CURRENCY}`, "gi"),
      score: 50,
    },
    // English labels
    {
      regex: new RegExp(
        `(?:amount|paid|transferred|received|sent)\\s*:?\\s*(?:EGP|LE)?\\s*(${NUM})`,
        "gi",
      ),
      score: 90,
    },
  ];

  const candidates = collectNumbers(text, patterns);
  let best: NumberCandidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const { before, after } = contextAround(text, candidate);
    let score = candidate.score;

    if (/(?:مبلغ|تحويل|استلام|دفع|سداد|amount|paid|transferred|received|sent)/i.test(before)) {
      score += 25;
    }

    if (/(?:مبلغ|تحويل|استلام|دفع|سداد|amount|paid|transferred|received|sent)/i.test(after)) {
      score += 15;
    }

    if (new RegExp(CURRENCY, "i").test(after) || new RegExp(CURRENCY, "i").test(before)) {
      score += 10;
    }

    if (/(?:رصيد|balance|الرسوم|مصاريف|رسوم|fee|الاجمالي|total|تاريخ|date|الساعه|time|رقم\s*العمليه|transaction|مرجع|reference)/i.test(before)) {
      score -= 80;
    }

    if (/(?:رصيد|balance|الرسوم|مصاريف|رسوم|fee|الاجمالي|total)/i.test(after)) {
      score -= 55;
    }

    if (isPhoneLike(candidate.raw) || isLikelyDate(candidate.raw)) {
      score -= 250;
    }

    if (candidate.value <= 0) {
      score -= 250;
    }

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best && bestScore > 25 ? best.value : null;
}

function pickFee(text: string): number | null {
  const patterns = [
    {
      regex: new RegExp(
        `(?:مصاريف(?:\\s*الخدمه)?|الرسوم|رسوم(?:\\s*الخدمه)?|service\\s*fee|fees?)\\s*:?[\\s\\S]{0,35}?(${NUM})`,
        "gi",
      ),
      score: 85,
    },
    {
      regex: new RegExp(
        `(${NUM})\\s*(?:جنيه|اجنيه|جم|ج\\.م|EGP|LE)?\\s*(?:مصاريف|الرسوم|رسوم)`,
        "gi",
      ),
      score: 100,
    },
  ];

  const candidates = collectNumbers(text, patterns);
  let best: NumberCandidate | null = null;
  let bestScore = 0;

  const walletValues = [...text.matchAll(new RegExp(WALLET, "g"))].map(
    (match) => match[0],
  );

  for (const candidate of candidates) {
    if (candidate.value < 0 || isPhoneLike(candidate.raw)) continue;

    const { before, after } = contextAround(text, candidate);
    let score = candidate.score;

    // Ignore digits that are just the trailing part of a wallet number that
    // OCR collapsed onto the fee line. Only candidates that sit *before* the
    // fee label (pattern 2) can be collapsed wallet digits; a fee that appears
    // after the label is a real value.
    const labelFollows = /(?:مصاريف|الرسوم|رسوم)/i.test(after);
    if (
      labelFollows &&
      walletValues.some(
        (wallet) =>
          wallet.endsWith(candidate.raw) && candidate.raw.length <= 3,
      )
    ) {
      continue;
    }

    if (/(?:رصيد|balance|رقم\s*العمليه|transaction|مرجع|reference)/i.test(before)) {
      score -= 120;
    }

    if (candidate.value === 0) {
      score -= 250;
    }

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best && bestScore > 30 ? best.value : null;
}

function pickTotal(text: string): number | null {
  const patterns = [
    {
      regex: new RegExp(
        `(?:^|\\n)\\s*الاجمالي(?:\\s*الكلي)?\\s*:?[\\s\\S]{0,35}?(${NUM})`,
        "gi",
      ),
      score: 100,
    },
    {
      regex: new RegExp(
        `(?:grand\\s*)?total\\s*:?[\\s\\S]{0,35}?(${NUM})`,
        "gi",
      ),
      score: 100,
    },
    {
      regex: new RegExp(
        `(${NUM})\\s*${CURRENCY}\\s*(?:\\n\\s*)?الاجمالي(?:\\s*الكلي)?`,
        "gi",
      ),
      score: 90,
    },
  ];

  const candidates = collectNumbers(text, patterns);
  let best: NumberCandidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (candidate.value < 0 || isPhoneLike(candidate.raw)) continue;

    // A real total is normally written with a currency next to it. This stops
    // a number inside a transaction ID from being mistaken for the total.
    const { before, after } = contextAround(text, candidate, 12);
    if (!new RegExp(CURRENCY, "i").test(before) && !new RegExp(CURRENCY, "i").test(after)) {
      continue;
    }

    let score = candidate.score;

    // "اجمالي المبلغ" is the amount, not the grand total.
    if (/اجمالي\s*المبل/i.test(before)) score -= 100;

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best && bestScore > 30 ? best.value : null;
}

function pickBalance(text: string): number | null {
  const patterns = [
    {
      regex: new RegExp(
        `(?:رصيدك|رصيد\\s*حسابك|الرصيد|رصيد)(?:\\s*الحالي)?[\\s\\S]{0,45}?(${NUM})`,
        "gi",
      ),
      score: 100,
    },
    {
      regex: new RegExp(
        `balance(?:\\s*after)?\\s*:?[\\s\\S]{0,30}?(${NUM})`,
        "gi",
      ),
      score: 100,
    },
  ];

  const candidates = collectNumbers(text, patterns);
  let best: NumberCandidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (candidate.value < 0 || isPhoneLike(candidate.raw)) continue;

    if (candidate.score > bestScore) {
      best = candidate;
      bestScore = candidate.score;
    }
  }

  return best ? best.value : null;
}

function normalizeYear(year: number): number {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const currentYear = new Date().getUTCFullYear();
  if (year < 2000 || year > currentYear + 1) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthNumber(name: string): number | null {
  return MONTHS[name.toLowerCase()] ?? null;
}

function pickDate(text: string): string | null {
  const candidates: DateCandidate[] = [];

  // ISO: 2026-10-21
  for (const match of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const iso = toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (iso) {
      candidates.push({ raw: match[0], iso, index: match.index ?? 0, score: 110 });
    }
  }

  // DMY / MDY: 21-10-2026, 25/10/26, 01-10-26
  for (const match of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = normalizeYear(Number(match[3]));

    const dayFirst = toIsoDate(year, second, first);
    const monthFirst = toIsoDate(year, first, second);

    let iso: string | null = null;
    if (first > 12) iso = dayFirst;
    else if (second > 12) iso = monthFirst;
    else iso = dayFirst ?? monthFirst;

    if (iso) {
      candidates.push({ raw: match[0], iso, index: match.index ?? 0, score: 95 });
    }
  }

  // 14 يناير 2026 / 01-OCT-2026 / 2 Oct 2026
  const dayMonthYear = new RegExp(
    `\\b(\\d{1,2})\\s*[-\\s]\\s*(${MONTH_PATTERN})\\s*[-\\s,]*\\s*(\\d{2,4})\\b`,
    "gi",
  );
  for (const match of text.matchAll(dayMonthYear)) {
    const month = monthNumber(match[2]!);
    if (!month) continue;

    const iso = toIsoDate(
      normalizeYear(Number(match[3])),
      month,
      Number(match[1]),
    );
    if (iso) {
      candidates.push({ raw: match[0], iso, index: match.index ?? 0, score: 100 });
    }
  }

  // Oct 2, 2026
  const monthDayYear = new RegExp(
    `\\b(${MONTH_PATTERN})\\s+(\\d{1,2}),?\\s+(\\d{2,4})\\b`,
    "gi",
  );
  for (const match of text.matchAll(monthDayYear)) {
    const month = monthNumber(match[1]!);
    if (!month) continue;

    const iso = toIsoDate(
      normalizeYear(Number(match[3])),
      month,
      Number(match[2]),
    );
    if (iso) {
      candidates.push({ raw: match[0], iso, index: match.index ?? 0, score: 95 });
    }
  }

  // OCR sometimes splits "01-" and "OCT-2026" across lines. Find the month first,
  // then take the nearest 1-2 digit number before it as the day.
  const monthRe = new RegExp(MONTH_PATTERN, "gi");
  for (const monthMatch of text.matchAll(monthRe)) {
    const month = monthNumber(monthMatch[0]);
    if (!month) continue;

    const monthIndex = monthMatch.index ?? 0;
    const afterMonth = text.slice(monthIndex + monthMatch[0].length);
    const yearMatch = afterMonth.match(/^\s*[-,/\s]*(\d{2,4})\b/);
    if (!yearMatch) continue;

    const year = normalizeYear(Number(yearMatch[1]));
    const beforeMonth = text.slice(Math.max(0, monthIndex - 80), monthIndex);
    const dayTokens = [...beforeMonth.matchAll(/(?<!\d)(\d{1,2})(?!\d)/g)];
    const lastDay = dayTokens.at(-1);
    if (!lastDay) continue;

    const iso = toIsoDate(year, month, Number(lastDay[1]));
    if (!iso) continue;

    const distance = beforeMonth.length - (lastDay.index ?? 0);
    const alreadyCovered = candidates.some(
      (candidate) =>
        candidate.iso === iso &&
        Math.abs(candidate.index - monthIndex) < 40,
    );

    if (!alreadyCovered) {
      candidates.push({
        raw: `${lastDay[1]} ${monthMatch[0]} ${year}`,
        iso,
        index: monthIndex,
        score: 85 - Math.min(distance, 40),
      });
    }
  }

  let best: DateCandidate | null = null;
  for (const candidate of candidates) {
    const nearDateLabel = /(?:تاريخ(?:\s*العمليه)?|date)/i.test(
      text.slice(
        Math.max(0, candidate.index - 45),
        candidate.index + candidate.raw.length + 45,
      ),
    );

    const score = candidate.score + (nearDateLabel ? 10 : 0);
    if (!best || score > best.score) {
      best = { ...candidate, score };
    }
  }

  return best?.iso ?? null;
}

function pickTime(text: string): string | null {
  const candidates: TimeCandidate[] = [];

  // 12-hour: 2:04 PM, 7:04 م
  for (const match of text.matchAll(
    /(?<!\d)(\d{1,2}):([0-5]\d)\s*(AM|PM|صباحا|مساء|صا|ص|م)/gi,
  )) {
    const marker = match[3]!.toLowerCase();
    const meridiem = /^(?:pm|مساء)$/.test(marker)
      ? "PM"
      : /^(?:am|صباحا|صا|ص)$/.test(marker)
        ? "AM"
        : undefined;

    const value = to24HourTime(match[1]!, match[2]!, meridiem);
    if (value) {
      candidates.push({
        raw: match[0],
        value,
        index: match.index ?? 0,
        score: 60,
      });
    }
  }

  // 24-hour: 14:03, 21:54
  for (const match of text.matchAll(
    /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g,
  )) {
    const value = to24HourTime(match[1]!, match[2]!);
    if (value) {
      candidates.push({
        raw: match[0],
        value,
        index: match.index ?? 0,
        score: 40,
      });
    }
  }

  let best: TimeCandidate | null = null;
  for (const candidate of candidates) {
    const before = text.slice(Math.max(0, candidate.index - 50), candidate.index);
    const after = text.slice(
      candidate.index + candidate.raw.length,
      candidate.index + candidate.raw.length + 50,
    );
    const context = `${before} ${after}`;

    let score = candidate.score;

    if (/(?:الساعه|الوقت|time)/i.test(context)) score += 30;
    if (/(?:تاريخ(?:\s*العمليه)?|date)/i.test(context)) score += 30;

    if (
      /(?:\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b|\b\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر))/i.test(
        context,
      )
    ) {
      score += 30;
    }

    if (/(?:today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/i.test(before)) {
      score -= 70;
    }

    if (candidate.index < 30) score -= 25;

    if (!best || score > best.score) {
      best = { ...candidate, score };
    }
  }

  return best && best.score >= 45 ? best.value : null;
}

function cleanId(value: string): string | null {
  const token = value.replace(/^[:.,;]+|[:.,;]+$/g, "");
  const digits = token.replace(/\D/g, "");

  if (digits.length < 5) return null;
  if (/^\d{4}$/.test(token) && Number(token) >= 1900 && Number(token) <= 2100) {
    return null;
  }
  if (/^\d{1,2}:\d{2}$/.test(token)) return null;
  if (isLikelyDate(token)) return null;
  if (isPhoneLike(token)) return null;

  return token;
}

function pickLabeledId(text: string, label: string): string | null {
  const labelRe = new RegExp(label, "gi");
  let best: { value: string; score: number } | null = null;
  const tokenRe = /[A-Za-z0-9][A-Za-z0-9./_-]{4,}/g;

  for (const labelMatch of text.matchAll(labelRe)) {
    const labelIndex = labelMatch.index ?? 0;
    const labelEnd = labelIndex + labelMatch[0].length;

    // The label can come after the value in OCR output (RTL line ordering).
    const before = text.slice(Math.max(0, labelIndex - 80), labelIndex);
    for (const tokenMatch of before.matchAll(tokenRe)) {
      const value = cleanId(tokenMatch[0]);
      if (!value) continue;

      const distance = before.length - (tokenMatch.index ?? 0) - tokenMatch[0].length;
      let score = 90 - Math.min(distance, 60);

      if (value.replace(/\D/g, "").length >= 8) score += 15;
      if (/[./_-]/.test(value)) score += 5;

      if (!best || score > best.score) {
        best = { value, score };
      }
    }

    const window = text.slice(labelEnd, labelEnd + 100);
    for (const tokenMatch of window.matchAll(tokenRe)) {
      const value = cleanId(tokenMatch[0]);
      if (!value) continue;

      const distance = tokenMatch.index ?? 0;
      const digitCount = value.replace(/\D/g, "").length;
      let score = 100 - Math.min(distance, 80);

      if (digitCount >= 8) score += 20;
      if (/[./_-]/.test(value)) score += 10;

      if (!best || score > best.score) {
        best = { value, score };
      }
    }
  }

  return best?.value ?? null;
}

function pickTransactionId(text: string): string | null {
  return pickLabeledId(
    text,
    String.raw`(?:رقم\s*العمليه|رقم\s*العمليا|transaction\s*(?:id|no|number)?|trx(?:\s*id)?|operation\s*(?:id|no|number)?)`,
  );
}

function pickReference(text: string): string | null {
  return pickLabeledId(
    text,
    String.raw`(?:رقم\s*المرجع|المرجع|مرجعي|reference(?:\s*(?:no|number|id))?|ref)`,
  );
}

function detectProvider(text: string): ExtractedPayment["provider"] {
  if (/(?:فودافون|vodafone|vf\.eg|vfcash)/i.test(text)) {
    return "vodafone_cash";
  }
  if (/(?:اورنج\s*كاش|اورنج|orange\s*cash)/i.test(text)) {
    return "orange_cash";
  }
  if (/(?:انستاباي|انستا\s*باي|instapay|تحويل\s*لحظي|لحظي)/i.test(text)) {
    return "instapay";
  }
  if (/(?:بنك|bank|حسابكم|حساب\s*رقم)/i.test(text)) {
    return "bank";
  }
  return "unknown";
}

function detectChannel(text: string): ExtractedPayment["channel"] {
  const appMarker = /(?:لقد\s*تم\s*الدفع|تم\s*الدفع|اجمال[يى]?\s*المبل\S*|الرسوم)/i.test(
    text,
  );
  const smsMarker = /(?:text\s*message|\bSMS\b|تم\s*(?:تنفيذ\s*)?تحويل|تم\s*استلام|للمزيد\s*اتصل|vf\.eg\/vfcash|فودافون\s*كاش)/i.test(
    text,
  );

  if (appMarker && !smsMarker) return "app";
  if (smsMarker) return "sms";
  if (appMarker) return "app";
  return "unknown";
}

function detectDirection(text: string): ExtractedPayment["direction"] {
  if (/(?:تم\s*استلام|استلام\s*مبلغ|received|وارد)/i.test(text)) {
    return "received";
  }
  if (/(?:تم\s*(?:تحويل|تنفيذ|الدفع|دفع|خصم)|sent|paid|transferred)/i.test(text)) {
    return "sent";
  }
  return "unknown";
}

function detectStatus(text: string): ExtractedPayment["status"] {
  if (/(?:فشل|مرفوض|failed|declined|rejected)/i.test(text)) {
    return "failed";
  }
  if (/(?:قيد\s*التنفيذ|معلق|pending|processing)/i.test(text)) {
    return "pending";
  }
  if (/(?:بنجاح|successful|success|completed|done|(?:^|\s)تم(?:\s|$))/i.test(text)) {
    return "success";
  }
  return "unknown";
}

function detectCurrency(text: string): string | null {
  if (/(?:EGP|جنيه|اجنيه|ج\.م)/i.test(text) || /(?:^|[\s.,:;])جم(?=$|[\s.,:;])/i.test(text)) {
    return "EGP";
  }
  if (/(?:USD|dollar|\$)/i.test(text)) return "USD";
  if (/(?:EUR|euro|€)/i.test(text)) return "EUR";
  if (/(?:SAR|ريال)/i.test(text)) return "SAR";
  if (/(?:AED|درهم)/i.test(text)) return "AED";
  return null;
}

function extractWallets(text: string): WalletHit[] {
  const hits: WalletHit[] = [];
  const walletRe = new RegExp(`(?<!\\d)(${WALLET})(?!\\d)`, "g");

  for (const match of text.matchAll(walletRe)) {
    hits.push({ value: match[1]!, index: match.index ?? 0 });
  }

  return hits;
}

function hasLabelBefore(
  text: string,
  index: number,
  labels: RegExp,
  radius = 45,
): boolean {
  return labels.test(text.slice(Math.max(0, index - radius), index));
}

function extractParties(
  text: string,
  direction: ExtractedPayment["direction"],
): { sender: Party; recipient: Party } {
  const sender = emptyParty();
  const recipient = emptyParty();

  const senderWalletPatterns = [
    new RegExp(
      `(?:من|from)\\s*(?:رقم\\s*)?(?:محفظه(?:ك)?\\s*)?(${WALLET})`,
      "i",
    ),
  ];
  for (const pattern of senderWalletPatterns) {
    const match = text.match(pattern);
    if (match) {
      sender.wallet = match[1]!;
      break;
    }
  }

  const recipientWalletPatterns = [
    new RegExp(
      `(?:الي|علي|to)\\s*(?:رقم\\s*)?(?:محفظه(?:ك)?\\s*)?(${WALLET})`,
      "i",
    ),
    new RegExp(`(?:لرقم|ل\\s*رقم)\\s*(${WALLET})`, "i"),
    new RegExp(`(${WALLET})\\s*(?:محفظتك|wallet)`, "i"),
    new RegExp(`(?:محفظتك|wallet)\\s*(?:رقم\\s*)?(${WALLET})`, "i"),
  ];
  for (const pattern of recipientWalletPatterns) {
    const match = text.match(pattern);
    if (match) {
      recipient.wallet = match[1]!;
      break;
    }
  }

  const ownWalletMatch =
    text.match(new RegExp(`(${WALLET})\\s*محفظتك`, "i")) ??
    text.match(new RegExp(`محفظتك\\s*(?:رقم\\s*)?(${WALLET})`, "i"));
  const ownWallet = ownWalletMatch?.[1] ?? null;

  const walletHits = extractWallets(text);
  const uniqueWallets = [...new Set(walletHits.map((hit) => hit.value))];

  if (direction === "received") {
    if (!recipient.wallet && ownWallet) recipient.wallet = ownWallet;
    if (!sender.wallet) {
      sender.wallet =
        uniqueWallets.find(
          (wallet) => wallet !== recipient.wallet && wallet !== ownWallet,
        ) ?? null;
    }
  } else if (direction === "sent") {
    if (!sender.wallet && ownWallet) sender.wallet = ownWallet;
    if (!recipient.wallet) {
      recipient.wallet =
        uniqueWallets.find(
          (wallet) => wallet !== sender.wallet && wallet !== ownWallet,
        ) ?? null;
    }
  } else {
    if (!sender.wallet && uniqueWallets[0]) sender.wallet = uniqueWallets[0];
    if (!recipient.wallet && uniqueWallets[1]) {
      recipient.wallet = uniqueWallets[1];
    }
  }

  // If the text only contains two unlabelled wallets, the first is normally
  // the source and the second is the destination.
  if (!sender.wallet && !recipient.wallet && uniqueWallets.length >= 2) {
    sender.wallet = uniqueWallets[0]!;
    recipient.wallet = uniqueWallets[1]!;
  } else if (sender.wallet && !recipient.wallet) {
    recipient.wallet =
      uniqueWallets.find((wallet) => wallet !== sender.wallet) ?? null;
  } else if (recipient.wallet && !sender.wallet) {
    sender.wallet =
      uniqueWallets.find((wallet) => wallet !== recipient.wallet) ?? null;
  }

  const accountPatterns = [
    new RegExp(
      `(?:حساب(?:كم|ك)?|account)\\s*(?:رقم|no\\.?)?\\s*([xX*]{2,}\\d{2,6}|\\d{4,})`,
      "gi",
    ),
    new RegExp(
      `([xX*]{2,}\\d{2,6}|\\d{4,})\\s*(?:حساب|account)`,
      "gi",
    ),
  ];

  for (const pattern of accountPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const account = match[1];
      if (!account || isPhoneLike(account) || isLikelyDate(account)) continue;

      const index = (match.index ?? 0) + match[0].indexOf(account);
      if (
        /^\d{4}$/.test(account) &&
        Number(account) >= 1900 &&
        Number(account) <= 2100
      ) {
        continue;
      }
      if (hasLabelBefore(text, index, /(?:الي|علي|to)\s*(?:حساب(?:ك|كم)?\s*)?(?:رقم\s*)?$/i)) {
        if (!recipient.account) recipient.account = account;
      } else if (hasLabelBefore(text, index, /(?:من|from)\s*(?:حساب(?:ك|كم)?\s*)?(?:رقم\s*)?$/i)) {
        if (!sender.account) sender.account = account;
      } else if (direction === "received") {
        if (!recipient.account) recipient.account = account;
      } else if (!sender.account) {
        sender.account = account;
      }
    }
  }

  if (!sender.account && !recipient.account) {
    const masked = text.match(/\b([xX*]{2,}\d{2,6})\b/);
    if (masked) {
      if (direction === "received") recipient.account = masked[1]!;
      else sender.account = masked[1]!;
    }
  }

  const nameLabel =
    /(?:المسجل\s*باسم|باسم|registered\s+as|name\s*:)/i;
  const nameMatch = nameLabel.exec(text);

  if (nameMatch) {
    const start = (nameMatch.index ?? 0) + nameMatch[0].length;
    const window = text.slice(start, start + 90);
    const latinName = window.match(
      /\b([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){1,4})\b/,
    );
    const arabicName = window.match(
      /([\u0600-\u06FF]{3,}(?:\s+[\u0600-\u06FF]{3,}){1,3})/,
    );
    const name = latinName?.[1] ?? arabicName?.[1] ?? null;

    if (name) {
      const prefix = text.slice(Math.max(0, (nameMatch.index ?? 0) - 80), nameMatch.index);
      if (/(?:من|from)/i.test(prefix) || direction === "received") {
        sender.name = name;
      } else {
        recipient.name = name;
      }
    }
  }

  return { sender, recipient };
}

export function extractPayment(rawText: string): ExtractedPayment {
  const text = normalizeText(rawText);

  const provider = detectProvider(text);
  const channel = detectChannel(text);
  const direction = detectDirection(text);
  const status = detectStatus(text);
  const currency = detectCurrency(text);

  const amount = pickAmount(text);
  const fee = pickFee(text);
  let total = pickTotal(text);
  const balanceAfter = pickBalance(text);

  const hasTotalLabel = /(?:^|\n)\s*(?:الاجمالي|total)/i.test(text);

  if (total !== null && amount !== null && total < amount) {
    total = null;
  }

  if (
    total === null &&
    hasTotalLabel &&
    amount !== null &&
    fee !== null
  ) {
    total = Math.round((amount + fee) * 100) / 100;
  }

  let inferredAmount = amount;
  if (
    inferredAmount === null &&
    total !== null &&
    fee !== null &&
    total > fee
  ) {
    inferredAmount = Math.round((total - fee) * 100) / 100;
  }

  let inferredFee = fee;
  if (
    inferredFee === null &&
    total !== null &&
    inferredAmount !== null &&
    total > inferredAmount
  ) {
    inferredFee = Math.round((total - inferredAmount) * 100) / 100;
  }

  const date = pickDate(text);
  const time = pickTime(text);
  const transactionId = pickTransactionId(text);
  const reference = pickReference(text);
  const { sender, recipient } = extractParties(text, direction);

  return PaymentSchema.parse({
    provider,
    channel,
    direction,
    status,
    amount: inferredAmount,
    currency:
      currency ??
      (inferredAmount !== null && provider !== "unknown" ? "EGP" : null),
    fee: inferredFee,
    total,
    balanceAfter,
    sender,
    recipient,
    date,
    time,
    transactionId,
    reference,
  });
}

export function findMissingFields(payment: ExtractedPayment): string[] {
  const missing: string[] = [];

  if (payment.provider === "unknown") missing.push("provider");
  if (payment.amount === null) missing.push("amount");
  if (payment.date === null) missing.push("date");
  if (payment.time === null) missing.push("time");
  if (payment.transactionId === null && payment.reference === null) {
    missing.push("transactionId");
  }
  if (!payment.sender.name && !payment.sender.wallet && !payment.sender.account) {
    missing.push("sender");
  }
  if (
    !payment.recipient.name &&
    !payment.recipient.wallet &&
    !payment.recipient.account
  ) {
    missing.push("recipient");
  }

  return missing;
}
