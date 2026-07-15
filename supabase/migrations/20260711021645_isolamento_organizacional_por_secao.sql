-- Isolamento organizacional por secao.
-- Visitantes conservam somente a consulta publica de Emendas e a abertura de chamados.
-- Usuarios autenticados combinam permissoes por aba com abrangencia de secao/divisao.

alter table public.profiles
  add column if not exists escopo_organizacional text not null default 'secao',
  add column if not exists secao_id bigint references public.secoes(id),
  add column if not exists contexto_modo text not null default 'secao',
  add column if not exists contexto_secao_id bigint references public.secoes(id);

alter table public.profiles drop constraint if exists profiles_escopo_organizacional_check;
alter table public.profiles add constraint profiles_escopo_organizacional_check
  check (escopo_organizacional in ('secao','divisao'));
alter table public.profiles drop constraint if exists profiles_contexto_modo_check;
alter table public.profiles add constraint profiles_contexto_modo_check
  check (contexto_modo in ('secao','divisao'));

do $$
declare t text;
begin
  foreach t in array array[
    'processos','contratos','emendas','emenda_itens','itens','itens_status_historico',
    'atas_itens','atas_execucao','atas_execucao_unidades','itens_entregas',
    'itens_entregas_unidades','empenhos','empenho_itens','notas_fiscais',
    'nota_fiscal_itens','contratos_fiscalizadores','contratos_historico',
    'contratos_vigencias','contratos_medicoes','contratos_medicao_itens',
    'contratos_medicao_glosas','chamados','chamados_anexos','chamados_controle',
    'fiscalizacao_historico','termos_ateste','termo_chamados','termo_contratos',
    'sancoes_administrativas','sancoes_solicitadas','sancao_itens','inventario_ac'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I add column if not exists secao_id bigint references public.secoes(id)',t);
      execute format('create index if not exists %I on public.%I(secao_id)', 'idx_'||t||'_secao_id', t);
    end if;
  end loop;
end $$;

-- Migra os dados-raiz existentes. O clone nasceu na SUEQ-EQUIP; registros sem
-- secao anterior ficam sob essa secao para nao se tornarem orfaos/invisiveis.
update public.processos p set secao_id=s.id
from public.secoes s where p.secao_id is null and upper(btrim(p.secao))=upper(btrim(s.sigla));
update public.contratos c set secao_id=coalesce(
  (select p.secao_id from public.processos p where p.id=c.processo_id),
  (select s.id from public.secoes s where upper(btrim(s.sigla))=upper(btrim(c.secao)) limit 1)
) where c.secao_id is null;

update public.processos set secao_id=(select id from public.secoes where sigla='SUEQ - EQUIP') where secao_id is null;
update public.contratos set secao_id=coalesce((select secao_id from public.processos where id=contratos.processo_id),(select id from public.secoes where sigla='SUEQ - EQUIP')) where secao_id is null;
update public.emendas set secao_id=(select id from public.secoes where sigla='SUEQ - EQUIP') where secao_id is null;

update public.profiles set
  secao_id=coalesce(secao_id,(select id from public.secoes where sigla='SUEQ - EQUIP')),
  contexto_secao_id=coalesce(contexto_secao_id,secao_id,(select id from public.secoes where sigla='SUEQ - EQUIP'));

-- Propagacao inicial pela arvore de relacionamentos.
update public.emenda_itens x set secao_id=e.secao_id from public.emendas e where x.emenda_id=e.id and x.secao_id is null;
update public.itens x set secao_id=coalesce(
  (select p.secao_id from public.processos p where p.id=x.processo_id),
  (select c.secao_id from public.contratos c where c.id=x.contrato_id),
  (select e.secao_id from public.emendas e where e.id=x.emenda_id)
) where x.secao_id is null;
update public.atas_itens x set secao_id=c.secao_id from public.contratos c where x.contrato_id=c.id and x.secao_id is null;
update public.atas_execucao x set secao_id=coalesce(
  (select ai.secao_id from public.atas_itens ai where ai.id=x.ata_item_id),
  (select e.secao_id from public.emendas e where e.id=x.emenda_id)
) where x.secao_id is null;
update public.itens_entregas x set secao_id=i.secao_id from public.itens i where x.item_id=i.id and x.secao_id is null;
update public.itens_entregas_unidades x set secao_id=i.secao_id from public.itens i where x.item_id=i.id and x.secao_id is null;
update public.empenhos x set secao_id=coalesce(
  (select p.secao_id from public.processos p where p.id=x.processo_id),
  (select c.secao_id from public.contratos c where c.id=x.contrato_id),
  (select e.secao_id from public.emendas e where e.id=x.emenda_id)
) where x.secao_id is null;
update public.notas_fiscais x set secao_id=coalesce(
  (select p.secao_id from public.processos p where p.id=x.processo_id),
  (select c.secao_id from public.contratos c where c.id=x.contrato_id),
  (select e.secao_id from public.emendas e where e.id=x.emenda_id)
) where x.secao_id is null;

do $$
declare r record;
begin
  for r in
    select * from (values
      ('itens_status_historico','item_id','itens'),
      ('atas_execucao_unidades','exec_id','atas_execucao'),
      ('empenho_itens','empenho_id','empenhos'),
      ('nota_fiscal_itens','nota_fiscal_id','notas_fiscais'),
      ('contratos_fiscalizadores','contrato_id','contratos'),
      ('contratos_historico','contrato_id','contratos'),
      ('contratos_vigencias','contrato_id','contratos'),
      ('contratos_medicoes','contrato_id','contratos'),
      ('fiscalizacao_historico','contrato_id','contratos'),
      ('sancoes_administrativas','contrato_id','contratos'),
      ('sancoes_solicitadas','contrato_id','contratos'),
      ('termo_contratos','contrato_id','contratos')
    ) v(child_table,fk,parent_table)
  loop
    if to_regclass('public.'||r.child_table) is not null then
      execute format('update public.%I x set secao_id=p.secao_id from public.%I p where x.%I=p.id and x.secao_id is null',r.child_table,r.parent_table,r.fk);
    end if;
  end loop;
end $$;

update public.contratos_medicao_itens x set secao_id=m.secao_id from public.contratos_medicoes m where x.medicao_id=m.id and x.secao_id is null;
update public.contratos_medicao_glosas x set secao_id=m.secao_id from public.contratos_medicoes m where x.medicao_id=m.id and x.secao_id is null;
update public.sancao_itens x set secao_id=s.secao_id from public.sancoes_solicitadas s where x.sancao_id=s.id and x.secao_id is null;

-- Chamados e Fiscalizacao pertencem exclusivamente a SUEQ - EQUIP.
update public.chamados set secao_id=(select id from public.secoes where sigla='SUEQ - EQUIP') where secao_id is null;
update public.chamados_controle set secao_id=(select id from public.secoes where sigla='SUEQ - EQUIP') where secao_id is null;
update public.chamados_anexos set secao_id=(select id from public.secoes where sigla='SUEQ - EQUIP') where secao_id is null;
update public.fiscalizacao_historico set secao_id=(select id from public.secoes where sigla='SUEQ - EQUIP') where secao_id is null;
update public.termos_ateste set secao_id=(select id from public.secoes where sigla='SUEQ - EQUIP') where secao_id is null;
update public.termo_chamados set secao_id=(select id from public.secoes where sigla='SUEQ - EQUIP') where secao_id is null;
update public.inventario_ac set secao_id=(select id from public.secoes where sigla='SUEQ - EQUIP') where secao_id is null;

create or replace function private.current_profile_secao_id()
returns bigint language sql stable security definer set search_path=public as $$
  select p.secao_id from public.profiles p
  where p.id=(select auth.uid()) and p.aprovado is true
$$;

create or replace function private.current_context_secao_id()
returns bigint language sql stable security definer set search_path=public as $$
  select case
    when p.papel='admin' and p.contexto_modo='divisao' then null
    when p.papel='admin' then coalesce(p.contexto_secao_id,p.secao_id)
    when p.escopo_organizacional='divisao' then null
    else p.secao_id end
  from public.profiles p where p.id=(select auth.uid()) and p.aprovado is true
$$;

create or replace function private.can_access_secao(p_secao_id bigint)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.aprovado is true
      and p_secao_id is not null
      and (
        (p.papel='admin' and p.contexto_modo='divisao')
        or (p.papel='admin' and p_secao_id=coalesce(p.contexto_secao_id,p.secao_id))
        or (p.papel<>'admin' and p.escopo_organizacional='divisao')
        or (p.papel<>'admin' and p.escopo_organizacional='secao' and p_secao_id=p.secao_id)
      )
  )
$$;

create or replace function private.can_access_domain(p_secao_id bigint,p_tabs text[],p_action text)
returns boolean language sql stable security definer set search_path=public as $$
  select private.can_access_secao(p_secao_id)
    and exists(select 1 from unnest(p_tabs) t(tab) where public.can_access_tab(t.tab,p_action))
$$;

revoke all on function private.current_profile_secao_id() from public;
revoke all on function private.current_context_secao_id() from public;
revoke all on function private.can_access_secao(bigint) from public;
revoke all on function private.can_access_domain(bigint,text[],text) from public;
grant execute on function private.current_profile_secao_id() to authenticated;
grant execute on function private.current_context_secao_id() to authenticated;
grant execute on function private.can_access_secao(bigint) to authenticated;
grant execute on function private.can_access_domain(bigint,text[],text) to authenticated;

-- Preenche automaticamente a secao de novos registros. Registros-raiz usam a
-- secao enviada pelo formulario ou o contexto atual; filhos herdam do pai.
create or replace function private.set_record_secao()
returns trigger language plpgsql security definer set search_path=public as $$
declare j jsonb:=to_jsonb(new); v bigint; k text; parent text;
begin
  v=nullif(j->>'secao_id','')::bigint;
  if tg_table_name in ('chamados','chamados_controle','chamados_anexos','fiscalizacao_historico','termos_ateste','termo_chamados') then
    select id into v from public.secoes where sigla='SUEQ - EQUIP';
  end if;
  if v is null and tg_table_name in ('processos','contratos') and nullif(j->>'secao','') is not null then
    select id into v from public.secoes where upper(btrim(sigla))=upper(btrim(j->>'secao')) limit 1;
  end if;
  if v is null then
    foreach k in array array['processo_id','contrato_id','emenda_id','item_id','ata_item_id','exec_id','entrega_id','empenho_id','nota_fiscal_id','medicao_id','sancao_id','chamado_id','termo_id'] loop
      if nullif(j->>k,'') is not null then
        parent:=case k
          when 'processo_id' then 'processos' when 'contrato_id' then 'contratos'
          when 'emenda_id' then 'emendas' when 'item_id' then 'itens'
          when 'ata_item_id' then 'atas_itens' when 'exec_id' then 'atas_execucao'
          when 'entrega_id' then 'itens_entregas' when 'empenho_id' then 'empenhos'
          when 'nota_fiscal_id' then 'notas_fiscais' when 'medicao_id' then 'contratos_medicoes'
          when 'sancao_id' then 'sancoes_solicitadas' when 'chamado_id' then 'chamados'
          when 'termo_id' then 'termos_ateste' end;
        if to_regclass('public.'||parent) is not null then
          execute format('select secao_id from public.%I where id=$1',parent) into v using (j->>k)::bigint;
          exit when v is not null;
        end if;
      end if;
    end loop;
  end if;
  v:=coalesce(v,private.current_context_secao_id(),private.current_profile_secao_id());
  if v is null and tg_table_name in ('chamados','chamados_controle','chamados_anexos') then
    select id into v from public.secoes where sigla='SUEQ - EQUIP';
  end if;
  new:=jsonb_populate_record(new,jsonb_build_object('secao_id',v));
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array[
    'processos','contratos','emendas','emenda_itens','itens','itens_status_historico',
    'atas_itens','atas_execucao','atas_execucao_unidades','itens_entregas','itens_entregas_unidades',
    'empenhos','empenho_itens','notas_fiscais','nota_fiscal_itens','contratos_fiscalizadores',
    'contratos_historico','contratos_vigencias','contratos_medicoes','contratos_medicao_itens',
    'contratos_medicao_glosas','chamados','chamados_anexos','chamados_controle','fiscalizacao_historico',
    'termos_ateste','termo_chamados','termo_contratos','sancoes_administrativas',
    'sancoes_solicitadas','sancao_itens','inventario_ac'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists set_record_secao on public.%I',t);
      execute format('create trigger set_record_secao before insert or update on public.%I for each row execute function private.set_record_secao()',t);
    end if;
  end loop;
end $$;

-- Remove todas as politicas operacionais antigas (muitas tinham USING true)
-- e recria acesso autenticado por secao + permissao de aba.
do $$ declare t text; p record; begin
  foreach t in array array[
    'processos','contratos','emendas','emenda_itens','itens','itens_status_historico','atas_itens',
    'atas_execucao','atas_execucao_unidades','itens_entregas','itens_entregas_unidades','empenhos',
    'empenho_itens','notas_fiscais','nota_fiscal_itens','contratos_fiscalizadores','contratos_historico',
    'contratos_vigencias','contratos_medicoes','contratos_medicao_itens','contratos_medicao_glosas',
    'chamados','chamados_anexos','chamados_controle','fiscalizacao_historico','termos_ateste',
    'termo_chamados','termo_contratos','sancoes_administrativas','sancoes_solicitadas','sancao_itens','inventario_ac'
  ] loop
    if to_regclass('public.'||t) is not null then
      for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy %I on public.%I',p.policyname,t);
      end loop;
    end if;
  end loop;
end $$;

do $$
declare r record; tabs text; t text;
begin
  for r in select * from (values
    ('processos',array['licitacoes','contratos','dashboard']),('itens',array['licitacoes','itens','contratos','dashboard']),
    ('itens_status_historico',array['licitacoes']),('contratos',array['contratos']),
    ('contratos_fiscalizadores',array['contratos']),('contratos_historico',array['contratos']),
    ('contratos_vigencias',array['contratos']),('contratos_medicoes',array['contratos','fiscalizacao']),
    ('contratos_medicao_itens',array['contratos','fiscalizacao']),('contratos_medicao_glosas',array['contratos','fiscalizacao']),
    ('atas_itens',array['atas']),('atas_execucao',array['atas','itens']),('atas_execucao_unidades',array['atas','itens']),
    ('itens_entregas',array['itens']),('itens_entregas_unidades',array['itens']),('inventario_ac',array['inventario-ac']),
    ('emendas',array['dashboard']),('emenda_itens',array['dashboard']),('empenhos',array['empenhos']),
    ('empenho_itens',array['empenhos']),('notas_fiscais',array['contratos','itens','fiscalizacao']),
    ('nota_fiscal_itens',array['contratos','itens','fiscalizacao']),('chamados',array['chamados-novos','fiscalizacao']),
    ('chamados_anexos',array['chamados-novos','fiscalizacao']),('chamados_controle',array['chamados-novos','fiscalizacao']),
    ('fiscalizacao_historico',array['fiscalizacao']),('termos_ateste',array['fiscalizacao','contratos']),
    ('termo_chamados',array['fiscalizacao']),('termo_contratos',array['fiscalizacao','contratos']),
    ('sancoes_administrativas',array['sancoes']),('sancoes_solicitadas',array['sancoes','atas']),('sancao_itens',array['sancoes','atas'])
  ) v(table_name,tab_keys)
  loop
    t:=r.table_name; tabs:=quote_literal(r.tab_keys::text)||'::text[]';
    if to_regclass('public.'||t) is not null then
      execute format('create policy scoped_select on public.%I for select to authenticated using (private.can_access_domain(secao_id,%s,''view''))',t,tabs);
      execute format('create policy scoped_insert on public.%I for insert to authenticated with check (private.can_access_domain(secao_id,%s,''edit''))',t,tabs);
      execute format('create policy scoped_update on public.%I for update to authenticated using (private.can_access_domain(secao_id,%s,''edit'')) with check (private.can_access_domain(secao_id,%s,''edit''))',t,tabs,tabs);
      execute format('create policy scoped_delete on public.%I for delete to authenticated using (private.can_access_domain(secao_id,%s,''edit''))',t,tabs);
    end if;
  end loop;
end $$;

-- Emendas permanecem publicas somente para leitura anonima.
create policy public_emendas_select on public.emendas for select to anon using (true);
create policy public_emenda_itens_select on public.emenda_itens for select to anon using (true);

-- Abertura publica de chamados continua disponivel, sempre atribuida a SUEQ-EQUIP.
create policy public_chamados_insert on public.chamados for insert to anon
  with check (protocolo is not null and length(btrim(protocolo))>0);
create policy public_chamados_anexos_insert on public.chamados_anexos for insert to anon
  with check (chamado_id is not null and storage_path is not null and length(btrim(storage_path))>0);
create policy public_chamados_controle_insert on public.chamados_controle for insert to anon
  with check (protocolo is not null and status='Aguardando abertura');

-- Somente cadastros indispensaveis ao formulario publico ficam legiveis sem login.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='unidades' and 'anon'=any(roles) loop
    execute format('drop policy %I on public.unidades',p.policyname);
  end loop;
end $$;
create policy public_unidades_ativas_select on public.unidades for select to anon using (ativo is true);

comment on column public.profiles.escopo_organizacional is 'secao: alcance restrito; divisao: alcance de todas as secoes, ainda sujeito a permissoes por aba.';
comment on column public.profiles.contexto_modo is 'Contexto operacional do administrador: secao ou divisao.';
