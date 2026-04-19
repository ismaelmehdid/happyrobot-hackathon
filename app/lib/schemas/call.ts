import { z } from "zod";
import { phoneSchema } from "./phone";

export const environmentSchema = z
  .enum(["production", "staging", "development"])
  .default("production");

export const callRequestSchema = z.object({
  phone_number: phoneSchema,
  contact_name: z
    .string()
    .trim()
    .min(1, "contact_name is required.")
    .max(100, "contact_name is too long (max 100).")
    .default("l'invité"),
  questions: z
    .string()
    .trim()
    .min(1, "questions is required.")
    .max(10_000, "questions is too long (max 10,000 chars)."),
  environment: environmentSchema,
});

export type CallRequest = z.infer<typeof callRequestSchema>;
