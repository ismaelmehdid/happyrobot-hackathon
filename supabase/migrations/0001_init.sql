-- Konbini Happy Robot — initial schema
-- Run this in Supabase SQL Editor once.

-- 1. Enum for the normalized pick returned by HappyRobot.
create type answer_choice as enum ('A', 'B');

-- 2. Questions: source of truth for the 10 A/B dilemmas.
create table questions (
  id          text        primary key,                 -- 'q1'..'q10'
  position    smallint    not null unique,             -- 1..10, display order
  label       text        not null,                    -- 'Work rhythm'
  option_a    text        not null,                    -- '996'
  option_b    text        not null,                    -- '10am — smoke break — afterwork'
  created_at  timestamptz not null default now()
);

-- 3. Call sessions: 1 row per `/api/call` invocation, links a sessionId to a user.
create table call_sessions (
  id            uuid        primary key,               -- crypto.randomUUID() on the server
  user_id       uuid        not null references auth.users on delete cascade,
  phone_number  text        not null,
  created_at    timestamptz not null default now()
);
create index call_sessions_user_id_idx on call_sessions(user_id);

-- 4. Answers: one per (user, question). Upsert on re-call.
create table answers (
  user_id      uuid          not null references auth.users on delete cascade,
  question_id  text          not null references questions(id) on delete restrict,
  choice       answer_choice not null,
  raw_answer   text,                                   -- transcribed text from HappyRobot
  session_id   uuid          not null references call_sessions(id) on delete cascade,
  answered_at  timestamptz   not null default now(),
  primary key (user_id, question_id)
);
create index answers_question_id_idx on answers(question_id);
create index answers_session_id_idx on answers(session_id);

-- 5. Seed the 10 questions (matches app/lib/data.ts).
insert into questions (id, position, label, option_a, option_b) values
  ('q1',  1,  'Work rhythm',   '996',                 '10am — smoke break — afterwork'),
  ('q2',  2,  'City',          'Paris',               'San Francisco'),
  ('q3',  3,  'Favorite AI',   'Claude',              'ChatGPT'),
  ('q4',  4,  'Team',          'Founder',             'VC'),
  ('q5',  5,  'Who ships it',  'AI',                  'Human'),
  ('q6',  6,  'Dev experience', 'Vibe coded deeptech', 'Over engineered SaaS'),
  ('q7',  7,  'Incubator',     'Station F',           'YC'),
  ('q8',  8,  'A lie',         'Lying to your board', 'Lying to your mom'),
  ('q9',  9,  'Toilets',       'YC',                  'WC'),
  ('q10', 10, 'Robot',         'HappyRobot',          'SadRobot');

-- 6. Row-Level Security
-- Everyone authenticated can read aggregate stats. Writes are server-side only
-- (via service role key from /api/call and /api/hr-webhook).
alter table questions      enable row level security;
alter table call_sessions  enable row level security;
alter table answers        enable row level security;

-- Read access for authed users.
create policy "questions readable by authenticated"
  on questions for select
  to authenticated
  using (true);

create policy "call_sessions readable by authenticated"
  on call_sessions for select
  to authenticated
  using (true);

create policy "answers readable by authenticated"
  on answers for select
  to authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policies for authenticated → clients can't write.
-- The service role bypasses RLS, so server routes (/api/call, /api/hr-webhook)
-- using the SUPABASE_SERVICE_ROLE_KEY can insert/upsert freely.

-- 7. Realtime: expose these tables over the `supabase_realtime` publication
-- so the frontend can subscribe to live inserts.
alter publication supabase_realtime add table answers;
alter publication supabase_realtime add table call_sessions;
