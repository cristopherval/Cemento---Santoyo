-- ============================================================
-- Santoyo's Concrete Work — Supabase setup
-- Ejecuta TODO este script en: Supabase  →  SQL Editor  →  New query  →  Run
-- Workspace compartido: cualquier usuario autenticado lee/escribe todo.
-- ============================================================

-- ---------- Tablas (cada fila guarda el registro completo como JSON) ----------
create table if not exists public.quotes (
  id          text primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  deleted     boolean     not null default false
);

create table if not exists public.jobs (
  id          text primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  deleted     boolean     not null default false
);

create table if not exists public.invoices (
  id          text primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  deleted     boolean     not null default false
);

-- Pares clave/valor compartidos (firma del CEO, etc.)
create table if not exists public.kv (
  id          text primary key,
  data        jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------- Row Level Security: solo usuarios autenticados, acceso total ----------
alter table public.quotes   enable row level security;
alter table public.jobs     enable row level security;
alter table public.invoices enable row level security;
alter table public.kv       enable row level security;

drop policy if exists auth_all on public.quotes;
drop policy if exists auth_all on public.jobs;
drop policy if exists auth_all on public.invoices;
drop policy if exists auth_all on public.kv;

create policy auth_all on public.quotes   for all to authenticated using (true) with check (true);
create policy auth_all on public.jobs     for all to authenticated using (true) with check (true);
create policy auth_all on public.invoices for all to authenticated using (true) with check (true);
create policy auth_all on public.kv       for all to authenticated using (true) with check (true);

-- ---------- Numeración de invoices atómica entre usuarios ----------
create sequence if not exists public.invoice_seq start 1001;

create or replace function public.next_invoice_number()
  returns bigint
  language sql
  security definer
  set search_path = public
as $$
  select nextval('public.invoice_seq');
$$;

grant execute on function public.next_invoice_number() to authenticated;
