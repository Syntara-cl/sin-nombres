-- Los Sin Nombres: tablas para la junta familiar
-- Pegar completo en Supabase > SQL Editor > Run

create table if not exists public.halloween_signups (
  slug text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Una sola fila posible (id = 1): el primero que inserta gana el acertijo
create table if not exists public.halloween_riddle_winner (
  id int primary key check (id = 1),
  slug text not null,
  name text not null,
  won_at timestamptz not null default now()
);

alter table public.halloween_signups enable row level security;
alter table public.halloween_riddle_winner enable row level security;

drop policy if exists halloween_signups_select on public.halloween_signups;
drop policy if exists halloween_signups_insert on public.halloween_signups;
drop policy if exists halloween_signups_update on public.halloween_signups;
drop policy if exists halloween_winner_select on public.halloween_riddle_winner;
drop policy if exists halloween_winner_insert on public.halloween_riddle_winner;

create policy halloween_signups_select on public.halloween_signups for select to anon using (true);
create policy halloween_signups_insert on public.halloween_signups for insert to anon with check (true);
create policy halloween_signups_update on public.halloween_signups for update to anon using (true) with check (true);
create policy halloween_winner_select on public.halloween_riddle_winner for select to anon using (true);
create policy halloween_winner_insert on public.halloween_riddle_winner for insert to anon with check (id = 1);

grant select, insert, update on public.halloween_signups to anon;
grant select, insert on public.halloween_riddle_winner to anon;

-- Opcional: actualizacion en vivo (si falla porque ya estaba, ignorar el error).
-- Sin esto la pagina igual se actualiza sola cada 8 segundos.
alter publication supabase_realtime add table public.halloween_signups;
alter publication supabase_realtime add table public.halloween_riddle_winner;

create table if not exists public.halloween_scores (
  slug text primary key,
  name text not null,
  best int not null default 0 check (best >= 0),
  updated_at timestamptz not null default now()
);

alter table public.halloween_scores enable row level security;

drop policy if exists halloween_scores_select on public.halloween_scores;
drop policy if exists halloween_scores_insert on public.halloween_scores;
drop policy if exists halloween_scores_update on public.halloween_scores;

create policy halloween_scores_select on public.halloween_scores for select to anon using (true);
create policy halloween_scores_insert on public.halloween_scores for insert to anon with check (true);
create policy halloween_scores_update on public.halloween_scores for update to anon using (true) with check (true);

grant select, insert, update on public.halloween_scores to anon;

alter publication supabase_realtime add table public.halloween_scores;

create table if not exists public.halloween_scores_vuelo (
  slug text primary key,
  name text not null,
  best int not null default 0 check (best >= 0),
  updated_at timestamptz not null default now()
);

alter table public.halloween_scores_vuelo enable row level security;

drop policy if exists halloween_scores_vuelo_select on public.halloween_scores_vuelo;
drop policy if exists halloween_scores_vuelo_insert on public.halloween_scores_vuelo;
drop policy if exists halloween_scores_vuelo_update on public.halloween_scores_vuelo;

create policy halloween_scores_vuelo_select on public.halloween_scores_vuelo for select to anon using (true);
create policy halloween_scores_vuelo_insert on public.halloween_scores_vuelo for insert to anon with check (true);
create policy halloween_scores_vuelo_update on public.halloween_scores_vuelo for update to anon using (true) with check (true);

grant select, insert, update on public.halloween_scores_vuelo to anon;
