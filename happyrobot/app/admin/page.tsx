"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_PEOPLE,
  loadParticipants,
  profileToPerson,
  saveParticipants,
  type Person,
} from "../lib/data";

type LogEntry = {
  url: string;
  status: "pending" | "ok" | "error";
  message?: string;
  person?: Person;
};

export default function Admin() {
  const [people, setPeople] = useState<Person[]>([]);
  const [input, setInput] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPeople(loadParticipants());
    setHydrated(true);
  }, []);

  function persist(next: Person[]) {
    setPeople(next);
    saveParticipants(next);
  }

  async function importOne(url: string): Promise<LogEntry> {
    const entry: LogEntry = { url, status: "pending" };
    try {
      const res = await fetch("/api/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ...entry, status: "error", message: data.error || `HTTP ${res.status}` };
      }
      const person = profileToPerson(data, url);
      return { ...entry, status: "ok", person };
    } catch (e) {
      return { ...entry, status: "error", message: e instanceof Error ? e.message : "Erreur réseau" };
    }
  }

  async function handleImport() {
    const urls = input
      .split(/[\n,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (urls.length === 0) return;
    setBusy(true);
    setLogs(urls.map((url) => ({ url, status: "pending" })));

    const results: LogEntry[] = [];
    for (let i = 0; i < urls.length; i++) {
      const result = await importOne(urls[i]);
      results.push(result);
      setLogs([...results, ...urls.slice(i + 1).map((u) => ({ url: u, status: "pending" as const }))]);
    }

    const newPeople = results
      .filter((r) => r.status === "ok" && r.person)
      .map((r) => r.person!);

    const existing = loadParticipants();
    const base = existing === DEFAULT_PEOPLE ? [] : existing;
    const byId = new Map<string, Person>();
    for (const p of base) byId.set(p.id, p);
    for (const p of newPeople) byId.set(p.id, p);
    persist(Array.from(byId.values()));

    setInput("");
    setBusy(false);
  }

  function removeOne(id: string) {
    persist(people.filter((p) => p.id !== id));
  }

  function resetToDefaults() {
    if (!confirm("Remettre les 30 profils fictifs et vider les profils LinkedIn importés ?")) return;
    localStorage.removeItem("konbini.participants.v1");
    setPeople(DEFAULT_PEOPLE);
  }

  function clearAll() {
    if (!confirm("Vraiment tout vider ?")) return;
    persist([]);
  }

  const isDefault =
    people.length === DEFAULT_PEOPLE.length &&
    people.every((p, i) => p.id === DEFAULT_PEOPLE[i].id);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-10">
      <section className="border-2 border-ink bg-ink text-cream p-8 mb-6">
        <span className="display text-sm bg-pink text-white px-2 py-1 inline-block mb-3">
          ADMIN
        </span>
        <h1 className="display text-5xl md:text-7xl leading-[0.9]">
          IMPORT LINKEDIN
          <br />
          <span className="text-yellow">VIA NETROWS</span>
        </h1>
        <p className="mt-4 opacity-80 max-w-xl">
          Colle une ou plusieurs URLs LinkedIn (une par ligne). L&apos;API va
          chercher les profils et peupler le casting.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="border-2 border-ink bg-cream p-5">
          <label className="display text-sm block mb-2">URLs LinkedIn</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"https://www.linkedin.com/in/williamhgates\nhttps://www.linkedin.com/in/satyanadella"}
            rows={8}
            className="w-full border-2 border-ink bg-white p-3 font-mono text-sm focus:outline-none focus:bg-yellow/30"
            disabled={busy}
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleImport}
              disabled={busy || input.trim().length === 0}
              className="display text-sm border-2 border-ink px-4 py-3 bg-pink text-white hover:bg-ink disabled:opacity-50 disabled:cursor-not-allowed flex-1"
            >
              {busy ? "Import en cours…" : "→ Importer les profils"}
            </button>
            <button
              onClick={() => setInput("")}
              disabled={busy}
              className="display text-sm border-2 border-ink px-4 py-3 bg-cream hover:bg-yellow disabled:opacity-50"
            >
              Clear
            </button>
          </div>
          <p className="text-xs opacity-60 mt-2">
            Format accepté: <code>https://www.linkedin.com/in/&lt;slug&gt;</code>.
            Séparateurs: saut de ligne, virgule ou espace.
          </p>
        </div>

        <div className="border-2 border-ink bg-yellow p-5">
          <div className="display text-sm mb-2">Journal d&apos;import</div>
          {logs.length === 0 ? (
            <div className="display text-sm opacity-60 py-8 text-center">
              Aucun import pour l&apos;instant.
            </div>
          ) : (
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {logs.map((log, i) => (
                <li
                  key={i}
                  className="border-2 border-ink bg-cream px-3 py-2 text-xs font-mono flex items-start gap-2"
                >
                  <span
                    className={`display text-xs px-2 py-0.5 border-2 border-ink shrink-0 ${
                      log.status === "ok"
                        ? "bg-ink text-yellow"
                        : log.status === "error"
                        ? "bg-pink text-white"
                        : "bg-cream"
                    }`}
                  >
                    {log.status === "ok"
                      ? "OK"
                      : log.status === "error"
                      ? "KO"
                      : "…"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{log.url}</div>
                    {log.person && (
                      <div className="opacity-70">
                        → {log.person.name}
                        {log.person.title ? ` · ${log.person.title}` : ""}
                      </div>
                    )}
                    {log.message && (
                      <div className="text-pink">{log.message}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mb-4 flex items-end justify-between">
        <h2 className="display text-3xl">
          <span className="bg-ink text-yellow px-2">CASTING ACTUEL</span>{" "}
          <span className="text-sm opacity-60">({hydrated ? people.length : 0})</span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={resetToDefaults}
            className="display text-xs border-2 border-ink px-3 py-2 bg-cream hover:bg-yellow"
          >
            Remettre les 30 fictifs
          </button>
          <button
            onClick={clearAll}
            className="display text-xs border-2 border-ink px-3 py-2 bg-cream hover:bg-pink hover:text-white"
          >
            Vider
          </button>
        </div>
      </section>

      {hydrated && isDefault && (
        <div className="border-2 border-dashed border-ink/40 bg-cream p-4 mb-4 text-sm">
          <span className="display">INFO</span> — Casting par défaut (30 noms
          fictifs). Importe des URLs pour les remplacer.
        </div>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {people.map((p) => (
          <div
            key={p.id}
            className="border-2 border-ink bg-cream p-3 flex gap-3 items-start"
          >
            {p.profilePicture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.profilePicture}
                alt={p.name}
                className="w-16 h-16 object-cover border-2 border-ink shrink-0"
              />
            ) : (
              <div className="w-16 h-16 bg-pink text-white display text-2xl flex items-center justify-center border-2 border-ink shrink-0">
                {p.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="display text-base leading-tight truncate">
                {p.name}
              </div>
              {p.title && (
                <div className="text-xs truncate">
                  {p.title}
                  {p.company ? ` @ ${p.company}` : ""}
                </div>
              )}
              <div className="text-xs opacity-60 truncate">
                {p.handle} · {p.city || "—"}
              </div>
              <div className="flex gap-1 mt-2">
                {p.linkedinUrl && (
                  <a
                    href={p.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="display text-[10px] border-2 border-ink px-2 py-0.5 bg-cream hover:bg-yellow"
                  >
                    LinkedIn ↗
                  </a>
                )}
                <button
                  onClick={() => removeOne(p.id)}
                  className="display text-[10px] border-2 border-ink px-2 py-0.5 bg-cream hover:bg-pink hover:text-white ml-auto"
                >
                  Retirer
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="mt-8 flex gap-3 justify-center">
        <Link
          href="/"
          className="display text-sm border-2 border-ink px-5 py-3 bg-cream hover:bg-yellow"
        >
          ← Casting
        </Link>
        <Link
          href="/dashboard"
          className="display text-sm border-2 border-ink px-5 py-3 bg-pink text-white hover:bg-ink"
        >
          Dashboard →
        </Link>
      </div>
    </div>
  );
}
