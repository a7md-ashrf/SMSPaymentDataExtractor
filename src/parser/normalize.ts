// src/parser/normalize.ts

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Convert Arabic-Indic and Persian digits to plain ASCII digits. */
export function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (char) => {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(char);
    if (arabicIndex !== -1) return String(arabicIndex);

    const persianIndex = EASTERN_ARABIC_DIGITS.indexOf(char);
    if (persianIndex !== -1) return String(persianIndex);

    return char;
  });
}

/**
 * Fold Arabic letters that OCR commonly mixes up, so a label such as
 * "الخدمة" still matches "الخدمه" and "إلى" still matches "الى".
 */
export function foldArabic(input: string): string {
  return input
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[ﻻﻼ]/g, "لا");
}

/** Normalize the raw OCR text before any field matching is attempted. */
export function normalizeText(input: string): string {
  return foldArabic(normalizeDigits(input))
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[٬]/g, ",")
    .replace(/[٫]/g, ".")
    .replace(/[：]/g, ":")
    .replace(/[–—]/g, "-")
    .replace(/[،؛]/g, (char) => (char === "،" ? "," : ";"))
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parse a number such as "1,563.49" or "9.07". */
export function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null;

  const cleaned = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Convert an hour/minute/meridiem combination to HH:mm (24-hour). */
export function to24HourTime(
  hourText: string,
  minuteText: string,
  meridiem?: string,
): string | null {
  let hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (minute < 0 || minute > 59) return null;

  const marker = meridiem?.trim().toUpperCase();

  if (marker === "PM" || marker === "م") {
    if (hour < 12) hour += 12;
  } else if (marker === "AM" || marker === "ص") {
    if (hour === 12) hour = 0;
  }

  if (hour < 0 || hour > 23) return null;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
