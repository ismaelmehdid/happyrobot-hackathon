import { personArraySchema, type Person } from "./schemas/participant";

export type { Person };

export type Question = {
  id: string;
  label: string;
  a: string;
  b: string;
  // Phonetic / semantic variants the STT may return for each option. The agent
  // maps any of these to the canonical A/B choice instead of giving up on the
  // answer. Keep lowercased, no punctuation.
  aliasesA?: string[];
  aliasesB?: string[];
};

export const QUESTIONS: Question[] = [
  {
    id: "q1",
    label: "Work rhythm",
    a: "996",
    b: "10am — smoke break — afterwork",
    aliasesA: ["996", "nine nine six", "9 9 6", "grind", "hustle", "china hours"],
    aliasesB: [
      "10am",
      "ten am",
      "smoke break",
      "afterwork",
      "after work",
      "french hours",
      "paris hours",
    ],
  },
  {
    id: "q2",
    label: "City",
    a: "Paris",
    b: "San Francisco",
    aliasesA: ["paris", "france", "french", "europe"],
    aliasesB: ["san francisco", "sf", "san fran", "frisco", "bay area", "california"],
  },
  {
    id: "q3",
    label: "Favorite AI",
    a: "Claude",
    b: "ChatGPT",
    aliasesA: ["claude", "cloud", "clod", "claud", "clyde", "anthropic", "the anthropic one"],
    aliasesB: [
      "chatgpt",
      "chat gpt",
      "chat g p t",
      "gpt",
      "g p t",
      "openai",
      "open ai",
      "the openai one",
    ],
  },
  {
    id: "q4",
    label: "Team",
    a: "Founder",
    b: "VC",
    aliasesA: ["founder", "founders", "entrepreneur", "builder", "ceo"],
    aliasesB: ["vc", "v c", "venture capitalist", "investor", "vee cee"],
  },
  {
    id: "q5",
    label: "Who ships it",
    a: "AI",
    b: "Human",
    aliasesA: ["ai", "a i", "the ai", "agent", "agents", "robot", "machine"],
    aliasesB: ["human", "humans", "person", "people", "me", "myself", "devs"],
  },
  {
    id: "q6",
    label: "Cash",
    a: "Bootstrap (Mickey)",
    b: "VC money (Evil)",
    aliasesA: ["bootstrap", "boot strap", "mickey", "mickey mouse", "self funded", "ramen"],
    aliasesB: ["vc", "v c", "vc money", "venture", "raise", "raised", "evil", "the evil one"],
  },
  {
    id: "q7",
    label: "Incubator",
    a: "Station F",
    b: "YC",
    aliasesA: ["station f", "station f.", "station ef", "stationf", "paris incubator"],
    aliasesB: ["yc", "y c", "why see", "y combinator", "y-combinator", "ycombinator"],
  },
  {
    id: "q8",
    label: "A lie",
    a: "Lying to your board",
    b: "Lying to your mom",
    aliasesA: ["board", "the board", "investors", "lying to the board", "lying to your board"],
    aliasesB: ["mom", "mum", "mother", "your mom", "lying to your mom", "lying to mom"],
  },
  {
    id: "q9",
    label: "Toilets",
    a: "YC",
    b: "WC",
    aliasesA: ["yc", "y c", "why see", "y combinator"],
    aliasesB: ["wc", "w c", "double u see", "toilet", "toilets", "water closet", "restroom"],
  },
  {
    id: "q10",
    label: "Robot",
    a: "HappyRobot",
    b: "SadRobot",
    aliasesA: ["happyrobot", "happy robot", "the happy one"],
    aliasesB: ["sadrobot", "sad robot", "the sad one"],
  },
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
