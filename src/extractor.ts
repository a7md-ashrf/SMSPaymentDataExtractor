// src/extractor.ts

import { readFile } from "node:fs/promises";
import {
  createOcrWorker,
  DEFAULT_LANGUAGES,
  recognizeImage,
  type ImageInput,
  type OcrWorker,
} from "./ocr";
import { extractPaymentsFromText } from "./parser";
import type { ExtractedPayment } from "./schema";

export type { ImageInput } from "./ocr";

export type PaymentExtractorOptions = {
  /** Tesseract languages. Defaults to Arabic + English. */
  languages?: string | string[];
};

export type RecognitionResult = {
  /** Full OCR text from the image. */
  text: string;
  /** Tesseract confidence between 0 and 100. */
  confidence: number;
  /** Every payment message found in the image, in reading order. */
  payments: ExtractedPayment[];
};

export interface PaymentExtractor {
  /**
   * Recognize an image supplied as an ArrayBuffer (or any typed-array view,
   * including a Node Buffer) and extract every payment message it contains.
   */
  extract(image: ImageInput): Promise<ExtractedPayment[]>;

  /** Convenience wrapper around `extract` for tests and server-side code. */
  extractFromPath(imagePath: string): Promise<ExtractedPayment[]>;

  /** Extract payments from already-recognized text without running OCR. */
  extractFromText(text: string): ExtractedPayment[];

  /** Recognize an image and return the raw OCR details alongside payments. */
  recognize(image: ImageInput): Promise<RecognitionResult>;

  /** Release the underlying Tesseract worker. */
  terminate(): Promise<void>;
}

/**
 * Create a reusable extractor. Reusing one extractor keeps a single Tesseract
 * worker alive across images, which is much faster when processing a batch.
 */
export function createPaymentExtractor(
  options: PaymentExtractorOptions = {},
): PaymentExtractor {
  const languages = options.languages ?? [...DEFAULT_LANGUAGES];

  let workerPromise: Promise<OcrWorker> | null = null;
  let terminated = false;

  function getWorker(): Promise<OcrWorker> {
    if (terminated) {
      return Promise.reject(
        new Error("This payment extractor has already been terminated."),
      );
    }

    workerPromise ??= createOcrWorker(languages);
    return workerPromise;
  }

  async function recognize(image: ImageInput): Promise<RecognitionResult> {
    const worker = await getWorker();
    const ocr = await recognizeImage(worker, image);

    return {
      ...ocr,
      payments: extractPaymentsFromText(ocr.text),
    };
  }

  return {
    async extract(image) {
      const { payments } = await recognize(image);
      return payments;
    },

    async extractFromPath(imagePath) {
      const image = await readFile(imagePath);
      const { payments } = await recognize(image);
      return payments;
    },

    extractFromText: extractPaymentsFromText,
    recognize,

    async terminate() {
      terminated = true;
      const pending = workerPromise;
      workerPromise = null;

      if (!pending) return;

      try {
        const worker = await pending;
        await worker.terminate();
      } catch {
        // Worker creation failed; there is nothing left to terminate.
      }
    },
  };
}

/**
 * One-shot helper for callers that do not need to reuse a worker.
 *
 * For repeated images, prefer `createPaymentExtractor()` so the OCR worker is
 * initialized once.
 */
export async function extractPaymentsFromImage(
  image: ImageInput,
  options?: PaymentExtractorOptions,
): Promise<ExtractedPayment[]> {
  const extractor = createPaymentExtractor(options);

  try {
    return await extractor.extract(image);
  } finally {
    await extractor.terminate();
  }
}

/**
 * Path-based convenience wrapper. Useful in tests and scripts where the image
 * already lives on disk.
 */
export async function extractPaymentsFromImagePath(
  imagePath: string,
  options?: PaymentExtractorOptions,
): Promise<ExtractedPayment[]> {
  const extractor = createPaymentExtractor(options);

  try {
    return await extractor.extractFromPath(imagePath);
  } finally {
    await extractor.terminate();
  }
}
