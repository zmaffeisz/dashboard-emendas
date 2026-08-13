-- Vínculo de planejamento entre item de Emenda e futura Ata ainda em licitação.
-- Este registro não representa reserva, requisição nem consumo de saldo.

create table if not exists public.ata_planejamento_emendas (
  id uuid primary key default gen_random_uuid(),
  processo_id bigint not null references public.processos(id) on delete cascade,
  processo_item_id uuid not null references public.itens(id) on delete cascade,
  emenda_id uuid not null references public.emendas(id) on delete cascade,
  emenda_item_id uuid not null references public.emenda_itens(id) on delete cascade,
  secao_id bigint references public.secoes(id),
  quantidade_prevista numeric not null check (quantidade_prevista > 0),
  contrato_id integer references public.contratos(id),
  ata_item_id uuid references public.atas_itens(id),
  ata_execucao_id uuid references public.atas_execucao(id),
  quantidade_requisitada numeric check (quantidade_requisitada is null or quantidade_requisitada > 0),
  status text not null default 'PLANEJAMENTO' check (status in (
    'PLANEJAMENTO',
    'ATA_VIGENTE_AGUARDANDO_REQUISICAO',
    'REQUISITADO',
    'CANCELADO'
  )),
  observacoes text,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ata_planejamento_emendas_estado_check check (
    (status = 'PLANEJAMENTO' and contrato_id is null and ata_item_id is null and ata_execucao_id is null and quantidade_requisitada is null)
    or (status = 'ATA_VIGENTE_AGUARDANDO_REQUISICAO' and contrato_id is not null and ata_item_id is not null and ata_execucao_id is null and quantidade_requisitada is null)
    or (status = 'REQUISITADO' and contrato_id is not null and ata_item_id is not null and ata_execucao_id is not null and quantidade_requisitada is not null)
    or status = 'CANCELADO'
  )
);

create unique index if not exists ata_planejamento_emendas_item_ativo_uidx
  on public.ata_planejamento_emendas (emenda_item_id)
  where status <> 'CANCELADO';

create index if not exists ata_planejamento_emendas_processo_idx
  on public.ata_planejamento_emendas (processo_id, processo_item_id);

create index if not exists ata_planejamento_emendas_ata_item_idx
  on public.ata_planejamento_emendas (ata_item_id)
  where ata_item_id is not null;

alter table public.ata_planejamento_emendas enable row level security;

revoke all on table public.ata_planejamento_emendas from anon, authenticated;
grant select, insert, update on table public.ata_planejamento_emendas to authenticated;
grant all on table public.ata_planejamento_emendas to service_role;

drop policy if exists ata_planejamento_emendas_select on public.ata_planejamento_emendas;
create policy ata_planejamento_emendas_select
  on public.ata_planejamento_emendas
  for select
  to authenticated
  using (private.can_access_domain(secao_id, array['licitacoes','dashboard','atas','contratos'], 'view'));

drop policy if exists ata_planejamento_emendas_insert on public.ata_planejamento_emendas;
create policy ata_planejamento_emendas_insert
  on public.ata_planejamento_emendas
  for insert
  to authenticated
  with check (
    status = 'PLANEJAMENTO'
    and contrato_id is null
    and ata_item_id is null
    and ata_execucao_id is null
    and private.can_access_domain(secao_id, array['licitacoes','dashboard','atas','contratos'], 'edit')
  );

drop policy if exists ata_planejamento_emendas_update on public.ata_planejamento_emendas;
create policy ata_planejamento_emendas_update
  on public.ata_planejamento_emendas
  for update
  to authenticated
  using (private.can_access_domain(secao_id, array['licitacoes','dashboard','atas','contratos'], 'edit'))
  with check (private.can_access_domain(secao_id, array['licitacoes','dashboard','atas','contratos'], 'edit'));

create or replace function private.validar_planejamento_emenda_ata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.processo_id,new.processo_item_id,new.emenda_id,new.emenda_item_id)
       is distinct from (old.processo_id,old.processo_item_id,old.emenda_id,old.emenda_item_id) then
      raise exception 'Os vínculos de origem do planejamento não podem ser alterados.';
    end if;
    if old.status = 'CANCELADO' then
      raise exception 'Um planejamento cancelado não pode ser reativado.';
    end if;
    if new.status = 'CANCELADO' and old.status <> 'PLANEJAMENTO' then
      raise exception 'Somente um planejamento ainda não formalizado pode ser cancelado.';
    end if;
  end if;

  if not exists (
    select 1 from public.emenda_itens ei
     where ei.id = new.emenda_item_id and ei.emenda_id = new.emenda_id
  ) then raise exception 'O item informado não pertence à Emenda.'; end if;

  if not exists (
    select 1 from public.itens i
     where i.id = new.processo_item_id and i.processo_id = new.processo_id and i.origem = 'ata'
  ) then raise exception 'O item informado não pertence ao processo de Ata.'; end if;

  if new.status in ('ATA_VIGENTE_AGUARDANDO_REQUISICAO','REQUISITADO') and not exists (
    select 1
      from public.atas_itens ai
      join public.itens i on i.ata_item_id = ai.id
     where ai.id = new.ata_item_id
       and ai.contrato_id = new.contrato_id
       and i.processo_id = new.processo_id
       and i.contrato_id = new.contrato_id
       and (i.id = new.processo_item_id or i.descricao = (
         select origem.descricao from public.itens origem where origem.id = new.processo_item_id
       ))
  ) then raise exception 'O item da Ata não corresponde ao item planejado da licitação.'; end if;

  if new.status = 'ATA_VIGENTE_AGUARDANDO_REQUISICAO'
     and not (tg_op = 'UPDATE' and old.status = 'REQUISITADO' and pg_trigger_depth() > 1)
     and exists (
    select 1 from public.atas_execucao ae
     where ae.ata_item_id = new.ata_item_id and ae.emenda_item_id = new.emenda_item_id
  ) then raise exception 'Já existe uma requisição para este planejamento.'; end if;

  if new.status = 'REQUISITADO' and not exists (
    select 1 from public.atas_execucao ae
     where ae.id = new.ata_execucao_id
       and ae.ata_item_id = new.ata_item_id
       and ae.emenda_item_id = new.emenda_item_id
       and ae.emenda_id = new.emenda_id
       and ae.qtde = new.quantidade_requisitada
  ) then raise exception 'A requisição não corresponde ao planejamento.'; end if;

  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.validar_planejamento_emenda_ata() from public, anon, authenticated;

drop trigger if exists trg_validar_planejamento_emenda_ata on public.ata_planejamento_emendas;
create trigger trg_validar_planejamento_emenda_ata
before insert or update on public.ata_planejamento_emendas
for each row execute function private.validar_planejamento_emenda_ata();

create or replace function private.sincronizar_planejamento_ata_requisicao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.emenda_item_id is not null then
    update public.ata_planejamento_emendas
       set ata_execucao_id = new.id,
           quantidade_requisitada = new.qtde,
           status = 'REQUISITADO',
           updated_at = now()
     where emenda_item_id = new.emenda_item_id
       and ata_item_id = new.ata_item_id
       and status = 'ATA_VIGENTE_AGUARDANDO_REQUISICAO';
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.ata_planejamento_emendas
       set ata_execucao_id = null,
           quantidade_requisitada = null,
           status = 'ATA_VIGENTE_AGUARDANDO_REQUISICAO',
           updated_at = now()
     where ata_execucao_id = old.id
       and status = 'REQUISITADO';
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.sincronizar_planejamento_ata_requisicao() from public, anon, authenticated;

drop trigger if exists trg_sincronizar_planejamento_ata_requisicao on public.atas_execucao;
drop trigger if exists trg_reabrir_planejamento_ata_requisicao on public.atas_execucao;
create trigger trg_sincronizar_planejamento_ata_requisicao
after insert on public.atas_execucao
for each row execute function private.sincronizar_planejamento_ata_requisicao();

create trigger trg_reabrir_planejamento_ata_requisicao
before delete on public.atas_execucao
for each row execute function private.sincronizar_planejamento_ata_requisicao();

comment on table public.ata_planejamento_emendas is
  'Planejamento não orçamentário de item de Emenda para futura Ata em licitação; só vira execução quando atas_execucao é criada.';
