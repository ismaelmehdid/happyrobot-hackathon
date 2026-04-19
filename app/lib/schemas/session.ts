import { z } from "zod";

// Session IDs are generated with crypto.randomUUID() on the server.
export const sessionIdSchema = z
  .string({ error: "session query param is required." })
  .uuid("session must be a valid UUID.");

export const sessionQuerySchema = z.object({
  session: sessionIdSchema,
});

export type SessionId = z.infer<typeof sessionIdSchema>;
