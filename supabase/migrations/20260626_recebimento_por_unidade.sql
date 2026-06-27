-- ════════════════════════════════════════════════════════════════════════════
-- Migração: Recebimento por unidade física (patrimônio/série individuais por unidade)
-- Projeto NUVEM: djtwoesmgeetnrztyvzw
-- Data: 2026-06-26
-- NÃO APLICAR sem aprovação. Idempotente. Faça backup/branch antes de rodar em prod.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- 1) NOVA TABELA: uma linha por unidade física recebida em uma AF/entrega.
--    Cada unidade tem patrimônio e número de série próprios; a NF é referenciada
--    (compartilhada entre várias unidades) — o VALOR da NF NÃO fica aqui, evitando
--    duplicidade (valor mora em notas_fiscais.valor_total / nota_fiscal_itens).
create table if not exists public.itens_entregas_unidades (
  id            uuid primary key default gen_random_uuid(),
  entrega_id    uuid not null references public.itens_entregas(id) on delete cascade,
  item_id       uuid references public.itens(id),
  unidade_seq   integer,                       -- 1..N (ordem da unidade dentro da AF)
  patrimonio    text,
  numero_serie  text,
  nota_fiscal_id uuid references public.notas_fiscais(id),  -- mesma NF pode repetir entre unidades (sem somar valor)
  recebido_em   date,
  recebido_por  text,
  obs           text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_ieu_entrega on public.itens_entregas_unidades(entrega_id);
create index if not exists idx_ieu_item    on public.itens_entregas_unidades(item_id);
create index if not exists idx_ieu_nf      on public.itens_entregas_unidades(nota_fiscal_id);

-- 2) BACKFILL: transforma cada recebimento já existente em unidades individuais.
--    Cria qtde_recebida linhas por entrega; a 1ª unidade herda patrimônio/série
--    atuais (que hoje são únicos por AF); todas referenciam a NF atual (compartilhada).
--    Só roda se a tabela nova ainda estiver vazia (proteção contra re-execução).
insert into public.itens_entregas_unidades
  (entrega_id, item_id, unidade_seq, patrimonio, numero_serie, nota_fiscal_id, recebido_em, recebido_por)
select
  e.id,
  e.item_id,
  g.seq,
  case when g.seq = 1 then nullif(btrim(e.patrimonio), '')   else null end,
  case when g.seq = 1 then nullif(btrim(e.numero_serie), '') else null end,
  e.nota_fiscal_id,
  e.data_recebimento,
  e.recebido_por
from public.itens_entregas e
cross join lateral generate_series(1, greatest(coalesce(e.qtde_recebida, 0)::int, 0)) as g(seq)
where coalesce(e.qtde_recebida, 0) > 0
  and not exists (select 1 from public.itens_entregas_unidades);

-- 3) Mantém as colunas antigas em itens_entregas (patrimonio/numero_serie) como
--    AGREGADO/legado — NÃO são removidas (sem perda de dados). Passam a ser
--    preenchidas por trigger a partir das unidades, para a UI antiga seguir lendo.
create or replace function public._sync_entrega_agregado() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare _eid uuid;
begin
  _eid := coalesce(new.entrega_id, old.entrega_id);
  update public.itens_entregas e set
    patrimonio   = (select string_agg(u.patrimonio,   ', ' order by u.unidade_seq)
                    from public.itens_entregas_unidades u
                    where u.entrega_id = _eid and nullif(btrim(u.patrimonio),'') is not null),
    numero_serie = (select string_agg(u.numero_serie, ', ' order by u.unidade_seq)
                    from public.itens_entregas_unidades u
                    where u.entrega_id = _eid and nullif(btrim(u.numero_serie),'') is not null)
  where e.id = _eid;
  return null;
end $$;

drop trigger if exists trg_ieu_sync on public.itens_entregas_unidades;
create trigger trg_ieu_sync
after insert or update or delete on public.itens_entregas_unidades
for each row execute function public._sync_entrega_agregado();

-- 4) RLS: espelha EXATAMENTE as policies de itens_entregas.
alter table public.itens_entregas_unidades enable row level security;

drop policy if exists "leitura autenticada itens_entregas_unidades" on public.itens_entregas_unidades;
create policy "leitura autenticada itens_entregas_unidades"
  on public.itens_entregas_unidades
  for select to authenticated
  using (is_approved_profile());

drop policy if exists "escrita itens_entregas_unidades" on public.itens_entregas_unidades;
create policy "escrita itens_entregas_unidades"
  on public.itens_entregas_unidades
  for all to authenticated
  using (
    can_access_tab('itens'::text, 'edit'::text)
    or can_access_tab('contratos'::text, 'edit'::text)
    or can_access_tab('dashboard'::text, 'edit'::text)
    or can_access_tab('atas'::text, 'edit'::text)
  )
  with check (
    can_access_tab('itens'::text, 'edit'::text)
    or can_access_tab('contratos'::text, 'edit'::text)
    or can_access_tab('dashboard'::text, 'edit'::text)
    or can_access_tab('atas'::text, 'edit'::text)
  );

commit;

-- PostgREST: recarregar o schema cache após aplicar.
select pg_notify('pgrst', 'reload schema');

-- ── ROLLBACK (se precisar desfazer) ──────────────────────────────────────────
-- begin;
--   drop trigger if exists trg_ieu_sync on public.itens_entregas_unidades;
--   drop function if exists public._sync_entrega_agregado();
--   drop table if exists public.itens_entregas_unidades;
-- commit;
-- (As colunas patrimonio/numero_serie em itens_entregas permanecem intactas.)
