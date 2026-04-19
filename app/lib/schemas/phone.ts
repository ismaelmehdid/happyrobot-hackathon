import { z } from "zod";

// E.164: '+' followed by 7 to 15 digits, no leading zero after '+'.
export const phoneSchema = z
  .string({ error: "Phone number is required." })
  .trim()
  .regex(
    /^\+[1-9]\d{6,14}$/,
    "Enter phone in E.164 format, e.g. +33612345678",
  );

export type Phone = z.infer<typeof phoneSchema>;
