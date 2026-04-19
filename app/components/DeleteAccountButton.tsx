"use client";

import { useTransition } from "react";
import { deleteAccount } from "@/app/actions/profile";

export function DeleteAccountButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        const ok = window.confirm(
          "Delete your account? Your answers and session data will be permanently removed. This can't be undone.",
        );
        if (!ok) return;
        startTransition(async () => {
          await deleteAccount();
        });
      }}
      className="display text-sm px-3 py-2 border-2 border-ink bg-ink text-cream hover:bg-pink hover:text-white hover:border-pink transition-colors disabled:opacity-40"
    >
      {isPending ? "Deleting…" : "Delete account"}
    </button>
  );
}
