begin;

alter table public.atas_itens
  add column if not exists encerramento_planejado boolean not null default false,
  add column if not exists encerramento_planejado_em timestamp with time zone;

alter table public.atas_itens
  drop constraint if exists atas_itens_encerramento_planejado_consistente_check;
alter table public.atas_itens
  add constraint atas_itens_encerramento_planejado_consistente_check
  check (encerramento_planejado = (encerramento_planejado_em is not null));

alter table public.atas_itens
  drop constraint if exists atas_itens_decisao_vigencia_exclusiva_check;
alter table public.atas_itens
  add constraint atas_itens_decisao_vigencia_exclusiva_check
  check (not (renovacao_em_tramite and encerramento_planejado));

comment on column public.atas_itens.encerramento_planejado is
  'Indica que o item foi analisado e deve ser encerrado quando a vigencia atual terminar.';
comment on column public.atas_itens.encerramento_planejado_em is
  'Data e hora em que foi registrada a decisao de encerrar o item ao fim da vigencia.';

notify pgrst, 'reload schema';

commit;
