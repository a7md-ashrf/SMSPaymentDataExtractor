// src/cli/output.ts

import { findMissingFields } from "../parser";
import {
  ExtractionResultSchema,
  type ExtractedPayment,
  type ExtractionResult,
} from "../schema";

/** Add file/message metadata and validate the final CLI result. */
export function buildExtractionResult(
  file: string,
  payment: ExtractedPayment,
  messageIndex: number,
): ExtractionResult {
  return ExtractionResultSchema.parse({
    file,
    messageIndex,
    ...payment,
    missingFields: findMissingFields(payment),
  });
}

/** One-line human-readable summary for stderr. */
export function formatResultSummary(
  result: ExtractionResult,
  messageCount: number,
  confidence: number,
): string {
  const id = result.transactionId ?? result.reference ?? "?";

  return (
    `${result.file} [message ${result.messageIndex + 1}/${messageCount}]: ` +
    `OCR ${Math.round(confidence)}% | ` +
    `provider=${result.provider} direction=${result.direction} ` +
    `amount=${result.amount ?? "?"} id=${id}` +
    (result.missingFields.length
      ? ` | missing: ${result.missingFields.join(", ")}`
      : " | complete")
  );
}
