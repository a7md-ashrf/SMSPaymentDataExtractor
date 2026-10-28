#!/usr/bin/env bun
// Run OCR only and print the recognized text. Useful when tuning the parser.
//
// Usage:
//   bun run scripts/ocr-image.ts ./public/receipt.png

import { readFile } from "node:fs/promises";
import { createOcrWorker, recognizeImage } from "../src";

async function main(): Promise<number> {
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error("Usage: bun run scripts/ocr-image.ts <image-path>");
    return 1;
  }

  const worker = await createOcrWorker();

  try {
    const image = await readFile(imagePath);
    const { text, confidence } = await recognizeImage(worker, image);

    console.error(`OCR confidence: ${Math.round(confidence)}%`);
    console.log(text);
    return 0;
  } finally {
    await worker.terminate();
  }
}

process.exitCode = await main();
