#!/usr/bin/env bun
// Parse already-recognized text without running OCR.
//
// Usage:
//   bun run scripts/parse-text.ts ./sample.txt
//   cat ./sample.txt | bun run scripts/parse-text.ts

import { readFile } from "node:fs/promises";
import { extractPaymentsFromText } from "../src";

async function readInput(): Promise<string> {
  const textPath = process.argv[2];
  return textPath ? readFile(textPath, "utf8") : Bun.stdin.text();
}

async function main(): Promise<number> {
  const text = (await readInput()).trim();

  if (!text) {
    console.error(
      "No text provided. Pass a text file or pipe OCR text on stdin.",
    );
    return 1;
  }

  console.log(JSON.stringify(extractPaymentsFromText(text), null, 2));
  return 0;
}

process.exitCode = await main();
