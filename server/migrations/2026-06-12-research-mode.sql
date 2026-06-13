-- Research mode: tag chat sessions with a research flag + stock ticker.
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).

alter table public.chat_sessions
  add column if not exists is_research boolean not null default false,
  add column if not exists ticker text;

create index if not exists chat_sessions_research_idx
  on public.chat_sessions (user_id, ticker)
  where ticker is not null;
