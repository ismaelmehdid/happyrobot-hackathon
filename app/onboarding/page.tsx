"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { saveProfile } from "@/app/actions/profile";
import {
  onboardingFormSchema,
  type OnboardingFormValues,
  ALLOWED_PICTURE_MIME,
  MAX_PICTURE_BYTES,
} from "@/app/lib/schemas";
import posthog from "posthog-js";

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const [serverError, setServerError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingFormSchema),
    mode: "onBlur",
    defaultValues: { firstName: "", lastName: "", linkedinUrl: "" },
  });

  const onSubmit = handleSubmit(async ({ firstName, lastName, linkedinUrl }) => {
    setServerError(null);
    setFileError(null);
    const fd = new FormData();
    fd.set("firstName", firstName);
    fd.set("lastName", lastName);
    if (linkedinUrl) fd.set("linkedinUrl", linkedinUrl);
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      if (
        !(ALLOWED_PICTURE_MIME as readonly string[]).includes(file.type)
      ) {
        setFileError("Profile picture must be JPEG, PNG, WebP, or GIF.");
        return;
      }
      if (file.size > MAX_PICTURE_BYTES) {
        setFileError("Profile picture must be under 5MB.");
        return;
      }
      fd.set("profilePicture", file);
    }
    const res = await saveProfile(fd);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    posthog.capture("onboarding_completed", {
      has_profile_picture: !!file,
      has_linkedin_url: !!linkedinUrl,
    });
    router.replace(redirectTo);
    router.refresh();
  });

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setPreview(null);
      return;
    }
    if (!(ALLOWED_PICTURE_MIME as readonly string[]).includes(file.type)) {
      setFileError("Profile picture must be JPEG, PNG, WebP, or GIF.");
      setPreview(null);
      return;
    }
    if (file.size > MAX_PICTURE_BYTES) {
      setFileError("Profile picture must be under 5MB.");
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="border-2 border-ink bg-yellow p-6 mb-[-2px] relative">
          <div className="display text-xs bg-pink text-white px-2 py-1 inline-block mb-3">
            ONE LAST THING
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
            TELL US WHO YOU ARE · WE ONLY ASK ONCE
          </div>
        </div>

        <div className="border-2 border-ink bg-cream p-8">
          <h1 className="display text-5xl leading-[0.9] mb-2">
            YOUR <span className="bg-pink text-white px-2">NAME</span>
          </h1>
          <p className="text-sm opacity-70 mb-6">
            We&apos;ll use this when the AI calls you, and the photo for your
            avatar. Saved on your first login — we won&apos;t ask again.
          </p>

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="firstName"
                  className="display text-xs uppercase tracking-wide"
                >
                  First name
                </label>
                <input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  placeholder="Ada"
                  aria-invalid={errors.firstName ? "true" : "false"}
                  className="border-2 border-ink bg-cream px-3 py-3 display text-base outline-none focus:bg-yellow aria-invalid:bg-pink aria-invalid:text-white"
                  autoFocus
                  {...register("firstName")}
                />
                {errors.firstName && (
                  <p role="alert" className="display text-xs text-pink">
                    {errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="lastName"
                  className="display text-xs uppercase tracking-wide"
                >
                  Last name
                </label>
                <input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Lovelace"
                  aria-invalid={errors.lastName ? "true" : "false"}
                  className="border-2 border-ink bg-cream px-3 py-3 display text-base outline-none focus:bg-yellow aria-invalid:bg-pink aria-invalid:text-white"
                  {...register("lastName")}
                />
                {errors.lastName && (
                  <p role="alert" className="display text-xs text-pink">
                    {errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="linkedinUrl"
                className="display text-xs uppercase tracking-wide"
              >
                LinkedIn URL <span className="opacity-60">(optional)</span>
              </label>
              <input
                id="linkedinUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://www.linkedin.com/in/ada-lovelace/"
                aria-invalid={errors.linkedinUrl ? "true" : "false"}
                className="border-2 border-ink bg-cream px-3 py-3 display text-base outline-none focus:bg-yellow aria-invalid:bg-pink aria-invalid:text-white"
                {...register("linkedinUrl")}
              />
              {errors.linkedinUrl && (
                <p role="alert" className="display text-xs text-pink">
                  {errors.linkedinUrl.message}
                </p>
              )}
              <p className="text-xs opacity-60">
                Adds you to the public cast roster.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="profilePicture"
                className="display text-xs uppercase tracking-wide"
              >
                Profile picture <span className="opacity-60">(optional)</span>
              </label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 border-2 border-ink bg-yellow overflow-hidden relative shrink-0">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview}
                      alt="Preview"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center display text-xs opacity-60">
                      NO PIC
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  id="profilePicture"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={onPick}
                  className="display text-sm flex-1 min-w-0 file:mr-3 file:border-2 file:border-ink file:bg-cream file:px-3 file:py-2 file:display file:text-xs file:uppercase file:hover:bg-yellow"
                />
              </div>
              {fileError && (
                <p role="alert" className="display text-xs text-pink">
                  {fileError}
                </p>
              )}
              <p className="text-xs opacity-60">
                JPEG, PNG, WebP, or GIF · max 5MB
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="display text-sm border-2 border-ink px-4 py-3 bg-ink text-yellow hover:bg-pink hover:text-white disabled:opacity-40 transition-colors"
            >
              {isSubmitting ? "Saving…" : "Save & continue →"}
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
          STORED ON YOUR ACCOUNT · ONE TIME ONLY
        </div>
      </div>
    </div>
  );
}
