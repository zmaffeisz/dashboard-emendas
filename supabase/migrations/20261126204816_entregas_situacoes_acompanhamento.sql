-- Produção exclusiva: qpvgpfwuurqcqprnpxua (contratos-dag).
-- Acompanhamento administrativo; não altera recebimento, NF, patrimônio ou prazos.
create table if not exists public.entregas_situacoes (
  id uuid primary key default gen_random_uuid(),
  requisicao_id uuid not null,
  item_id uuid references public.itens(id) on delete cascade,
  item_entrega_id uuid references public.itens_entregas(id) on delete cascade,
  ata_execucao_id uuid references public.atas_execucao(id) on delete cascade,
  secao_id bigint not null references public.secoes(id),
  situacao text not null check(situacao in ('pendente','sem_prazo','automatico')),
  descricao text not null default '' check(length(descricao)<=4000),
  registrado_por uuid references auth.users(id) on delete set null,
  registrado_em timestamptz not null default clock_timestamp(),
  chave text generated always as (case when item_entrega_id is not null then 'a'||item_entrega_id::text when ata_execucao_id is not null then 't'||ata_execucao_id::text else 'i'||item_id::text end) stored,
  constraint entregas_situacoes_origem_check check(num_nonnulls(item_id,item_entrega_id,ata_execucao_id)=1),
  constraint entregas_situacoes_pendente_check check(situacao<>'pendente' or length(btrim(descricao))>0),
  constraint entregas_situacoes_requisicao_unique unique(requisicao_id,chave)
);
create index if not exists entregas_situacoes_item_idx on public.entregas_situacoes(item_id);
create index if not exists entregas_situacoes_entrega_idx on public.entregas_situacoes(item_entrega_id);
create index if not exists entregas_situacoes_ata_idx on public.entregas_situacoes(ata_execucao_id);
create index if not exists entregas_situacoes_secao_idx on public.entregas_situacoes(secao_id,registrado_em desc,id desc);
create index if not exists entregas_situacoes_autor_idx on public.entregas_situacoes(registrado_por);

create or replace function private.preparar_situacao_entrega()
returns trigger language plpgsql set search_path='' as $$
declare
  origem record;
  secao bigint;
  fechado boolean:=false;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.aprovado is true) then
    raise exception 'Usuário autenticado e aprovado é obrigatório.' using errcode='42501';
  end if;
  if num_nonnulls(new.item_id,new.item_entrega_id,new.ata_execucao_id)<>1 then
    raise exception 'Informe exatamente uma origem.' using errcode='23514';
  end if;
  if new.item_entrega_id is not null then
    select e.* into origem from public.itens_entregas e where e.id=new.item_entrega_id;
    secao:=origem.secao_id;
    fechado:=coalesce(origem.status='cancelada',false) or
      ((coalesce(origem.qtde_recebida,0)>0 or origem.data_recebimento is not null) and coalesce(origem.qtde_autorizada,0)-coalesce(origem.qtde_recebida,0)<=0);
  elsif new.ata_execucao_id is not null then
    select a.* into origem from public.atas_execucao a where a.id=new.ata_execucao_id;
    secao:=origem.secao_id;
    fechado:=length(btrim(coalesce(origem.dt_entrega,'')))>0;
  else
    select i.* into origem from public.itens i where i.id=new.item_id and i.contrato_id is not null;
    secao:=origem.secao_id;
    fechado:=lower(coalesce(origem.status,'')) in ('cancelado','cancelada','inativo') or exists(
      select 1 from public.contratos_medicoes m where m.escopo_item_id=new.item_id and m.escopo_conclusao is true and m.status in ('aprovada_pelo_fiscal','aprovada_com_glosa'));
    if origem.origem not in ('aquisicao','servico') then
      raise exception 'Item fora do Controle de Entregas.' using errcode='23514';
    end if;
  end if;
  if secao is null or not private.can_access_domain(secao,array['itens'],'edit') then
    raise exception 'Sem permissão para alterar a situação desta entrega.' using errcode='42501';
  end if;
  if fechado then raise exception 'Entrega concluída ou cancelada. Atualize a lista.' using errcode='23514'; end if;
  new.secao_id:=secao;
  new.descricao:=btrim(coalesce(new.descricao,''));
  new.registrado_por:=auth.uid();
  new.registrado_em:=clock_timestamp();
  return new;
end $$;
revoke all on function private.preparar_situacao_entrega() from public,anon,authenticated;
drop trigger if exists preparar_situacao_entrega on public.entregas_situacoes;
create trigger preparar_situacao_entrega before insert on public.entregas_situacoes
for each row execute function private.preparar_situacao_entrega();

alter table public.entregas_situacoes enable row level security;
revoke all on public.entregas_situacoes from public,anon,authenticated;
grant select,insert on public.entregas_situacoes to authenticated;
grant select,insert,update,delete on public.entregas_situacoes to service_role;
drop policy if exists situacoes_select on public.entregas_situacoes;
create policy situacoes_select on public.entregas_situacoes for select to authenticated using (
  private.can_access_domain(secao_id,array['itens'],'view') and (
    (item_id is not null and exists(select 1 from public.itens i where i.id=entregas_situacoes.item_id and i.secao_id=entregas_situacoes.secao_id)) or
    (item_entrega_id is not null and exists(select 1 from public.itens_entregas e where e.id=entregas_situacoes.item_entrega_id and e.secao_id=entregas_situacoes.secao_id)) or
    (ata_execucao_id is not null and exists(select 1 from public.atas_execucao a where a.id=entregas_situacoes.ata_execucao_id and a.secao_id=entregas_situacoes.secao_id))
  )
);
drop policy if exists situacoes_insert on public.entregas_situacoes;
create policy situacoes_insert on public.entregas_situacoes for insert to authenticated with check (
  registrado_por=(select auth.uid()) and private.can_access_domain(secao_id,array['itens'],'edit')
);

create or replace function public.registrar_situacao_entregas(p_alvos jsonb,p_situacao text,p_descricao text,p_requisicao uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare total integer; anteriores integer; distintos integer;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if p_requisicao is null or p_situacao is null or p_situacao not in ('pendente','sem_prazo','automatico') then
    raise exception 'Situação ou identificação inválida.' using errcode='23514';
  end if;
  if jsonb_typeof(p_alvos) is distinct from 'array' then raise exception 'Seleção inválida.' using errcode='23514'; end if;
  total:=jsonb_array_length(p_alvos);
  if total<1 or total>500 then raise exception 'Selecione entre 1 e 500 registros.' using errcode='23514'; end if;
  if length(btrim(coalesce(p_descricao,'')))>4000 or (p_situacao='pendente' and length(btrim(coalesce(p_descricao,'')))=0) then
    raise exception 'Descreva a pendência (até 4000 caracteres).' using errcode='23514';
  end if;
  select count(distinct (x.item_id,x.item_entrega_id,x.ata_execucao_id)) into distintos
    from jsonb_to_recordset(p_alvos) as x(item_id uuid,item_entrega_id uuid,ata_execucao_id uuid)
    where num_nonnulls(x.item_id,x.item_entrega_id,x.ata_execucao_id)=1;
  if distintos<>total then raise exception 'Seleção duplicada ou inválida.' using errcode='23514'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_requisicao::text,0));
  select count(*) into anteriores from public.entregas_situacoes s where s.requisicao_id=p_requisicao and s.registrado_por=auth.uid();
  if anteriores>0 then
    if anteriores<>total or exists(
      select 1 from public.entregas_situacoes s where s.requisicao_id=p_requisicao and
      (s.situacao<>p_situacao or s.descricao<>btrim(coalesce(p_descricao,'')) or not exists(
        select 1 from jsonb_to_recordset(p_alvos) as x(item_id uuid,item_entrega_id uuid,ata_execucao_id uuid)
        where (s.item_id,s.item_entrega_id,s.ata_execucao_id) is not distinct from (x.item_id,x.item_entrega_id,x.ata_execucao_id)))) then
      raise exception 'Requisição já utilizada com outros dados.' using errcode='23514';
    end if;
    return anteriores;
  end if;
  insert into public.entregas_situacoes(requisicao_id,item_id,item_entrega_id,ata_execucao_id,situacao,descricao,secao_id)
    select p_requisicao,x.item_id,x.item_entrega_id,x.ata_execucao_id,p_situacao,btrim(coalesce(p_descricao,'')),0
    from jsonb_to_recordset(p_alvos) as x(item_id uuid,item_entrega_id uuid,ata_execucao_id uuid);
  return total;
end $$;
revoke all on function public.registrar_situacao_entregas(jsonb,text,text,uuid) from public,anon;
grant execute on function public.registrar_situacao_entregas(jsonb,text,text,uuid) to authenticated;
comment on table public.entregas_situacoes is 'Histórico de acompanhamento administrativo; última situação por origem prevalece em entregas abertas. Não altera o prazo contratual ou o recebimento.';
notify pgrst,'reload schema';
