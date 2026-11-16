-- =====================================================================
-- PENDIENTE DE APLICAR. Supabase pide confirmación manual para este
-- fichero porque contiene sentencias REVOKE y DELETE.
--
-- Qué aporta:
--   1. `delete_my_account()`: necesaria para el botón «Eliminar mi cuenta»
--      (derecho de supresión, RGPD art. 17). Alternativa sin esta función:
--      configurar SUPABASE_SECRET_KEY en el servidor.
--   2. Permisos por columna (REVOKE/GRANT): defensa en profundidad. Lo
--      esencial ya lo imponen RLS y los triggers de 0002_column_guards.sql.
--
-- Cómo aplicarlo: panel de Supabase → SQL Editor → pegar este fichero
-- completo → Run. Es idempotente.
-- =====================================================================

-- Sin acceso anónimo directo a tablas: lo público pasa por funciones RPC.
revoke all on all tables in schema public from anon;

-- Perfiles: plan y stripe_customer_id solo los escribe el servidor
-- (webhook de Stripe con la clave secreta).
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, home_city, currency, marketing_consent) on public.profiles to authenticated;

revoke insert, update, delete on public.subscriptions from authenticated;

-- Viajes: se puede editar todo menos el propietario.
revoke update on public.trips from authenticated;
grant update (
  title, destination, destination_country, country_code, dest_lat, dest_lng, dest_iata,
  origin, origin_iata, start_date, end_date, travelers, rooms, budget_total, currency,
  trip_type, pace, preferences, status, cover_image_url, cover_image_credit
) on public.trips to authenticated;

-- Los miembros solo se añaden aceptando una invitación (RPC).
revoke insert, update on public.trip_members from authenticated;
revoke update on public.documents from authenticated;
revoke update, delete on public.chat_messages from authenticated;

-- Uso de agentes: el usuario no puede borrar ni alterar la fecha (límite mensual).
revoke insert, update, delete on public.agent_runs from authenticated;
grant insert (user_id, trip_id, agent, kind) on public.agent_runs to authenticated;
grant update (status, input_tokens, output_tokens, error, finished_at) on public.agent_runs to authenticated;

revoke select, update, delete on public.affiliate_clicks from authenticated;

revoke all on function public.accept_trip_invite(text) from public, anon;
grant execute on function public.accept_trip_invite(text) to authenticated;

revoke all on function public.get_shared_trip(text) from public;
grant execute on function public.get_shared_trip(text) to anon, authenticated;

-- Derecho de supresión (RGPD art. 17): borra la cuenta y, en cascada, todos sus datos.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  delete from auth.users where id = v_uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
