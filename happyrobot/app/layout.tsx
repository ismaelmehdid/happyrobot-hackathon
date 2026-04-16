import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

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
  title: "KONBINI — AI Call Booth",
  description: "L'IA appelle tes potes, pose des questions bêtes, recrache des stats.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${anton.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-ink">
        <header className="border-b-2 border-ink bg-cream sticky top-0 z-40">
          <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="display text-3xl leading-none bg-ink text-yellow px-3 py-1">
                K
              </span>
              <span className="display text-2xl leading-none tracking-wide">
                KONBINI <span className="text-pink">/</span> CALL
              </span>
            </Link>
            <nav className="flex items-center gap-2">
              <Link
                href="/"
                className="display text-sm px-3 py-2 border-2 border-ink bg-cream hover:bg-yellow transition-colors"
              >
                Répondants
              </Link>
              <Link
                href="/admin"
                className="display text-sm px-3 py-2 border-2 border-ink bg-cream hover:bg-yellow transition-colors"
              >
                Admin
              </Link>
              <Link
                href="/dashboard"
                className="display text-sm px-3 py-2 border-2 border-ink bg-pink text-white hover:bg-ink transition-colors"
              >
                Dashboard
              </Link>
            </nav>
          </div>
          <div className="border-t-2 border-ink bg-yellow overflow-hidden">
            <div className="marquee-track flex whitespace-nowrap display text-sm py-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <span key={i} className="px-6">
                  KONBINI CALL BOOTH <span className="text-pink">◆</span>{" "}
                  L&apos;IA APPELLE, TES POTES RÉPONDENT{" "}
                  <span className="text-pink">◆</span> 10 QUESTIONS, 2 CHOIX,
                  AUCUNE PITIÉ <span className="text-pink">◆</span>
                </span>
              ))}
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t-2 border-ink bg-ink text-cream py-6">
          <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between">
            <span className="display text-lg">© KONBINI CALL — NOT A REAL MEDIA</span>
            <span className="text-xs opacity-70">Made with AI calls & bad coffee.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
