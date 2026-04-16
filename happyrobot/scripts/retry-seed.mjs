#!/usr/bin/env node
// Re-runs /api/linkedin only for participants that are not yet `enriched: true`
// in app/lib/participants.seed.ts, with serial calls + backoff on 429.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SEED_PATH = join(ROOT, "app", "lib", "participants.seed.ts");
const API_URL = process.env.API_URL || "http://localhost:3000/api/linkedin";

function readSeed() {
  const src = readFileSync(SEED_PATH, "utf8");
  const m = src.match(/PARTICIPANTS_SEED:\s*Person\[\]\s*=\s*(\[[\s\S]*?\]);\s*$/m);
  if (!m) throw new Error("Cannot locate PARTICIPANTS_SEED literal in seed file.");
  return { src, before: src.slice(0, m.index), after: src.slice(m.index + m[0].length), people: JSON.parse(m[1]) };
}

function enrichPerson(base, profile) {
  const first = (profile.firstName || "").trim();
  const last = (profile.lastName || "").trim();
  const apiName = `${first} ${last}`.trim();
  const position = profile.position?.[0];
  const out = { ...base, name: apiName || base.name, enriched: true };
  out.city = profile.geo?.city || profile.geo?.country || base.city || "";
  if (profile.headline) out.headline = profile.headline;
  if (profile.profilePicture) out.profilePicture = profile.profilePicture;
  if (position?.companyName) out.company = position.companyName;
  if (position?.title) out.title = position.title;
  return out;
}

async function tryFetch(url, attempt = 0) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (res.status === 429 && attempt < 5) {
    const wait = 2000 * (attempt + 1);
    console.log(`   … 429, waiting ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
    return tryFetch(url, attempt + 1);
  }
  return res;
}

async function main() {
  const { before, after, people } = readSeed();
  const todo = people.map((p, i) => ({ p, i })).filter(({ p }) => !p.enriched && p.linkedinUrl);
  console.log(`Retrying ${todo.length}/${people.length} unenriched with LinkedIn URL.`);

  for (const { p, i } of todo) {
    process.stdout.write(`• ${p.name} … `);
    try {
      const res = await tryFetch(p.linkedinUrl);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.log(`FAIL ${res.status} ${body.slice(0, 100)}`);
      } else {
        const data = await res.json();
        people[i] = enrichPerson(p, data);
        console.log("OK");
      }
    } catch (e) {
      console.log(`ERR ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const okCount = people.filter((p) => p.enriched).length;
  const body =
    before +
    `PARTICIPANTS_SEED: Person[] = ${JSON.stringify(people, null, 2)};` +
    after.replace(/^\s*/, "");
  // Replace the header comment counts too.
  const final = body.replace(
    /\/\/ \d+ participants, \d+ enriched, \d+ skipped, \d+ failed\./,
    `// ${people.length} participants, ${okCount} enriched, ${people.length - okCount} missing.`
  );
  writeFileSync(SEED_PATH, final);
  console.log(`Wrote ${SEED_PATH} — ${okCount}/${people.length} enriched.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
