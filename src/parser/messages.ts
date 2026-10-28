// src/parser/messages.ts

import type { ExtractedPayment } from "../schema";
import { extractPayment } from "./extract-payment";
import { segmentMessages } from "./segment-messages";

/**
 * Extract every payment message from recognized text.
 *
 * A screenshot may contain several SMS messages. Each message is parsed
 * separately so the caller receives all transactions, in reading order.
 */
export function extractPaymentsFromText(rawText: string): ExtractedPayment[] {
  return segmentMessages(rawText).map((message) => extractPayment(message));
}
