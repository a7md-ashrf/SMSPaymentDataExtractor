// src/ocr.ts

import { createWorker, PSM } from "tesseract.js";

export const DEFAULT_LANGUAGES = ["ara", "eng"] as const;

/** Image bytes accepted by the OCR layer. */
export type ImageInput = ArrayBuffer | ArrayBufferView;

export type OcrWorker = Awaited<ReturnType<typeof createWorker>>;

export type OcrResult = {
  /** Full text recognized in the image. */
  text: string;
  /** Tesseract confidence between 0 and 100. */
  confidence: number;
};

const WALLET_RE = /01[0125]\d{8}/g;

function toImageBytes(image: ImageInput): Uint8Array {
  if (image instanceof ArrayBuffer) {
    return new Uint8Array(image);
  }

  return new Uint8Array(image.buffer, image.byteOffset, image.byteLength);
}

function collectWallets(text: string): Set<string> {
  return new Set(text.match(WALLET_RE) ?? []);
}

/**
 * Recover wallet numbers that the primary (Arabic + English) OCR pass missed.
 *
 * Tesseract's Arabic model occasionally drops long English digit runs that are
 * embedded in an Arabic SMS. A second pass with the English model reliably
 * reads those runs, so we merge any wallet that is missing from the primary
 * text. Only wallet-shaped numbers (01xxxxxxxxx) are added to avoid polluting
 * the text with unrelated digit noise.
 */
// (no cached English worker; created per recognition to avoid lingering handles)

/**
 * Start a Tesseract worker configured for screenshot OCR.
 *
 * Keep the worker alive while processing a batch and call `terminate()` when
 * finished. The returned object is the raw Tesseract worker, so advanced users
 * can still call any worker method directly.
 */
export async function createOcrWorker(
  languages: string | string[] = [...DEFAULT_LANGUAGES],
): Promise<OcrWorker> {
  const worker = await createWorker(languages);

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  });

  return worker;
}

/** Run OCR on an ArrayBuffer, Buffer, or typed-array view. */
async function recognizeWithWorker(
  worker: OcrWorker,
  image: ImageInput,
): Promise<OcrResult> {
  const { data } = await worker.recognize(
    toImageBytes(image) as unknown as Buffer,
  );

  return {
    text: data.text,
    confidence: data.confidence,
  };
}

export async function recognizeImage(
  worker: OcrWorker,
  image: ImageInput,
): Promise<OcrResult> {
  const primary = await recognizeWithWorker(worker, image);

  // Only attempt a supplemental English pass when the primary text is missing
  // wallet numbers. This keeps the common (already-complete) case fast.
  const primaryWallets = collectWallets(primary.text);
  let englishText: string | null = null;

  let englishWorker: OcrWorker | null = null;
  try {
    englishWorker = await createOcrWorker("eng");
    const english = await recognizeWithWorker(englishWorker, image);
    englishText = english.text;
  } catch {
    englishText = null;
  } finally {
    if (englishWorker) {
      try {
        await englishWorker.terminate();
      } catch {
        // ignore
      }
    }
  }

  if (englishText) {
    const missing = [...collectWallets(englishText)].filter(
      (wallet) => !primaryWallets.has(wallet),
    );

    if (missing.length > 0) {
      return {
        text: `${primary.text}\n${missing.join("\n")}`,
        confidence: primary.confidence,
      };
    }
  }

  return primary;
}
