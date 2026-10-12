-- Longitud máxima del nombre público del perfil: 100 caracteres, como el nombre de un contacto. Va
-- en una migración aparte porque una migración ya aplicada no se edita. El nombre sigue siendo
-- opcional: con null, el check no falla.

alter table public.perfiles
  add constraint perfiles_nombre_longitud check (char_length(nombre) <= 100);
