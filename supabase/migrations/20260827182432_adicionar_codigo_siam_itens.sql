begin;

alter table public.itens
  add column if not exists codigo_siam text;

alter table public.atas_itens
  add column if not exists codigo_siam text;

alter table public.itens
  drop constraint if exists itens_codigo_siam_formato_check;
alter table public.itens
  add constraint itens_codigo_siam_formato_check
  check (
    codigo_siam is null
    or (
      char_length(btrim(codigo_siam)) between 1 and 50
      and btrim(codigo_siam) ~ '^[0-9.-]+$'
    )
  );

alter table public.atas_itens
  drop constraint if exists atas_itens_codigo_siam_formato_check;
alter table public.atas_itens
  add constraint atas_itens_codigo_siam_formato_check
  check (
    codigo_siam is null
    or (
      char_length(btrim(codigo_siam)) between 1 and 50
      and btrim(codigo_siam) ~ '^[0-9.-]+$'
    )
  );

create index if not exists idx_itens_codigo_siam
  on public.itens(codigo_siam)
  where codigo_siam is not null;

create index if not exists idx_atas_itens_codigo_siam
  on public.atas_itens(codigo_siam)
  where codigo_siam is not null;

comment on column public.itens.codigo_siam is
  'Código do item ou serviço no catálogo interno SIAM da Prefeitura.';

comment on column public.atas_itens.codigo_siam is
  'Código SIAM herdado do item licitado e preservado na execução da Ata.';

notify pgrst, 'reload schema';

commit;
