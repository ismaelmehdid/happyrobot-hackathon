import { personArraySchema, type Person } from "./schemas/participant";

export type { Person };

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

export const ROSTER_URL = "/api/roster";

export async function fetchSeedParticipants(): Promise<Person[]> {
  const res = await fetch(ROSTER_URL, { cache: "no-store" });
  if (!res.ok) return [];
  const raw = await res.json();
  const parsed = personArraySchema.safeParse(raw);
  if (!parsed.success) {
    console.error("roster failed schema validation", parsed.error.issues);
    return [];
  }
  return parsed.data;
}

export async function ensureSeeded(): Promise<{ list: Person[] }> {
  const list = await fetchSeedParticipants();
  return { list };
}
