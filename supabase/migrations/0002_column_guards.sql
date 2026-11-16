-- =====================================================================
-- Guardas de columnas (APLICADO). Lo que un usuario no puede cambiar aunque
-- la fila sea suya. El servidor con la clave secreta (service_role) y el
-- propietario de la base de datos no se ven afectados.
-- =====================================================================

create or replace function private.is_end_user()
returns boolean language sql stable set search_path = '' as $$
  select coalesce((select auth.role()), '') in ('authenticated', 'anon')
$$;

-- Perfil: el plan y el cliente de Stripe solo los cambia el webhook de pagos.
create or replace function private.guard_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if private.is_end_user() and (
    new.id is distinct from old.id
    or new.plan is distinct from old.plan
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.terms_accepted_at is distinct from old.terms_accepted_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'PROTECTED_COLUMN' using errcode = '42501',
      hint = 'El plan y los datos de facturación no se pueden modificar desde la aplicación.';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_columns();

-- Viaje: nadie puede cambiar el propietario (un colaborador no puede quedárselo).
create or replace function private.guard_trip_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if private.is_end_user() and (
    new.id is distinct from old.id
    or new.owner_id is distinct from old.owner_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'PROTECTED_COLUMN' using errcode = '42501',
      hint = 'El propietario de un viaje no se puede cambiar.';
  end if;
  return new;
end $$;

create trigger trips_guard before update on public.trips
  for each row execute function private.guard_trip_columns();

-- Uso de agentes: la fecha la pone el servidor y el registro no se reescribe
-- (es la base del límite mensual de cada plan).
create or replace function private.guard_agent_run_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if private.is_end_user() then
    new.created_at := now();
    new.status := 'running';
    new.input_tokens := null;
    new.output_tokens := null;
    new.error := null;
    new.finished_at := null;
  end if;
  return new;
end $$;

create trigger agent_runs_guard_insert before insert on public.agent_runs
  for each row execute function private.guard_agent_run_insert();

create or replace function private.guard_agent_run_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if private.is_end_user() and (
    new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.trip_id is distinct from old.trip_id
    or new.agent is distinct from old.agent
    or new.kind is distinct from old.kind
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'PROTECTED_COLUMN' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger agent_runs_guard_update before update on public.agent_runs
  for each row execute function private.guard_agent_run_update();
