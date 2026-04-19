"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/app/lib/supabase/client";
import {
  signInFormSchema,
  type SignInFormValues,
} from "@/app/lib/schemas";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInFormSchema),
    mode: "onBlur",
    defaultValues: { phone: "" },
  });

  const onSubmit = handleSubmit(async ({ phone }) => {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) {
      setServerError(error.message);
      return;
    }
    const params = new URLSearchParams({ phone });
    if (redirectTo && redirectTo !== "/") params.set("redirect", redirectTo);
    router.push(`/sign-in/verify?${params.toString()}`);
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Brand plate */}
        <div className="border-2 border-ink bg-yellow p-6 mb-[-2px] relative">
          <div className="display text-xs bg-pink text-white px-2 py-1 inline-block mb-3">
            STEP 1 / 2
          </div>
          <div className="flex items-center gap-3 mb-1">
            <span className="display text-4xl leading-none bg-ink text-yellow px-3 py-1">
              K
            </span>
            <span className="display text-3xl leading-none tracking-wide">
              KONBINI <span className="text-pink">/</span> HAPPY ROBOT
            </span>
          </div>
          <div className="display text-xs opacity-70 mt-2">
            AI CALL BOOTH · MEMBERS ONLY
          </div>
        </div>

        {/* Card */}
        <div className="border-2 border-ink bg-cream p-8">
          <h1 className="display text-5xl leading-[0.9] mb-2">
            SIGN <span className="bg-pink text-white px-2">IN</span>
          </h1>
          <p className="text-sm opacity-70 mb-6">
            Drop your number. We text a 6-digit code. No passwords.
          </p>

          <form
            onSubmit={onSubmit}
            noValidate
            className="flex flex-col gap-4"
          >
            <label
              htmlFor="phone"
              className="display text-xs uppercase tracking-wide"
            >
              Phone number
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+33612345678"
              aria-invalid={errors.phone ? "true" : "false"}
              aria-describedby={errors.phone ? "phone-error" : undefined}
              className="border-2 border-ink bg-cream px-3 py-3 display text-lg outline-none focus:bg-yellow aria-invalid:bg-pink aria-invalid:text-white"
              autoFocus
              {...register("phone")}
            />
            {errors.phone && (
              <p
                id="phone-error"
                role="alert"
                className="display text-xs text-pink"
              >
                {errors.phone.message}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="display text-sm border-2 border-ink px-4 py-3 bg-ink text-yellow hover:bg-pink hover:text-white disabled:opacity-40 transition-colors"
            >
              {isSubmitting ? "Sending…" : "☎ Send code"}
            </button>
          </form>

          {serverError && (
            <div
              role="alert"
              className="mt-4 border-2 border-ink bg-ink text-cream p-3 display text-sm"
            >
              {serverError}
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-xs opacity-60 display">
          NO SIGN-UP · INVITED NUMBERS ONLY
        </div>
      </div>
    </div>
  );
}
