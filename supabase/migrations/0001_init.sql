-- =====================================================================
-- Esquema inicial de la plataforma de viajes
-- PostgreSQL (Supabase). Todo el acceso desde el cliente pasa por RLS.
-- =====================================================================

create schema if not exists private;
grant usage on schema private to authenticated, anon;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Perfiles y suscripciones
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  home_city text,
  currency text not null default 'EUR',
  plan text not null default 'free' check (plan in ('free', 'premium')),
  stripe_customer_id text unique,
  terms_accepted_at timestamptz,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create table public.subscriptions (
  id text primary key, -- id de la suscripción en Stripe
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null,
  price_id text,
  billing_interval text check (billing_interval in ('month', 'year')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id);

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function private.touch_updated_at();

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, terms_accepted_at, marketing_consent)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.raw_user_meta_data ->> 'terms_accepted' = 'true' then now() end,
    coalesce(new.raw_user_meta_data ->> 'marketing_consent' = 'true', false)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Viajes
-- ---------------------------------------------------------------------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  destination text not null,
  destination_country text,
  country_code text,
  dest_lat double precision,
  dest_lng double precision,
  dest_iata text,
  origin text,
  origin_iata text,
  start_date date not null,
  end_date date not null,
  travelers integer not null default 2 check (travelers between 1 and 20),
  rooms integer not null default 1 check (rooms between 1 and 10),
  budget_total numeric(12, 2) check (budget_total is null or budget_total >= 0),
  currency text not null default 'EUR',
  trip_type text not null default 'personalizado'
    check (trip_type in ('economico', 'romantico', 'familiar', 'aventura', 'lujo', 'cultural', 'personalizado')),
  pace text not null default 'equilibrado' check (pace in ('relajado', 'equilibrado', 'intenso')),
  preferences text,
  status text not null default 'draft' check (status in ('draft', 'planning', 'ready')),
  cover_image_url text,
  cover_image_credit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_dates_check check (end_date >= start_date and end_date - start_date <= 60)
);
create index trips_owner_idx on public.trips (owner_id);

create trigger trips_touch before update on public.trips
  for each row execute function private.touch_updated_at();

create table public.trip_members (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_members_user_idx on public.trip_members (user_id);

create table public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  kind text not null check (kind in ('public_link', 'member_invite')),
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index trip_invites_trip_idx on public.trip_invites (trip_id);

-- Funciones de permisos (security definer: evitan recursión de RLS)
create or replace function private.trip_role(p_trip uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (
      select 1 from public.trips t
      where t.id = p_trip and t.owner_id = (select auth.uid())
    ) then 'owner'
    else (
      select m.role from public.trip_members m
      where m.trip_id = p_trip and m.user_id = (select auth.uid())
    )
  end
$$;

create or replace function private.can_view_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.trip_role(p_trip) is not null
$$;

create or replace function private.can_edit_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.trip_role(p_trip) in ('owner', 'editor'), false)
$$;

create or replace function private.is_trip_owner(p_trip uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.trip_role(p_trip) = 'owner', false)
$$;

-- Límite del plan gratuito: 1 viaje
create or replace function private.enforce_trip_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan text;
  v_count integer;
begin
  select plan into v_plan from public.profiles where id = new.owner_id;
  if coalesce(v_plan, 'free') = 'free' then
    select count(*) into v_count from public.trips where owner_id = new.owner_id;
    if v_count >= 1 then
      raise exception 'PLAN_LIMIT_TRIPS'
        using errcode = 'P0001',
              hint = 'El plan gratuito incluye 1 viaje. Pasa a Premium para crear viajes ilimitados.';
    end if;
  end if;
  return new;
end $$;

create trigger trips_enforce_limit before insert on public.trips
  for each row execute function private.enforce_trip_limit();

-- ---------------------------------------------------------------------
-- Itinerario
-- ---------------------------------------------------------------------
create table public.trip_days (
  trip_id uuid not null references public.trips (id) on delete cascade,
  day_date date not null,
  title text,
  notes text,
  rain_plan text,
  updated_at timestamptz not null default now(),
  primary key (trip_id, day_date)
);

create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  day_date date, -- null = guardado sin programar
  position integer not null default 0,
  kind text not null default 'activity'
    check (kind in ('activity', 'meal', 'transport', 'lodging', 'free_time', 'note')),
  category text,
  title text not null,
  description text,
  start_time time,
  duration_min integer not null default 60 check (duration_min between 0 and 1440),
  lat double precision,
  lng double precision,
  address text,
  place_ref text,
  source_url text,
  image_url text,
  indoor boolean,
  price_amount numeric(12, 2) check (price_amount is null or price_amount >= 0),
  price_currency text not null default 'EUR',
  price_per text not null default 'person' check (price_per in ('person', 'group')),
  price_status text not null default 'unknown'
    check (price_status in ('verified', 'estimate', 'user', 'free', 'unknown')),
  price_source text,
  price_checked_at timestamptz,
  booking_url text,
  is_affiliate boolean not null default false,
  notes text,
  created_by text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index itinerary_items_trip_day_idx on public.itinerary_items (trip_id, day_date, position);

create trigger itinerary_items_touch before update on public.itinerary_items
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Opciones comparables (vuelos, hoteles, transporte...) y ahorro
-- ---------------------------------------------------------------------
create table public.trip_options (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  category text not null check (category in ('flight', 'hotel', 'transport', 'activity', 'restaurant')),
  tier text check (tier in ('cheapest', 'best_value', 'premium')),
  title text not null,
  subtitle text,
  provider text,
  details jsonb not null default '{}'::jsonb,
  price_amount numeric(12, 2) check (price_amount is null or price_amount >= 0),
  price_currency text not null default 'EUR',
  price_status text not null default 'unknown'
    check (price_status in ('verified', 'estimate', 'user', 'free', 'unknown')),
  price_source text,
  price_checked_at timestamptz,
  booking_url text,
  is_affiliate boolean not null default false,
  selected boolean not null default false,
  created_by text not null default 'user',
  created_at timestamptz not null default now()
);
create index trip_options_trip_idx on public.trip_options (trip_id, category);

create table public.budget_suggestions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  category text not null,
  title text not null,
  detail text,
  current_amount numeric(12, 2),
  proposed_amount numeric(12, 2),
  currency text not null default 'EUR',
  basis text not null default 'estimate' check (basis in ('verified', 'estimate')),
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'dismissed')),
  created_at timestamptz not null default now()
);
create index budget_suggestions_trip_idx on public.budget_suggestions (trip_id);

-- ---------------------------------------------------------------------
-- Documentos, chat, uso de agentes y afiliación
-- ---------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  category text not null default 'otro'
    check (category in ('billete', 'reserva', 'seguro', 'identidad', 'otro')),
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index documents_trip_idx on public.documents (trip_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index chat_messages_trip_idx on public.chat_messages (trip_id, created_at);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid references public.trips (id) on delete cascade,
  agent text not null,
  kind text not null default 'chat' check (kind in ('chat', 'generation', 'optimization')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  input_tokens integer,
  output_tokens integer,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index agent_runs_user_idx on public.agent_runs (user_id, created_at);

create table public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  trip_id uuid references public.trips (id) on delete set null,
  provider text not null,
  target_host text not null,
  is_affiliate boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Seguridad a nivel de fila
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.trip_days enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.trip_options enable row level security;
alter table public.budget_suggestions enable row level security;
alter table public.documents enable row level security;
alter table public.chat_messages enable row level security;
alter table public.agent_runs enable row level security;
alter table public.affiliate_clicks enable row level security;

-- Perfiles: el usuario lee el suyo. Los permisos por columna (qué puede
-- editar) están en 0002_privileges.sql.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy subscriptions_select_own on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Viajes
create policy trips_select on public.trips for select to authenticated
  using (owner_id = (select auth.uid()) or private.can_view_trip(id));
create policy trips_insert on public.trips for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy trips_update on public.trips for update to authenticated
  using (private.can_edit_trip(id)) with check (private.can_edit_trip(id));
create policy trips_delete on public.trips for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Miembros e invitaciones
create policy trip_members_select on public.trip_members for select to authenticated
  using (private.can_view_trip(trip_id));
create policy trip_members_delete on public.trip_members for delete to authenticated
  using (private.is_trip_owner(trip_id) or user_id = (select auth.uid()));

create policy trip_invites_all on public.trip_invites for all to authenticated
  using (private.is_trip_owner(trip_id))
  with check (private.is_trip_owner(trip_id) and created_by = (select auth.uid()));

-- Tablas hijas del viaje: lectura para quien puede ver, escritura para quien puede editar
create policy trip_days_select on public.trip_days for select to authenticated
  using (private.can_view_trip(trip_id));
create policy trip_days_write on public.trip_days for all to authenticated
  using (private.can_edit_trip(trip_id)) with check (private.can_edit_trip(trip_id));

create policy itinerary_items_select on public.itinerary_items for select to authenticated
  using (private.can_view_trip(trip_id));
create policy itinerary_items_write on public.itinerary_items for all to authenticated
  using (private.can_edit_trip(trip_id)) with check (private.can_edit_trip(trip_id));

create policy trip_options_select on public.trip_options for select to authenticated
  using (private.can_view_trip(trip_id));
create policy trip_options_write on public.trip_options for all to authenticated
  using (private.can_edit_trip(trip_id)) with check (private.can_edit_trip(trip_id));

create policy budget_suggestions_select on public.budget_suggestions for select to authenticated
  using (private.can_view_trip(trip_id));
create policy budget_suggestions_write on public.budget_suggestions for all to authenticated
  using (private.can_edit_trip(trip_id)) with check (private.can_edit_trip(trip_id));

create policy documents_select on public.documents for select to authenticated
  using (private.can_view_trip(trip_id));
create policy documents_insert on public.documents for insert to authenticated
  with check (private.can_edit_trip(trip_id) and user_id = (select auth.uid()));
create policy documents_delete on public.documents for delete to authenticated
  using (private.can_edit_trip(trip_id));

create policy chat_messages_select on public.chat_messages for select to authenticated
  using (private.can_view_trip(trip_id));
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (private.can_edit_trip(trip_id) and user_id = (select auth.uid()));

-- Uso de agentes (permisos por columna en 0002_privileges.sql)
create policy agent_runs_select on public.agent_runs for select to authenticated
  using (user_id = (select auth.uid()));
create policy agent_runs_insert on public.agent_runs for insert to authenticated
  with check (user_id = (select auth.uid()) and (trip_id is null or private.can_view_trip(trip_id)));
create policy agent_runs_update on public.agent_runs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy affiliate_clicks_insert on public.affiliate_clicks for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- RPC públicas
-- ---------------------------------------------------------------------

-- Aceptar una invitación de colaborador
create or replace function public.accept_trip_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.trip_invites%rowtype;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_invite from public.trip_invites
  where token = p_token and kind = 'member_invite'
    and revoked_at is null and (expires_at is null or expires_at > now());
  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;
  if exists (select 1 from public.trips where id = v_invite.trip_id and owner_id = v_uid) then
    return v_invite.trip_id;
  end if;
  insert into public.trip_members (trip_id, user_id, role)
  values (v_invite.trip_id, v_uid, v_invite.role)
  on conflict (trip_id, user_id) do update set role = excluded.role;
  return v_invite.trip_id;
end $$;

-- Vista pública de solo lectura de un viaje compartido por enlace.
-- No expone documentos, chat ni datos personales del propietario.
create or replace function public.get_shared_trip(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_trip_id uuid;
  v_result jsonb;
begin
  select trip_id into v_trip_id from public.trip_invites
  where token = p_token and kind = 'public_link'
    and revoked_at is null and (expires_at is null or expires_at > now());
  if v_trip_id is null then
    return null;
  end if;
  select jsonb_build_object(
    'trip', (
      select jsonb_build_object(
        'title', t.title, 'destination', t.destination, 'destination_country', t.destination_country,
        'dest_lat', t.dest_lat, 'dest_lng', t.dest_lng, 'start_date', t.start_date, 'end_date', t.end_date,
        'travelers', t.travelers, 'currency', t.currency, 'trip_type', t.trip_type,
        'cover_image_url', t.cover_image_url, 'cover_image_credit', t.cover_image_credit
      ) from public.trips t where t.id = v_trip_id
    ),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day_date', d.day_date, 'title', d.title, 'rain_plan', d.rain_plan)
        order by d.day_date)
      from public.trip_days d where d.trip_id = v_trip_id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'day_date', i.day_date, 'position', i.position, 'kind', i.kind, 'category', i.category,
        'title', i.title, 'description', i.description, 'start_time', i.start_time,
        'duration_min', i.duration_min, 'lat', i.lat, 'lng', i.lng, 'address', i.address,
        'source_url', i.source_url, 'image_url', i.image_url, 'price_amount', i.price_amount,
        'price_currency', i.price_currency, 'price_per', i.price_per, 'price_status', i.price_status
      ) order by i.day_date, i.position)
      from public.itinerary_items i where i.trip_id = v_trip_id and i.day_date is not null
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------
-- Almacenamiento privado de documentos: <trip_id>/<archivo>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-documents', 'trip-documents', false, 10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy trip_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'trip-documents' and private.can_view_trip(((storage.foldername(name))[1])::uuid));
create policy trip_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-documents' and private.can_edit_trip(((storage.foldername(name))[1])::uuid));
create policy trip_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trip-documents' and private.can_edit_trip(((storage.foldername(name))[1])::uuid));
