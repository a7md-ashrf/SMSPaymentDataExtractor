// src/cli/index.ts

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createPaymentExtractor } from "../extractor";
import type { ExtractionResult } from "../schema";
import { collectImagePaths } from "./inputs";
import { buildExtractionResult, formatResultSummary } from "./output";

export { collectImagePaths, listImages } from "./inputs";

/**
 * Run the command-line extractor.
 *
 * Output is a JSON array on stdout. Human-readable progress and errors go to
 * stderr so stdout remains valid JSON.
 *
 * Returns a process exit code. A missing `public/` directory is not an error;
 * it simply means there are no local images to process.
 */
export async function runCli(args = process.argv.slice(2)): Promise<number> {
  const files = await collectImagePaths(args);

  if (files.length === 0) {
    console.error(
      "No images found. Pass image paths, or add local screenshots to ./public.",
    );
    console.log("[]");
    return 0;
  }

  const extractor = createPaymentExtractor();
  const results: ExtractionResult[] = [];
  let failed = false;

  try {
    for (const file of files) {
      const name = basename(file);

      try {
        const image = await readFile(file);
        const { payments, confidence } = await extractor.recognize(image);

        if (payments.length === 0) {
          console.error(
            `${name}: OCR ${Math.round(confidence)}% | no messages found`,
          );
          continue;
        }

        payments.forEach((payment, messageIndex) => {
          const result = buildExtractionResult(name, payment, messageIndex);
          results.push(result);
          console.error(
            formatResultSummary(result, payments.length, confidence),
          );
        });
      } catch (error) {
        failed = true;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${name}: failed - ${message}`);
      }
    }

    console.log(JSON.stringify(results, null, 2));
    return failed ? 1 : 0;
  } finally {
    await extractor.terminate();
  }
}
