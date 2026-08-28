begin;

alter table public.itens
  add column if not exists unidade_medida text;

alter table public.itens
  drop constraint if exists itens_unidade_medida_formato_check;
alter table public.itens
  add constraint itens_unidade_medida_formato_check
  check (
    unidade_medida is null
    or (
      unidade_medida = btrim(unidade_medida)
      and char_length(unidade_medida) between 1 and 80
    )
  );

comment on column public.itens.unidade_medida is
  'Unidade de medida do item licitado. Aceita o catálogo padronizado e valores personalizados.';

notify pgrst, 'reload schema';

commit;

