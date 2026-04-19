import { z } from "zod";

export const answerChoiceSchema = z.enum(["A", "B"]);
export type AnswerChoice = z.infer<typeof answerChoiceSchema>;

// HappyRobot POSTs one answer per recorded question. `answer` is normalized
// by the agent to 'A' / 'B' (or 'skipped'); `raw_answer` is the verbatim
// transcription for debugging / analytics. `question_id` is the slug from the
// prompt (e.g. 'q1').
export const webhookBodySchema = z.object({
  question_id: z
    .string({ error: "question_id is required." })
    .trim()
    .regex(/^q\d{1,2}$/, "question_id must look like 'q1'..'q10'."),
  answer: z
    .union([z.string(), z.number(), z.null()])
    .transform((v) => (v == null ? "" : String(v)).trim())
    .pipe(z.string().max(2000, "answer is too long (max 2000 chars).")),
  raw_answer: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v == null ? undefined : String(v).trim()))
    .pipe(z.string().max(2000).optional()),
  phone_number: z.string().optional(),
  contact_name: z.string().optional(),
});

export type WebhookBody = z.infer<typeof webhookBodySchema>;

// Normalize an agent-provided answer string into the A/B enum. Returns null
// when the caller skipped or we can't make sense of the value.
export function toAnswerChoice(raw: string): AnswerChoice | null {
  const s = raw.trim().toUpperCase();
  if (!s || s === "SKIPPED") return null;
  if (s === "A" || s === "OPTION A") return "A";
  if (s === "B" || s === "OPTION B") return "B";
  return null;
}
