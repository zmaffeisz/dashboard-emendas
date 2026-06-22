begin;

alter table public.contratos
  add column if not exists tipo_instrumento text not null default 'CONTRATO';

alter table public.atas_itens
  add column if not exists contrato_id integer;

alter table public.atas_execucao
  add column if not exists ata_item_id uuid,
  add column if not exists obs_prazo text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contratos_tipo_instrumento_check'
      and conrelid = 'public.contratos'::regclass
  ) then
    alter table public.contratos
      add constraint contratos_tipo_instrumento_check
      check (tipo_instrumento in ('CONTRATO', 'ATA'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'atas_itens_contrato_id_fkey'
      and conrelid = 'public.atas_itens'::regclass
  ) then
    alter table public.atas_itens
      add constraint atas_itens_contrato_id_fkey
      foreign key (contrato_id)
      references public.contratos(id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'atas_execucao_ata_item_id_fkey'
      and conrelid = 'public.atas_execucao'::regclass
  ) then
    alter table public.atas_execucao
      add constraint atas_execucao_ata_item_id_fkey
      foreign key (ata_item_id)
      references public.atas_itens(id)
      on delete restrict;
  end if;
end $$;

create index if not exists contratos_tipo_instrumento_idx
  on public.contratos (tipo_instrumento);

create index if not exists atas_itens_contrato_id_idx
  on public.atas_itens (contrato_id);

create index if not exists atas_execucao_ata_item_id_idx
  on public.atas_execucao (ata_item_id);

-- Liga as ATAs existentes aos contratos pelo par CPL + numero, aceitando
-- as variacoes historicas SIM/SIAM/sem prefixo.
update public.atas_itens i
set contrato_id = (
  select min(c.id)
  from public.contratos c
  where lower(trim(coalesce(c.cpl, ''))) = lower(trim(coalesce(i.cpl, '')))
    and regexp_replace(lower(trim(coalesce(c.numero_contrato, ''))), '^(siam|sim)[[:space:]]*', '')
        = regexp_replace(lower(trim(coalesce(i.sim, ''))), '^(siam|sim)[[:space:]]*', '')
)
where i.contrato_id is null
  and exists (
    select 1
    from public.contratos c
    where lower(trim(coalesce(c.cpl, ''))) = lower(trim(coalesce(i.cpl, '')))
      and regexp_replace(lower(trim(coalesce(c.numero_contrato, ''))), '^(siam|sim)[[:space:]]*', '')
          = regexp_replace(lower(trim(coalesce(i.sim, ''))), '^(siam|sim)[[:space:]]*', '')
  );

-- Corrige o ano digitado na ATA da EMIGE usando o contrato inequivoco
-- da mesma CPL e empresa (005/2026 no cadastro principal).
update public.atas_itens i
set contrato_id = (
  select min(c.id)
  from public.contratos c
  where lower(trim(c.cpl)) = lower(trim(i.cpl))
    and c.prestador ilike 'EMIG%'
)
where i.contrato_id is null
  and lower(trim(i.cpl)) = 'cpl 332/2024'
  and lower(trim(i.sim)) = 'sim 005/2025';

-- A CPL 576/2023 ainda nao existia em Contratos. Cria fornecedor e contrato
-- principais antes de vincular seu item, sem apagar os textos legados.
insert into public.fornecedores (razao_social)
select 'GDAI INDUSTRIA & COMERCIO'
where not exists (
  select 1
  from public.fornecedores
  where lower(trim(razao_social)) = lower('GDAI INDUSTRIA & COMERCIO')
);

insert into public.contratos (
  cpl,
  numero_contrato,
  fornecedor_id,
  prestador,
  objeto,
  status,
  vencimento,
  tipo_instrumento,
  data_atualizacao
)
select
  'CPL 576/2023',
  '078/2026',
  f.id,
  f.razao_social,
  'FRAGMENTADORA DE PAPEL AUTOMATICA',
  'VIGENTE',
  '15/04/2027',
  'ATA',
  to_char(current_date, 'DD/MM/YYYY')
from public.fornecedores f
where lower(trim(f.razao_social)) = lower('GDAI INDUSTRIA & COMERCIO')
  and not exists (
    select 1
    from public.contratos c
    where lower(trim(c.cpl)) = lower('CPL 576/2023')
      and regexp_replace(lower(trim(coalesce(c.numero_contrato, ''))), '^(siam|sim)[[:space:]]*', '') = '078/2026'
  );

update public.atas_itens i
set contrato_id = (
  select min(c.id)
  from public.contratos c
  where lower(trim(c.cpl)) = lower(trim(i.cpl))
    and regexp_replace(lower(trim(coalesce(c.numero_contrato, ''))), '^(siam|sim)[[:space:]]*', '')
        = regexp_replace(lower(trim(coalesce(i.sim, ''))), '^(siam|sim)[[:space:]]*', '')
)
where i.contrato_id is null
  and lower(trim(i.cpl)) = 'cpl 576/2023';

update public.contratos c
set tipo_instrumento = 'ATA'
where exists (
  select 1
  from public.atas_itens i
  where i.contrato_id = c.id
);

-- Na virada, preserva a vigencia e o status que estavam em uso na aba ATAs.
-- Depois desta consolidacao, o frontend passa a ler somente contratos.
with origem as (
  select
    contrato_id,
    min(nullif(trim(vencimento), '')) as vencimento,
    min(nullif(trim(status_contrato), '')) as status_contrato
  from public.atas_itens
  group by contrato_id
)
update public.contratos c
set
  vencimento = coalesce(o.vencimento, c.vencimento),
  status = case
    when upper(coalesce(o.status_contrato, '')) like 'ENCERRADO%' then o.status_contrato
    when nullif(trim(o.status_contrato), '') is not null then upper(trim(o.status_contrato))
    else c.status
  end,
  data_atualizacao = to_char(current_date, 'DD/MM/YYYY')
from origem o
where o.contrato_id = c.id;

update public.atas_execucao e
set ata_item_id = (
  select i.id
  from public.atas_itens i
  where lower(trim(coalesce(i.cpl, ''))) = lower(trim(coalesce(e.cpl, '')))
    and lower(trim(coalesce(i.sim, ''))) = lower(trim(coalesce(e.sim, '')))
    and lower(trim(coalesce(i.item, ''))) = lower(trim(coalesce(e.item, '')))
  order by i.id
  limit 1
)
where e.ata_item_id is null;

do $$
begin
  if exists (select 1 from public.atas_itens where contrato_id is null) then
    raise exception 'Existem itens de ATA sem contrato_id; migracao cancelada.';
  end if;
  if exists (select 1 from public.atas_execucao where ata_item_id is null) then
    raise exception 'Existem execucoes sem ata_item_id; migracao cancelada.';
  end if;
end $$;

alter table public.atas_itens
  alter column contrato_id set not null;

alter table public.atas_execucao
  alter column ata_item_id set not null;

comment on column public.contratos.tipo_instrumento is
  'Define se o registro principal e um CONTRATO comum ou uma ATA.';

comment on column public.atas_itens.contrato_id is
  'Contrato principal do tipo ATA; empresa, numero, status e vigencia vem de contratos.';

comment on column public.atas_execucao.ata_item_id is
  'Item de ATA ao qual a solicitacao ou execucao pertence.';

commit;
