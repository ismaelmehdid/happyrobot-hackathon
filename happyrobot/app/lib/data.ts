import { PARTICIPANTS_SEED } from "./participants.seed";

export type Question = {
  id: string;
  label: string;
  a: string;
  b: string;
};

export const QUESTIONS: Question[] = [
  { id: "q1", label: "Work rhythm", a: "996", b: "10am — smoke break — afterwork" },
  { id: "q2", label: "City", a: "Paris", b: "San Francisco" },
  { id: "q3", label: "Favorite AI", a: "Claude", b: "ChatGPT" },
  { id: "q4", label: "Team", a: "Founder", b: "VC" },
  { id: "q5", label: "Who ships it", a: "AI", b: "Human" },
  { id: "q6", label: "Cash", a: "Bootstrap (Mickey)", b: "VC money (Evil)" },
  { id: "q7", label: "Incubator", a: "Station F", b: "YC" },
  { id: "q8", label: "A lie", a: "Lying to your board", b: "Lying to your mom" },
  { id: "q9", label: "Toilets", a: "YC", b: "WC" },
  { id: "q10", label: "Robot", a: "HappyRobot", b: "SadRobot" },
];

export type Person = {
  id: string;
  name: string;
  handle: string;
  city: string;
  phone?: string;
  headline?: string;
  profilePicture?: string;
  company?: string;
  title?: string;
  linkedinUrl?: string;
  enriched?: boolean;
};

export type Answers = Record<string, "a" | "b">;
export type Store = Record<string, Answers>;

export const STORE_KEY = "konbini.answers.v1";
export const PARTICIPANTS_KEY = "konbini.participants.v1";
export const CSV_URL = "/participants.csv";

export function loadParticipants(): Person[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PARTICIPANTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Person[];
  } catch {
    return [];
  }
}

export function saveParticipants(people: Person[]) {
  localStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(people));
}

function extractSlug(url: string): string {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : url;
}

export function parseParticipantsCsv(text: string): Person[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const [, ...rows] = lines;
  return rows.map((line) => {
    const cells = line.split(",");
    const name = (cells[0] || "").trim();
    const phone = (cells[1] || "").trim();
    const linkedinUrl = (cells[2] || "").trim();
    const slug = extractSlug(linkedinUrl);
    return {
      id: `li_${slug}`,
      name,
      handle: `@${slug}`,
      city: "",
      phone: phone || undefined,
      linkedinUrl: linkedinUrl || undefined,
    } satisfies Person;
  });
}

export async function fetchSeedParticipants(): Promise<Person[]> {
  if (PARTICIPANTS_SEED.length > 0) return PARTICIPANTS_SEED;
  const res = await fetch(CSV_URL, { cache: "no-store" });
  if (!res.ok) return [];
  const text = await res.text();
  return parseParticipantsCsv(text);
}

export async function ensureSeeded(): Promise<{ list: Person[]; addedIds: string[] }> {
  const seeded = await fetchSeedParticipants();

  // When we have a hardcoded enriched seed, it is the source of truth —
  // localStorage becomes a pure cache and any missing enrichment comes from the seed.
  if (PARTICIPANTS_SEED.length > 0) {
    saveParticipants(seeded);
    return { list: seeded, addedIds: [] };
  }

  const existing = loadParticipants();
  if (existing.length === 0) {
    if (seeded.length > 0) saveParticipants(seeded);
    return { list: seeded, addedIds: [] };
  }
  const byId = new Map(existing.map((p) => [p.id, p] as const));
  const addedIds: string[] = [];
  for (const p of seeded) {
    if (!byId.has(p.id)) {
      byId.set(p.id, p);
      addedIds.push(p.id);
    }
  }
  const merged = Array.from(byId.values());
  if (addedIds.length > 0) saveParticipants(merged);
  return { list: merged, addedIds };
}

type NetrowsProfile = {
  id?: number;
  urn?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  headline?: string;
  geo?: { country?: string; city?: string; countryCode?: string };
  position?: Array<{ title?: string; companyName?: string }>;
};

export function enrichPerson(base: Person, profile: NetrowsProfile): Person {
  const first = profile.firstName?.trim() || "";
  const last = profile.lastName?.trim() || "";
  const apiName = `${first} ${last}`.trim();
  const position = profile.position?.[0];
  return {
    ...base,
    name: apiName || base.name,
    city: profile.geo?.city || profile.geo?.country || base.city,
    headline: profile.headline || base.headline,
    profilePicture: profile.profilePicture || base.profilePicture,
    company: position?.companyName || base.company,
    title: position?.title || base.title,
    enriched: true,
  };
}
