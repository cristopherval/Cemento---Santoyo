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

-- Solo usuarios autenticados pueden pedir número de invoice (no el rol anónimo)
revoke execute on function public.next_invoice_number() from public, anon;
grant execute on function public.next_invoice_number() to authenticated;

-- ---------- Firma remota del cliente (token-gated, sin login) ----------
-- El cliente recibe un enlace con ?sign=<id>&t=<token>. Estas dos funciones son
-- lo único que el rol anónimo puede tocar, y solo sobre el invoice cuyo
-- signToken coincide; no exponen el resto de la tabla.
create or replace function public.get_invoice_for_signing(p_id text, p_token text)
  returns jsonb
  language sql
  security definer
  set search_path = public
as $$
  select data from public.invoices
  where id = p_id and deleted = false and data->>'signToken' = p_token;
$$;

create or replace function public.submit_signature(p_id text, p_token text, p_sig text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- only accept a base64 image data-URL (anti-injection / size sanity)
  if p_sig is null or p_sig !~ '^data:image/(png|jpeg|jpg);base64,[A-Za-z0-9+/=[:space:]]+$'
     or length(p_sig) > 500000 then
    raise exception 'invalid signature';
  end if;
  update public.invoices
     set data = data || jsonb_build_object(
           'customerSignature', p_sig,
           'signStatus', 'signed',
           'signedAt',  to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
         updated_at = now()
   where id = p_id and deleted = false and data->>'signToken' = p_token;
end;
$$;

revoke execute on function public.get_invoice_for_signing(text, text) from public;
revoke execute on function public.submit_signature(text, text, text) from public;
grant  execute on function public.get_invoice_for_signing(text, text) to anon, authenticated;
grant  execute on function public.submit_signature(text, text, text)  to anon, authenticated;

-- ---------- Almacenamiento de archivos (pestaña "Almacenamiento") ----------
-- Bucket privado para PDFs/imágenes subidos. Solo usuarios autenticados pueden
-- subir/ver/borrar; el rol anónimo no tiene acceso.
insert into storage.buckets (id, name, public)
  values ('invoices', 'invoices', false)
  on conflict (id) do nothing;

drop policy if exists invoices_auth_all on storage.objects;
create policy invoices_auth_all on storage.objects
  for all to authenticated
  using (bucket_id = 'invoices') with check (bucket_id = 'invoices');
