import { NextResponse } from "next/server";
import { z } from "zod";

type FlattenedErrors = {
  formErrors: string[];
  fieldErrors: Record<string, string[]>;
};

function flatten(error: z.ZodError): FlattenedErrors {
  const formErrors: string[] = [];
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      formErrors.push(issue.message);
      continue;
    }
    const key = issue.path.join(".");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { formErrors, fieldErrors };
}

export function zodErrorResponse(error: z.ZodError, status = 400) {
  return NextResponse.json(
    {
      error: "Invalid request.",
      issues: flatten(error),
    },
    { status },
  );
}

// Parse a JSON body against a Zod schema. Returns the parsed value or a
// NextResponse ready to return from the route handler.
export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      ),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, response: zodErrorResponse(result.error) };
  }
  return { ok: true, data: result.data };
}

// Parse search params against a Zod schema.
export function parseSearchParams<T>(
  req: Request,
  schema: z.ZodType<T>,
):
  | { ok: true; data: T }
  | { ok: false; response: NextResponse } {
  const url = new URL(req.url);
  const obj = Object.fromEntries(url.searchParams.entries());
  const result = schema.safeParse(obj);
  if (!result.success) {
    return { ok: false, response: zodErrorResponse(result.error) };
  }
  return { ok: true, data: result.data };
}
