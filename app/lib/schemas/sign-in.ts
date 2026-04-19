import { z } from "zod";
import { phoneSchema } from "./phone";
import { otpSchema } from "./otp";

export const signInFormSchema = z.object({
  phone: phoneSchema,
});

export type SignInFormValues = z.infer<typeof signInFormSchema>;

export const verifyOtpFormSchema = z.object({
  code: otpSchema,
});

export type VerifyOtpFormValues = z.infer<typeof verifyOtpFormSchema>;
