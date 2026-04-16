// Paste this entire file in the browser DevTools console on http://localhost:3000
// (any page of the app). It reads the current enriched roster from localStorage,
// formats it as TypeScript, copies it to your clipboard, and downloads a file.
// Then replace the body of app/lib/participants.seed.ts with the clipboard content.

(() => {
  const raw = localStorage.getItem("konbini.participants.v1");
  if (!raw) {
    console.error("No participants in localStorage. Run enrichment on /admin first.");
    return;
  }
  const people = JSON.parse(raw);
  const enriched = people.filter((p) => p.enriched).length;
  const body =
    `import type { Person } from "./data";\n\n` +
    `// Generated from localStorage on ${new Date().toISOString()}.\n` +
    `// ${people.length} participants, ${enriched} enriched.\n` +
    `export const PARTICIPANTS_SEED: Person[] = ${JSON.stringify(people, null, 2)};\n`;

  try {
    navigator.clipboard.writeText(body);
    console.log("%c✓ Copied to clipboard.", "color: #0a0; font-weight: bold");
  } catch {
    console.warn("Clipboard copy failed — use the downloaded file.");
  }

  const blob = new Blob([body], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "participants.seed.ts";
  a.click();
  URL.revokeObjectURL(url);

  console.log(
    `%cPaste into app/lib/participants.seed.ts — ${people.length} participants, ${enriched} enriched.`,
    "color: #ff0066"
  );
})();
