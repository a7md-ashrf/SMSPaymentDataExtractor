// tests/integration/public-images.test.ts

import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import {
  createPaymentExtractor,
  extractPaymentsFromImagePath,
} from "../../src";
import { listImages } from "../../src/cli/inputs";

const PUBLIC_DIR = resolve(import.meta.dir, "../../public");
const FULL_SCREEN = join(PUBLIC_DIR, "full-screen.png");
const images = await listImages(PUBLIC_DIR);

/**
 * These tests use local screenshots when available. They are skipped when
 * `public/` is missing or empty, because the repository does not ship any
 * personal screenshots.
 *
 * Assertions intentionally avoid real amounts and transaction IDs. Exact
 * parsing behavior is covered by synthetic text fixtures in tests/fixtures.
 */
describe("local screenshot integration", () => {
  test.skipIf(!images.includes(FULL_SCREEN))(
    "extracts both SMS messages from full-screen.png",
    async () => {
      const payments = await extractPaymentsFromImagePath(FULL_SCREEN);

      expect(payments).toHaveLength(2);
      expect(
        payments.every(
          (payment) => typeof payment.amount === "number" && payment.amount > 0,
        ),
      ).toBe(true);
      expect(payments.map((payment) => payment.provider)).toEqual([
        "vodafone_cash",
        "vodafone_cash",
      ]);
      expect(payments.map((payment) => payment.direction)).toEqual([
        "received",
        "received",
      ]);

      const ids = payments.map((payment) => payment.transactionId);
      expect(ids.every((id) => id !== null && /^\d{10,}$/.test(id))).toBe(true);
      expect(new Set(ids).size).toBe(2);
    },
    180_000,
  );

  test.skipIf(images.length === 0)(
    "finds at least one payment in every local screenshot",
    async () => {
      const extractor = createPaymentExtractor();

      try {
        for (const image of images) {
          const payments = await extractor.extractFromPath(image);
          expect(payments.length, image).toBeGreaterThanOrEqual(1);
        }
      } finally {
        await extractor.terminate();
      }
    },
    300_000,
  );
});
