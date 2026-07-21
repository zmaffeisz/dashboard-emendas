-- Marco do ciclo de saldo vigente. Execucoes anteriores continuam no historico,
-- mas nao consomem a quantidade disponivel apos uma renovacao com saldo reiniciado.
alter table public.atas_itens
  add column if not exists saldo_reiniciado_em date;
