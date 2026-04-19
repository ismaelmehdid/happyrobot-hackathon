import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/app/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { DeleteAccountButton } from "@/app/components/DeleteAccountButton";
import "./globals.css";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const anton = Anton({
  weight: "400",
  variable: "--font-anton",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Konbini Happy Robot — AI Call Booth",
  description: "AI calls your crew, asks dumb questions, spits out stats.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const hideChrome =
    pathname.startsWith("/sign-in") || pathname.startsWith("/onboarding");
  const showChrome = Boolean(user) && !hideChrome;

  const meta = user?.user_metadata as
    | {
        display_name?: string;
        profile_picture_url?: string;
        linkedin_url?: string;
      }
    | undefined;
  const displayName =
    meta?.display_name || user?.phone || user?.email || "You";
  const profilePicture = meta?.profile_picture_url;

  return (
    <html
      lang="en"
      className={`${anton.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-ink">
        {showChrome && user && (
          <header className="border-b-2 border-ink bg-cream sticky top-0 z-40">
            <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 py-4">
              <Link href="/" className="flex items-center gap-3">
                <span className="display text-3xl leading-none bg-ink text-yellow px-3 py-1">
                  K
                </span>
                <span className="display text-2xl leading-none tracking-wide">
                  KONBINI <span className="text-pink">/</span> HAPPY ROBOT
                </span>
              </Link>
              <nav className="flex items-center gap-2">
                <Link
                  href="/"
                  className="display text-sm px-3 py-2 border-2 border-ink bg-pink text-white hover:bg-ink transition-colors"
                >
                  Dashboard
                </Link>
                <div
                  className="flex items-center gap-2 border-2 border-ink px-2 py-1 bg-cream"
                  title={meta?.linkedin_url ?? user.phone ?? user.email ?? ""}
                >
                  <span className="w-8 h-8 border-2 border-ink bg-yellow display text-xs flex items-center justify-center overflow-hidden relative">
                    {profilePicture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profilePicture}
                        alt={displayName}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      initialsOf(displayName)
                    )}
                  </span>
                  <span className="display text-sm max-w-[180px] truncate">
                    {displayName}
                  </span>
                </div>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="display text-sm px-3 py-2 border-2 border-ink bg-cream hover:bg-pink hover:text-white transition-colors"
                    title={user.phone ?? user.email ?? ""}
                  >
                    Sign out
                  </button>
                </form>
              </nav>
            </div>
            <div className="border-t-2 border-ink bg-yellow overflow-hidden">
              <div className="marquee-track flex items-center gap-3 whitespace-nowrap display text-sm py-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span>KONBINI HAPPY ROBOT</span>
                    <span className="w-2 h-2 bg-pink rotate-45" aria-hidden="true" />
                    <span>AI CALLS, YOUR CREW ANSWERS</span>
                    <span className="w-2 h-2 bg-pink rotate-45" aria-hidden="true" />
                    <span>10 QUESTIONS, 2 CHOICES, NO MERCY</span>
                    <span className="w-2 h-2 bg-pink rotate-45" aria-hidden="true" />
                  </div>
                ))}
              </div>
            </div>
          </header>
        )}
        <main className="flex-1">{children}</main>
        {showChrome && user && (
          <footer className="border-t-2 border-ink bg-ink text-cream py-6">
            <div className="max-w-[1400px] mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
              <span className="display text-lg">© KONBINI HAPPY ROBOT — NOT A REAL MEDIA</span>
              <span className="text-xs opacity-70">Made with AI calls & bad coffee.</span>
              <DeleteAccountButton />
            </div>
          </footer>
        )}
      </body>
    </html>
  );
}
