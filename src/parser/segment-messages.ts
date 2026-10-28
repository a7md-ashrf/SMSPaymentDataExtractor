// src/parser/segment-messages.ts

import { normalizeText } from "./normalize";

const MONTH_NAMES = String.raw`JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?|يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر`;

// "Wednesday 2:04 PM", "Fri, 2 Oct at 2:31PM", "Today 3:47 PM",
// "Yesterday 11:32PM", "Saturday 9:33 PM".
const HEADER_RE = new RegExp(
  String.raw`^\s*(?:` +
    String.raw`today|yesterday|` +
    String.raw`mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?` +
    String.raw`|اليوم|امس|السبت|الاحد|الاثنين|الثلاثاء|الاربعاء|الخميس|الجمعه` +
    String.raw`)(?:,?\s+\d{1,2}\s+(?:${MONTH_NAMES}))?(?:\s+at)?\s+\d{1,2}:\d{2}\s*(?:AM|PM|ص|م)?\s*$`,
  "i",
);

// A new transaction normally starts a new message. The match is allowed to
// begin a few characters into the line because OCR sometimes prefixes junk
// such as "ag)" or "SMS:".
const TRANSACTION_START_RE =
  /(?:تم\s+(?:ال)?(?:استلام|تحويل|تنفيذ|خصم|دفع|سداد|شراء|ايداع|اضافه)|لقد\s+تم\s+(?:الدفع|التحويل|الاستلام|الخصم)|you\s+(?:have\s+)?(?:received|sent|paid|transferred)|(?:payment|transfer)\s+(?:successful|received|sent|completed|failed|of))/i;

const PREFIX_JUNK_RE = /^[\s>•·\-–—]+/;
const MAX_HEADER_LOOKBACK_LINES = 25;

function normalizeLine(line: string): string {
  return normalizeText(line).replace(PREFIX_JUNK_RE, "");
}

function isHeader(line: string): boolean {
  return HEADER_RE.test(line);
}

function isTransactionStart(line: string): boolean {
  const match = TRANSACTION_START_RE.exec(line);
  return !!match && (match.index ?? 0) <= 12;
}

function sliceLines(lines: string[], start: number, end: number): string {
  return lines.slice(start, end).join("\n").trim();
}

/**
 * Split OCR text from a screenshot into individual messages.
 *
 * Transaction-start lines are the primary boundaries. A timestamp header
 * immediately above a transaction is included in that message so date/time
 * context is preserved. If no transaction start can be found, timestamp
 * headers are used as boundaries instead.
 */
export function segmentMessages(rawText: string): string[] {
  const text = rawText.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const normalized = lines.map(normalizeLine);

  const headers: number[] = [];
  const starts: number[] = [];

  normalized.forEach((line, index) => {
    if (isHeader(line)) headers.push(index);
    if (isTransactionStart(line)) starts.push(index);
  });

  if (starts.length === 0) {
    if (headers.length === 0) return [text];
    if (headers.length === 1) {
      const segment = sliceLines(lines, headers[0]!, lines.length);
      return segment ? [segment] : [];
    }

    return headers
      .map((start, index) =>
        sliceLines(lines, start, headers[index + 1] ?? lines.length),
      )
      .filter(Boolean);
  }

  const boundaries: number[] = [];
  let previousStart = -1;

  for (const start of starts) {
    let matchingHeader: number | undefined;

    for (let index = headers.length - 1; index >= 0; index -= 1) {
      const header = headers[index]!;
      if (
        header < start &&
        header > previousStart &&
        start - header <= MAX_HEADER_LOOKBACK_LINES
      ) {
        matchingHeader = header;
        break;
      }
    }

    boundaries.push(matchingHeader ?? start);
    previousStart = start;
  }

  const uniqueBoundaries = [...new Set(boundaries)].sort((a, b) => a - b);
  const segments = uniqueBoundaries
    .map((start, index) =>
      sliceLines(
        lines,
        start,
        uniqueBoundaries[index + 1] ?? lines.length,
      ),
    )
    .filter(Boolean);

  return segments.length > 0 ? segments : [text];
}
