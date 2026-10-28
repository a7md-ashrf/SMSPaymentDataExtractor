#!/usr/bin/env bun
// Check every local screenshot in ./public and report inconsistencies.
// This script is optional and exits cleanly when ./public is absent.
//
// Usage:
//   bun run scripts/check-public-images.ts

import { basename, resolve } from "node:path";
import { createPaymentExtractor } from "../src";
import { listImages } from "../src/cli/inputs";

async function main(): Promise<number> {
  const images = await listImages(resolve(process.cwd(), "public"));

  if (images.length === 0) {
    console.log("No local images found in ./public; nothing to check.");
    return 0;
  }

  const extractor = createPaymentExtractor();
  let failed = false;

  try {
    for (const imagePath of images) {
      const payments = await extractor.extractFromPath(imagePath);
      const name = basename(imagePath);

      if (payments.length === 0) {
        failed = true;
        console.log(`${name}: no payments found`);
        continue;
      }

      console.log(`${name}: ${payments.length} message(s)`);
      payments.forEach((payment, index) => {
        console.log(
          `  ${index + 1}. amount=${payment.amount ?? "?"} ` +
            `id=${payment.transactionId ?? payment.reference ?? "?"}`,
        );
      });
    }
  } finally {
    await extractor.terminate();
  }

  return failed ? 1 : 0;
}

process.exitCode = await main();
