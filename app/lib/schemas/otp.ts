import { z } from "zod";

export const otpSchema = z
  .string({ error: "Enter the 6-digit code." })
  .trim()
  .regex(/^\d{6}$/, "The code must be exactly 6 digits.");

export type Otp = z.infer<typeof otpSchema>;
