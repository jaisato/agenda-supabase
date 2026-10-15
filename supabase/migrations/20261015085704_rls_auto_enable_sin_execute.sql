-- El advisor de seguridad de Supabase avisa de que public.rls_auto_enable(), la función de la
-- plataforma ligada al event trigger ensure_rls (activa RLS en cada tabla nueva de public), es
-- SECURITY DEFINER y ejecutable por anon y authenticated vía /rest/v1/rpc. Solo la invoca el
-- event trigger, como propietario, así que se retira EXECUTE a los roles de la API.
-- Idempotente: el stack local no tiene esa función.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
