export type Question = {
  id: string;
  label: string;
  a: string;
  b: string;
};

export const QUESTIONS: Question[] = [
  { id: "q1", label: "Rythme de taf", a: "996", b: "10h — pause clope — afterwork" },
  { id: "q2", label: "Ville", a: "Paris", b: "San Francisco" },
  { id: "q3", label: "IA préférée", a: "Claude", b: "ChatGPT" },
  { id: "q4", label: "Camp", a: "Founder", b: "VC" },
  { id: "q5", label: "Qui pour le faire", a: "IA", b: "Humain" },
  { id: "q6", label: "Cash", a: "Bootstrap (Mickey)", b: "VC money (Evil)" },
  { id: "q7", label: "Parcours", a: "PhD", b: "YC" },
  { id: "q8", label: "Incubateur", a: "Station F", b: "YC" },
  { id: "q9", label: "Un mensonge", a: "Mentir à ton board", b: "Mentir à ta mère" },
  { id: "q10", label: "Toilettes", a: "YC", b: "WC" },
];

export type Person = {
  id: string;
  name: string;
  handle: string;
  city: string;
  headline?: string;
  profilePicture?: string;
  company?: string;
  title?: string;
  linkedinUrl?: string;
};

const NAMES = [
  ["Léa", "Martin"], ["Hugo", "Dupont"], ["Chloé", "Bernard"], ["Arthur", "Petit"],
  ["Inès", "Rousseau"], ["Jules", "Moreau"], ["Camille", "Laurent"], ["Antoine", "Simon"],
  ["Louise", "Michel"], ["Gabriel", "Lefèvre"], ["Emma", "Leroy"], ["Raphaël", "Roux"],
  ["Sarah", "David"], ["Nathan", "Blanc"], ["Zoé", "Garnier"], ["Théo", "Faure"],
  ["Manon", "Durand"], ["Lucas", "Mercier"], ["Romane", "Fontaine"], ["Paul", "Gauthier"],
  ["Alice", "Boyer"], ["Thomas", "Chevalier"], ["Juliette", "Morel"], ["Maxime", "Dubois"],
  ["Sophie", "André"], ["Victor", "Lopez"], ["Clara", "Fournier"], ["Baptiste", "Noël"],
  ["Eva", "Henry"], ["Oscar", "Marchand"],
];

const CITIES = ["Paris", "San Francisco", "Lyon", "Marseille", "Berlin", "Londres", "New York", "Toulouse"];

const slug = (s: string) =>
  s.toLowerCase().replace(/[éè]/g, "e").replace(/[ô]/g, "o").replace(/[ï]/g, "i");

export const DEFAULT_PEOPLE: Person[] = NAMES.map(([first, last], i) => ({
  id: `p${i + 1}`,
  name: `${first} ${last}`,
  handle: `@${slug(first)}.${slug(last)}`,
  city: CITIES[i % CITIES.length],
}));

export type Answers = Record<string, "a" | "b">;
export type Store = Record<string, Answers>;

export const STORE_KEY = "konbini.answers.v1";
export const PARTICIPANTS_KEY = "konbini.participants.v1";

export function loadParticipants(): Person[] {
  if (typeof window === "undefined") return DEFAULT_PEOPLE;
  try {
    const raw = localStorage.getItem(PARTICIPANTS_KEY);
    if (!raw) return DEFAULT_PEOPLE;
    const parsed = JSON.parse(raw) as Person[];
    return parsed.length > 0 ? parsed : DEFAULT_PEOPLE;
  } catch {
    return DEFAULT_PEOPLE;
  }
}

export function saveParticipants(people: Person[]) {
  localStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(people));
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

export function profileToPerson(
  profile: NetrowsProfile,
  linkedinUrl?: string
): Person {
  const first = profile.firstName?.trim() || "";
  const last = profile.lastName?.trim() || "";
  const name = `${first} ${last}`.trim() || profile.username || "Inconnu";
  const username = profile.username || String(profile.id || profile.urn || name);
  const position = profile.position?.[0];
  return {
    id: `li_${username}`,
    name,
    handle: `@${username}`,
    city: profile.geo?.city || profile.geo?.country || "",
    headline: profile.headline,
    profilePicture: profile.profilePicture,
    company: position?.companyName,
    title: position?.title,
    linkedinUrl,
  };
}
