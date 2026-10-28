// src/schema.ts
import { z } from "zod";

export const PartySchema = z.object({
  name: z.string().nullable(),
  wallet: z.string().regex(/^01\d{9}$/).nullable(),
  account: z.string().nullable(),
});

export const PaymentSchema = z.object({
  provider: z.enum([
    "vodafone_cash",
    "orange_cash",
    "instapay",
    "bank",
    "unknown",
  ]),
  channel: z.enum(["sms", "app", "unknown"]),
  direction: z.enum(["sent", "received", "unknown"]),
  status: z.enum(["success", "pending", "failed", "unknown"]),

  amount: z.number().positive().nullable(),
  currency: z.string().length(3).nullable(),
  fee: z.number().nonnegative().nullable(),
  total: z.number().nonnegative().nullable(),
  balanceAfter: z.number().nonnegative().nullable(),

  sender: PartySchema,
  recipient: PartySchema,

  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),

  transactionId: z.string().nullable(),
  reference: z.string().nullable(),
});

export type Party = z.infer<typeof PartySchema>;
export type ExtractedPayment = z.infer<typeof PaymentSchema>;

export const ExtractionResultSchema = PaymentSchema.extend({
  file: z.string(),
  /** Zero-based position of the message inside the screenshot. */
  messageIndex: z.number().int().nonnegative(),
  missingFields: z.array(z.string()),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
