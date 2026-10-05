create table public.seasons (
  id integer primary key,
  name text not null,
  started_at timestamptz not null default now(),
  is_current boolean not null default false,
  min_client_version text
);
grant select on public.seasons to anon, authenticated;
grant all on public.seasons to service_role;
create unique index seasons_one_current on public.seasons (is_current) where is_current;
alter table public.seasons enable row level security;
create policy "Seasons are viewable by everyone" on public.seasons for select using (true);

insert into public.seasons (id, name, started_at, is_current)
values (1, 'Season 1', coalesce((select min(created_at) from public.current_high_scores), now()), true);

alter table public.current_high_scores add column season integer not null default 1 references public.seasons(id);
create index current_high_scores_season_score_idx on public.current_high_scores (season, score desc);

create or replace function public.set_score_season() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.season := coalesce((select id from public.seasons where is_current), 1);
  return new;
end $$;
create trigger trg_set_score_season before insert on public.current_high_scores
for each row execute function public.set_score_season();