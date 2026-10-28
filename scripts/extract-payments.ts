#!/usr/bin/env bun
// Extract payments from images and print JSON.
//
// Usage:
//   bun run scripts/extract-payments.ts
//   bun run scripts/extract-payments.ts ./public/receipt.png
//   bun run scripts/extract-payments.ts img-a.png img-b.jpg

import { runCli } from "../src/cli";

process.exitCode = await runCli(process.argv.slice(2));
