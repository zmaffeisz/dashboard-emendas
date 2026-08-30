begin;

alter table public.atas_itens
  add column if not exists renovacao_em_tramite boolean not null default false,
  add column if not exists renovacao_em_tramite_em timestamp with time zone;

alter table public.atas_itens
  drop constraint if exists atas_itens_renovacao_em_tramite_consistente_check;
alter table public.atas_itens
  add constraint atas_itens_renovacao_em_tramite_consistente_check
  check (renovacao_em_tramite = (renovacao_em_tramite_em is not null));

comment on column public.atas_itens.renovacao_em_tramite is
  'Indica que o item foi selecionado para o processo administrativo de renovacao da Ata de RP.';
comment on column public.atas_itens.renovacao_em_tramite_em is
  'Data e hora em que o item foi marcado como em tramite de renovacao.';

notify pgrst, 'reload schema';

commit;
