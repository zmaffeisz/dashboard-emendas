alter table public.processos
  add column if not exists sc text;

comment on column public.processos.sc is
  'Numero opcional da Solicitacao de Compra vinculada ao processo.';
