-- Projeto oficial: qpvgpfwuurqcqprnpxua. Schema/estado anterior salvo fora do repo.
-- Histórico líquido é um registro próprio: não cria bruto, glosa ou ateste fictício.
create table if not exists public.contratos_demanda_config (
  contrato_id integer primary key references public.contratos(id),
  vigencia_atual_id uuid not null references public.contratos_vigencias(id),
  compensar_quantidades boolean not null default false,
  observacoes text,
  secao_id bigint not null references public.secoes(id),
  created_at timestamptz not null default now()
);
create table if not exists public.contratos_medicoes_historicas (
  id uuid primary key default gen_random_uuid(),
  contrato_id integer not null references public.contratos(id),
  vigencia_id uuid not null references public.contratos_vigencias(id),
  nota_fiscal_id uuid not null references public.notas_fiscais(id),
  numero_medicao integer not null check(numero_medicao>0),
  competencia text not null check(competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  valor_liquido numeric(16,2) not null check(valor_liquido>=0),
  quantidades_informadas boolean not null default false,
  importacao_ref text not null,
  observacoes text,
  secao_id bigint not null references public.secoes(id),
  created_at timestamptz not null default now(),
  unique(contrato_id,numero_medicao),
  unique(importacao_ref)
);
create table if not exists public.contratos_medicoes_historicas_itens (
  id uuid primary key default gen_random_uuid(),
  historico_medicao_id uuid not null references public.contratos_medicoes_historicas(id) on delete cascade,
  item_id uuid not null references public.itens(id),
  categoria_operacional text not null,
  quantidade numeric(16,3) not null check(quantidade>0),
  valor_unitario_referencia numeric(16,2) check(valor_unitario_referencia>0),
  secao_id bigint not null references public.secoes(id),
  unique(historico_medicao_id,item_id,categoria_operacional)
);
create index if not exists cdem_config_vigencia_idx on public.contratos_demanda_config(vigencia_atual_id);
create index if not exists cdem_config_secao_idx on public.contratos_demanda_config(secao_id);
create index if not exists cmed_hist_vigencia_idx on public.contratos_medicoes_historicas(vigencia_id);
create index if not exists cmed_hist_nf_idx on public.contratos_medicoes_historicas(nota_fiscal_id);
create index if not exists cmed_hist_secao_idx on public.contratos_medicoes_historicas(secao_id);
create index if not exists cmed_hist_itens_item_idx on public.contratos_medicoes_historicas_itens(item_id);
create index if not exists cmed_hist_itens_secao_idx on public.contratos_medicoes_historicas_itens(secao_id);

alter table public.contratos_demanda_config enable row level security;
alter table public.contratos_medicoes_historicas enable row level security;
alter table public.contratos_medicoes_historicas_itens enable row level security;
revoke all on public.contratos_demanda_config,public.contratos_medicoes_historicas,public.contratos_medicoes_historicas_itens from anon,authenticated;
grant select on public.contratos_demanda_config,public.contratos_medicoes_historicas,public.contratos_medicoes_historicas_itens to authenticated;
drop policy if exists scoped_select on public.contratos_demanda_config;
create policy scoped_select on public.contratos_demanda_config for select to authenticated
 using(private.can_access_domain(secao_id,array['contratos','fiscalizacao','notas-fiscais'],'view'));
drop policy if exists scoped_select on public.contratos_medicoes_historicas;
create policy scoped_select on public.contratos_medicoes_historicas for select to authenticated
 using(private.can_access_domain(secao_id,array['contratos','fiscalizacao','notas-fiscais'],'view'));
drop policy if exists scoped_select on public.contratos_medicoes_historicas_itens;
create policy scoped_select on public.contratos_medicoes_historicas_itens for select to authenticated
 using(private.can_access_domain(secao_id,array['contratos','fiscalizacao','notas-fiscais'],'view'));

create or replace function private.validar_medicao_historica_demanda()
returns trigger language plpgsql set search_path='' as $$
declare v_ct integer; v_sec bigint; v_vig uuid; v_nf public.notas_fiscais%rowtype;
begin
 if tg_table_name='contratos_medicoes_historicas_itens' then
   select contrato_id,secao_id into v_ct,v_sec from public.contratos_medicoes_historicas where id=new.historico_medicao_id;
   if not exists(select 1 from public.itens where id=new.item_id and contrato_id=v_ct and origem='servico_demanda') then
     raise exception 'Item não pertence ao serviço por demanda desta medição histórica.';
   end if;
 else
   v_ct=new.contrato_id;
   select secao_id into v_sec from public.contratos where id=v_ct and modelo_execucao='por_demanda';
   if v_sec is null then raise exception 'Contrato não identificado como serviço por demanda.'; end if;
   if tg_table_name='contratos_demanda_config' then v_vig=new.vigencia_atual_id; else v_vig=new.vigencia_id; end if;
   if not exists(select 1 from public.contratos_vigencias where id=v_vig and contrato_id=v_ct) then
     raise exception 'Vigência não pertence ao contrato.';
   end if;
   if tg_table_name='contratos_medicoes_historicas' then
     select * into v_nf from public.notas_fiscais where id=new.nota_fiscal_id;
     if v_nf.contrato_id is distinct from v_ct or v_nf.origem_sistema is distinct from 'historico_liquido'
       or v_nf.valor_total is not null or v_nf.valor_bruto is not null or v_nf.medicao_id is not null then
       raise exception 'Histórico líquido requer NF histórica do contrato, com bruto desconhecido e vínculo próprio.';
     end if;
     if not exists(select 1 from public.contratos_vigencias where id=v_vig
       and new.competencia between to_char(data_inicio,'YYYY-MM') and to_char(data_fim,'YYYY-MM')) then
       raise exception 'Competência fora dos meses da vigência.';
     end if;
   end if;
 end if;
 new.secao_id=v_sec;
 return new;
end $$;
revoke all on function private.validar_medicao_historica_demanda() from public,anon,authenticated;
drop trigger if exists validar_historico on public.contratos_demanda_config;
create trigger validar_historico before insert or update on public.contratos_demanda_config for each row execute function private.validar_medicao_historica_demanda();
drop trigger if exists validar_historico on public.contratos_medicoes_historicas;
create trigger validar_historico before insert or update on public.contratos_medicoes_historicas for each row execute function private.validar_medicao_historica_demanda();
drop trigger if exists validar_historico on public.contratos_medicoes_historicas_itens;
create trigger validar_historico before insert or update on public.contratos_medicoes_historicas_itens for each row execute function private.validar_medicao_historica_demanda();

create or replace function private.conferir_rateio_nf_historica()
returns trigger language plpgsql set search_path='' as $$
declare v_id uuid; v_ids uuid[]; v_nf public.notas_fiscais%rowtype; v_soma numeric;
begin
 if tg_op='INSERT' then v_ids=array[new.nota_fiscal_id];
 elsif tg_op='DELETE' then v_ids=array[old.nota_fiscal_id];
 else v_ids=array[old.nota_fiscal_id,new.nota_fiscal_id]; end if;
 foreach v_id in array v_ids loop
   select * into v_nf from public.notas_fiscais where id=v_id;
   select sum(valor_liquido) into v_soma from public.contratos_medicoes_historicas where nota_fiscal_id=v_id;
   if v_soma is not null and (v_nf.valor_liquido is null or v_soma<>v_nf.valor_liquido) then
     raise exception 'Rateio histórico não corresponde ao líquido da NF %.',v_nf.numero;
   end if;
 end loop;
 return null;
end $$;
revoke all on function private.conferir_rateio_nf_historica() from public,anon,authenticated;
drop trigger if exists conferir_rateio_nf_historica on public.contratos_medicoes_historicas;
create constraint trigger conferir_rateio_nf_historica after insert or update or delete on public.contratos_medicoes_historicas
 deferrable initially deferred for each row execute function private.conferir_rateio_nf_historica();

create or replace function private.proteger_nf_historica_liquida()
returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.contratos_medicoes_historicas where nota_fiscal_id=old.id) then
   if tg_op='DELETE' then raise exception 'NF com histórico importado e rateio preservado.'; end if;
   if (new.contrato_id,new.fornecedor_id,new.numero,new.numero_normalizado,new.valor_total,new.valor_bruto,new.valor_liquido,new.valor_glosa,new.valor_aprovado,new.medicao_id,new.status,new.origem_sistema,new.secao_id)
     is distinct from (old.contrato_id,old.fornecedor_id,old.numero,old.numero_normalizado,old.valor_total,old.valor_bruto,old.valor_liquido,old.valor_glosa,old.valor_aprovado,old.medicao_id,old.status,old.origem_sistema,old.secao_id) then
     raise exception 'NF de histórico líquido: correções devem preservar o rateio das medições históricas.';
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.proteger_nf_historica_liquida() from public,anon,authenticated;
drop trigger if exists proteger_nf_historica_liquida on public.notas_fiscais;
create trigger proteger_nf_historica_liquida before update or delete on public.notas_fiscais for each row execute function private.proteger_nf_historica_liquida();
