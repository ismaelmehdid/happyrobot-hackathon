import { z } from "zod";

// Schema for each entry in public/participants.json. Fields outside the roster
// (name, phone, linkedin) are optional because the JSON is authored by hand.
export const personSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  handle: z.string().min(1),
  city: z.string().default(""),
  phone: z.string().optional(),
  headline: z.string().optional(),
  profilePicture: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  company: z.string().optional(),
  title: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  enriched: z.boolean().optional(),
});

export type Person = z.infer<typeof personSchema>;

export const personArraySchema = z.array(personSchema);
