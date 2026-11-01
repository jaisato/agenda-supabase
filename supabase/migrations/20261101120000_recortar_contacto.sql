-- Los textos de un contacto se guardan sin espacios en los extremos. Un nombre que, recortado,
-- queda vacío choca con el check de longitud (23514): el formulario ya no deja enviarlo, y la base
-- tampoco lo acepta si alguien llama a la API directamente.

create function privado.recortar_contacto() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.nombre := btrim(new.nombre);
  new.apellidos := btrim(new.apellidos);
  new.email := btrim(new.email);
  new.telefono := btrim(new.telefono);
  new.facebook := btrim(new.facebook);
  new.twitter := btrim(new.twitter);
  return new;
end $$;

revoke execute on function privado.recortar_contacto() from public;

create trigger recortar_contacto before insert or update on public.contactos
  for each row execute function privado.recortar_contacto();
