import { z } from "zod";

const nameSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(60, "Too long (max 60 chars)")
  .regex(
    /^[\p{L}][\p{L}\p{M}\s'’\-]*$/u,
    "Letters, spaces, hyphens, and apostrophes only",
  );

const linkedinUrlSchema = z
  .string()
  .trim()
  .url("Enter a valid URL")
  .refine(
    (v) => /^https?:\/\/(www\.)?linkedin\.com\/in\/[^/?#]+/i.test(v),
    "Must be a linkedin.com/in/... URL",
  );

export const onboardingFormSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  linkedinUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(linkedinUrlSchema.optional()),
});
export type OnboardingFormValues = z.infer<typeof onboardingFormSchema>;

export const profileMetadataSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  display_name: z.string().min(1),
  profile_picture_url: z.string().url().optional(),
  linkedin_url: z.string().url().optional(),
});
export type ProfileMetadata = z.infer<typeof profileMetadataSchema>;

export const ALLOWED_PICTURE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const MAX_PICTURE_BYTES = 5 * 1024 * 1024; // 5MB
