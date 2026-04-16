export type AnswerEvent = {
  question_number: number;
  answer: string;
  phone_number?: string;
  contact_name?: string;
  received_at: number;
};

type Listener = (event: AnswerEvent) => void;

type Session = {
  answers: AnswerEvent[];
  listeners: Set<Listener>;
};

const globalAny = globalThis as unknown as { __hrSessions?: Map<string, Session> };
const sessions: Map<string, Session> = globalAny.__hrSessions ?? new Map();
globalAny.__hrSessions = sessions;

function getOrCreate(sessionId: string): Session {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { answers: [], listeners: new Set() };
    sessions.set(sessionId, s);
  }
  return s;
}

export function recordAnswer(sessionId: string, event: AnswerEvent) {
  const s = getOrCreate(sessionId);
  s.answers.push(event);
  for (const listener of s.listeners) {
    try {
      listener(event);
    } catch {}
  }
}

export function subscribe(sessionId: string, listener: Listener): () => void {
  const s = getOrCreate(sessionId);
  s.listeners.add(listener);
  return () => {
    s.listeners.delete(listener);
  };
}

export function getHistory(sessionId: string): AnswerEvent[] {
  return sessions.get(sessionId)?.answers ?? [];
}
