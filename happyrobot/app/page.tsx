"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  QUESTIONS,
  STORE_KEY,
  ensureSeeded,
  type Answers,
  type Person,
  type Store,
} from "./lib/data";

const ACCENTS = ["bg-pink text-white", "bg-yellow text-ink", "bg-ink text-yellow"] as const;

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function loadStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStore(store: Store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

export default function Home() {
  const [store, setStore] = useState<Store>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setStore(loadStore());
    ensureSeeded().then(({ list }) => {
      setPeople(list);
      setHydrated(true);
    });
  }, []);

  const selected = useMemo(
    () => people.find((p) => p.id === selectedId) ?? null,
    [selectedId, people]
  );
  const selectedAnswers: Answers = (selected && store[selected.id]) || {};

  const totalAnswered = Object.values(store).filter(
    (a) => Object.keys(a).length === QUESTIONS.length
  ).length;

  function updateAnswer(personId: string, qId: string, choice: "a" | "b") {
    setStore((prev) => {
      const next: Store = {
        ...prev,
        [personId]: { ...(prev[personId] || {}), [qId]: choice },
      };
      saveStore(next);
      return next;
    });
  }

  function randomise(personId: string) {
    setStore((prev) => {
      const answers: Answers = {};
      for (const q of QUESTIONS) {
        answers[q.id] = Math.random() > 0.5 ? "a" : "b";
      }
      const next = { ...prev, [personId]: answers };
      saveStore(next);
      return next;
    });
  }

  function reset(personId: string) {
    setStore((prev) => {
      const next = { ...prev };
      delete next[personId];
      saveStore(next);
      return next;
    });
  }

  function statusOf(id: string) {
    const count = Object.keys(store[id] || {}).length;
    if (count === 0) return { label: "EN ATTENTE", tone: "bg-cream border-ink text-ink" };
    if (count === QUESTIONS.length)
      return { label: "TERMINÉ", tone: "bg-ink text-yellow border-ink" };
    return { label: `${count}/${QUESTIONS.length}`, tone: "bg-pink text-white border-ink" };
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-10">
      {/* Hero */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-10">
        <div className="md:col-span-8 border-2 border-ink bg-cream p-8 relative overflow-hidden">
          <span className="display text-sm bg-pink text-white px-2 py-1 inline-block mb-4">
            EXCLU
          </span>
          <h1 className="display text-6xl md:text-8xl leading-[0.85] mb-4">
            L&apos;IA APPELLE
            <br />
            <span className="text-pink">{hydrated ? people.length : "…"}</span>{" "}
            PARTICIPANTS
            <br />
            ET POSE <span className="bg-yellow px-2">10 QUESTIONS</span>
          </h1>
          <p className="max-w-xl text-lg mt-4">
            Dix dilemmes ultra-clivants, une IA au bout du fil, zéro filtre. File au{" "}
            <Link href="/dashboard" className="underline font-semibold text-pink">
              dashboard
            </Link>{" "}
            pour voir qui s&apos;est grillé.
          </p>
          <div className="absolute right-6 bottom-6 display text-8xl text-pink/20 leading-none select-none">
            {hydrated ? String(totalAnswered).padStart(2, "0") : "00"}
          </div>
        </div>
        <div className="md:col-span-4 grid grid-rows-3 gap-6">
          <div className="border-2 border-ink bg-pink text-white p-5">
            <div className="display text-xs opacity-80">RÉPONDANTS</div>
            <div className="display text-5xl leading-none mt-1">{people.length}</div>
          </div>
          <div className="border-2 border-ink bg-yellow text-ink p-5">
            <div className="display text-xs opacity-80">QUESTIONS</div>
            <div className="display text-5xl leading-none mt-1">{QUESTIONS.length}</div>
          </div>
          <div className="border-2 border-ink bg-ink text-cream p-5">
            <div className="display text-xs opacity-60">TERMINÉS</div>
            <div className="display text-5xl leading-none mt-1">
              {hydrated ? totalAnswered : 0}
            </div>
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="mb-4 flex items-end justify-between">
        <h2 className="display text-3xl">
          <span className="bg-ink text-yellow px-2">LE CASTING</span>
        </h2>
        <p className="text-sm opacity-70">
          Clique pour ouvrir la fiche de questions.
        </p>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {people.map((p, i) => {
          const status = statusOf(p.id);
          const accent = ACCENTS[i % ACCENTS.length];
          const isSelected = selectedId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`text-left border-2 border-ink bg-cream p-3 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#0a0a0a] transition-all ${
                isSelected ? "shadow-[4px_4px_0_#ff0066] -translate-y-0.5" : ""
              }`}
            >
              <div
                className={`aspect-square ${accent} display text-4xl flex items-center justify-center border-2 border-ink mb-2 overflow-hidden relative`}
              >
                {p.profilePicture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.profilePicture}
                    alt={p.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  initials(p.name)
                )}
              </div>
              <div className="display text-base leading-tight truncate">{p.name}</div>
              <div className="text-xs opacity-60 truncate">
                {p.title ? p.title : p.city}
              </div>
              <div
                className={`display text-[10px] mt-2 inline-block px-2 py-0.5 border-2 ${status.tone}`}
              >
                {hydrated ? status.label : "…"}
              </div>
            </button>
          );
        })}
      </section>

      {/* Slide-over panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-ink/60"
            onClick={() => setSelectedId(null)}
            aria-label="Fermer"
          />
          <aside className="w-full max-w-xl bg-cream border-l-2 border-ink overflow-y-auto">
            <div className="sticky top-0 z-10 bg-yellow border-b-2 border-ink p-5 flex items-start gap-4">
              {selected.profilePicture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.profilePicture}
                  alt={selected.name}
                  className="w-20 h-20 object-cover border-2 border-ink shrink-0"
                />
              ) : (
                <div className="w-20 h-20 bg-pink text-white border-2 border-ink display text-3xl flex items-center justify-center shrink-0">
                  {initials(selected.name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="display text-xs text-pink">FICHE D&apos;APPEL</div>
                <div className="display text-3xl leading-none mt-1 truncate">
                  {selected.name}
                </div>
                {selected.title && (
                  <div className="text-xs mt-1">
                    {selected.title}
                    {selected.company ? ` @ ${selected.company}` : ""}
                  </div>
                )}
                <div className="text-xs opacity-70 mt-1 truncate">
                  {selected.handle}
                  {selected.city ? ` · ${selected.city}` : ""}
                </div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="display text-lg border-2 border-ink bg-cream w-10 h-10 flex items-center justify-center hover:bg-pink hover:text-white shrink-0"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 flex gap-2 border-b-2 border-ink">
              <button
                onClick={() => randomise(selected.id)}
                className="display text-xs border-2 border-ink px-3 py-2 bg-cream hover:bg-yellow"
              >
                🎲 Simuler l&apos;appel
              </button>
              <button
                onClick={() => reset(selected.id)}
                className="display text-xs border-2 border-ink px-3 py-2 bg-cream hover:bg-pink hover:text-white"
              >
                Effacer
              </button>
              <div className="ml-auto display text-xs border-2 border-ink px-3 py-2 bg-ink text-cream">
                {Object.keys(selectedAnswers).length}/{QUESTIONS.length}
              </div>
            </div>

            <ol className="divide-y-2 divide-ink">
              {QUESTIONS.map((q, i) => {
                const choice = selectedAnswers[q.id];
                return (
                  <li key={q.id} className="p-5">
                    <div className="flex items-baseline gap-3 mb-3">
                      <span className="display text-3xl text-pink leading-none">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <div className="display text-xs opacity-70">{q.label}</div>
                        <div className="display text-lg leading-tight">
                          {q.a} <span className="text-pink">vs</span> {q.b}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updateAnswer(selected.id, q.id, "a")}
                        className={`display text-sm border-2 border-ink px-3 py-3 text-left leading-tight transition-colors ${
                          choice === "a"
                            ? "bg-ink text-yellow"
                            : "bg-cream hover:bg-yellow"
                        }`}
                      >
                        A · {q.a}
                      </button>
                      <button
                        onClick={() => updateAnswer(selected.id, q.id, "b")}
                        className={`display text-sm border-2 border-ink px-3 py-3 text-left leading-tight transition-colors ${
                          choice === "b"
                            ? "bg-pink text-white"
                            : "bg-cream hover:bg-pink hover:text-white"
                        }`}
                      >
                        B · {q.b}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="p-5 flex gap-2 border-t-2 border-ink">
              <Link
                href="/dashboard"
                className="display text-sm border-2 border-ink px-4 py-3 bg-pink text-white hover:bg-ink flex-1 text-center"
              >
                Voir le dashboard →
              </Link>
              <button
                onClick={() => setSelectedId(null)}
                className="display text-sm border-2 border-ink px-4 py-3 bg-cream hover:bg-yellow"
              >
                Fermer
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
