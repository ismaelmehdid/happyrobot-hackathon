"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/app/lib/supabase/client";
import {
  verifyOtpFormSchema,
  type VerifyOtpFormValues,
} from "@/app/lib/schemas";
import posthog from "posthog-js";

export default function VerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") || "";
  const redirectTo = searchParams.get("redirect") || "/";

  const [serverError, setServerError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resending, startResend] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<VerifyOtpFormValues>({
    resolver: zodResolver(verifyOtpFormSchema),
    mode: "onChange",
    defaultValues: { code: "" },
  });

  const code = watch("code");

  useEffect(() => {
    if (!phone) router.replace("/sign-in");
  }, [phone, router]);

  const onSubmit = handleSubmit(async ({ code }) => {
    setServerError(null);
    setInfo(null);
    const supabase = createClient();
    const { error, data } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: "sms",
    });
    if (error) {
      posthog.capture("otp_verification_failed", { phone, error: error.message });
      setServerError(error.message);
      return;
    }
    const userId = data.user?.id ?? phone;
    posthog.identify(userId, { phone });
    posthog.capture("otp_verified", { phone });
    router.replace(redirectTo);
    router.refresh();
  });

  function resend() {
    setServerError(null);
    setInfo(null);
    startResend(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) setServerError(error.message);
      else setInfo("New code sent.");
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Brand plate */}
        <div className="border-2 border-ink bg-yellow p-6 mb-[-2px] relative">
          <div className="display text-xs bg-pink text-white px-2 py-1 inline-block mb-3">
            STEP 2 / 2
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
            ENTER THE 6-DIGIT CODE WE TEXTED YOU
          </div>
        </div>

        {/* Card */}
        <div className="border-2 border-ink bg-cream p-8">
          <h1 className="display text-5xl leading-[0.9] mb-2">
            ENTER <span className="bg-yellow px-2">CODE</span>
          </h1>
          <p className="text-sm opacity-70 mb-6">
            Code sent to <span className="display">{phone || "—"}</span>
          </p>

          <form
            onSubmit={onSubmit}
            noValidate
            className="flex flex-col gap-4"
          >
            <label
              htmlFor="code"
              className="display text-xs uppercase tracking-wide"
            >
              6-digit code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              aria-invalid={errors.code ? "true" : "false"}
              aria-describedby={errors.code ? "code-error" : undefined}
              className="border-2 border-ink bg-cream px-3 py-4 display text-3xl tracking-[0.5em] text-center outline-none focus:bg-yellow"
              autoFocus
              {...register("code", {
                onChange: (e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                  if (digits !== e.target.value) {
                    setValue("code", digits, { shouldValidate: true });
                  }
                },
              })}
            />
            {errors.code && (
              <p
                id="code-error"
                role="alert"
                className="display text-xs text-pink"
              >
                {errors.code.message}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting || code.length < 6}
              className="display text-sm border-2 border-ink px-4 py-3 bg-pink text-white hover:bg-ink disabled:opacity-40 transition-colors"
            >
              {isSubmitting ? "Verifying…" : "Verify & continue →"}
            </button>

            <div className="flex items-center justify-between pt-2">
              <Link
                href={`/sign-in${
                  redirectTo && redirectTo !== "/"
                    ? `?redirect=${encodeURIComponent(redirectTo)}`
                    : ""
                }`}
                className="display text-xs underline opacity-70 hover:opacity-100"
              >
                ← Use a different number
              </Link>
              <button
                type="button"
                onClick={resend}
                disabled={resending}
                className="display text-xs underline opacity-70 hover:opacity-100 disabled:opacity-40"
              >
                {resending ? "Sending…" : "Resend code"}
              </button>
            </div>
          </form>

          {info && (
            <div
              role="status"
              className="mt-4 border-2 border-ink bg-yellow text-ink p-3 display text-sm"
            >
              {info}
            </div>
          )}
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
