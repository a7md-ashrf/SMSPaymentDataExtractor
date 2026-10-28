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

function toImageBytes(image: ImageInput): Uint8Array {
  if (image instanceof ArrayBuffer) {
    return new Uint8Array(image);
  }

  return new Uint8Array(image.buffer, image.byteOffset, image.byteLength);
}

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
export async function recognizeImage(
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
