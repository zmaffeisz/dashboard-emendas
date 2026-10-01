-- Executar somente em qpvgpfwuurqcqprnpxua (contratos-dag).
create table if not exists public.requisicoes_materiais (
  id uuid primary key default gen_random_uuid(),
  unidade_id bigint not null references public.unidades(id),
  unidade_snapshot jsonb not null,
  referencias jsonb not null,
  dados_itens jsonb not null,
  solicitante_id uuid not null references public.profiles(id),
  solicitante_nome text not null,
  gerado_em timestamptz not null default now(),
  observacao text,
  coordenador_conferido boolean not null default false,
  pdf_path text not null unique,
  pdf_pronto boolean not null default false
);
create index if not exists requisicoes_materiais_unidade_idx on public.requisicoes_materiais(unidade_id);
create index if not exists requisicoes_materiais_solicitante_idx on public.requisicoes_materiais(solicitante_id);
create index if not exists requisicoes_materiais_referencias_idx on public.requisicoes_materiais using gin(referencias);
create table if not exists public.requisicoes_materiais_emails (
  id uuid primary key default gen_random_uuid(),
  requisicao_id uuid not null references public.requisicoes_materiais(id),
  clicado_em timestamptz not null default now(),
  clicado_por uuid not null references public.profiles(id),
  clicado_por_nome text not null,
  titulo text not null check(char_length(titulo) between 1 and 180),
  corpo text not null check(char_length(corpo) between 1 and 50000)
);
create index if not exists requisicoes_materiais_emails_req_idx on public.requisicoes_materiais_emails(requisicao_id,clicado_em desc);
create index if not exists requisicoes_materiais_emails_autor_idx on public.requisicoes_materiais_emails(clicado_por);

create or replace function private.pode_acessar_requisicao(p_itens jsonb,p_acao text)
returns boolean language sql stable security invoker set search_path='' as $$
  select jsonb_typeof(p_itens)='array' and jsonb_array_length(p_itens)>0
    and not exists(select 1 from jsonb_array_elements(p_itens) i
      where not coalesce(private.can_access_domain((i->>'secao_id')::bigint,
        case when i->>'tipo'='ATA' then array['atas','itens'] else array['itens'] end,p_acao),false));
$$;
revoke all on function private.pode_acessar_requisicao(jsonb,text) from public,anon;
grant execute on function private.pode_acessar_requisicao(jsonb,text) to authenticated;

-- Leitura autoritativa das quantidades/patrimônios, sem confiar em valores do cliente.
create or replace function public.preparar_requisicao_materiais(p_itens jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare ref jsonb; e public.itens_entregas%rowtype; a public.atas_execucao%rowtype;
  it public.itens%rowtype; ai public.atas_itens%rowtype; ei public.emenda_itens%rowtype;
  resultado jsonb:='[]'; ficha jsonb; v_id uuid; v_unidade bigint; v_unidades bigint[];
  v_patrimonios jsonb; v_fisicas jsonb; v_quantidade numeric; v_descricao text; v_secao bigint;
  v_processo text; v_contrato text; v_empenho text; v_nf text; v_af text; v_nome text;
begin
  if auth.uid() is null then raise exception 'É necessário estar logado.'; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 100 then
    raise exception 'Selecione de 1 a 100 registros de recebimento.';
  end if;
  if (select count(*) from jsonb_array_elements(p_itens))<>(select count(distinct (r->>'tipo',r->>'id')) from jsonb_array_elements(p_itens) r) then
    raise exception 'Há registros repetidos na seleção.';
  end if;
  for ref in select * from jsonb_array_elements(p_itens) loop
    v_id:=(ref->>'id')::uuid; v_unidade:=null; v_unidades:=null; v_patrimonios:=null; v_fisicas:=null;
    if ref ? 'unidades_ids' and (jsonb_typeof(ref->'unidades_ids') is distinct from 'array' or jsonb_array_length(ref->'unidades_ids')=0) then
      raise exception 'Selecione ao menos um bem físico deste recebimento.';
    end if;
    v_processo:=null; v_contrato:=null; v_empenho:=null; v_nf:=null; v_af:=null; v_nome:=null;
    if ref->>'tipo'='Aquisição' then
      select * into e from public.itens_entregas where id=v_id;
      if not found then raise exception 'Recebimento não encontrado ou sem permissão.'; end if;
      v_secao:=e.secao_id;
      if not private.can_access_domain(v_secao,array['itens'],'edit') then raise exception 'Sem permissão para requisitar este recebimento.'; end if;
      if e.tipo_material='CONSUMO' or e.status='cancelada' or coalesce(e.qtde_recebida,0)<=0 then raise exception 'Selecione um bem permanente recebido.'; end if;
      select * into it from public.itens where id=e.item_id;
      if not found then raise exception 'Item não encontrado.'; end if;
      select array_agg(distinct unidade_id) filter(where unidade_id is not null),
        jsonb_agg(nullif(btrim(patrimonio),'') order by unidade_seq),
        jsonb_agg(jsonb_build_object('id',id,'patrimonio',patrimonio,'unidade_id',unidade_id,'unidade_nome',unidade_nome) order by unidade_seq)
        into v_unidades,v_patrimonios,v_fisicas from public.itens_entregas_unidades where entrega_id=e.id
          and (not ref ? 'unidades_ids' or id in(select value::uuid from jsonb_array_elements_text(ref->'unidades_ids')));
      v_unidade:=coalesce(v_unidades[1],it.unidade_destino_id);
      v_quantidade:=e.qtde_recebida; v_descricao:=it.descricao; v_nf:=e.nota_fiscal; v_af:=e.af_numero;
      if e.nota_fiscal_id is not null then select numero into v_nf from public.notas_fiscais where id=e.nota_fiscal_id; end if;
      v_empenho:=e.empenho;
      if e.empenho_id is not null then select numero||case when ano is null then '' else '/'||ano end into v_empenho from public.empenhos where id=e.empenho_id; end if;
      if nullif(v_empenho,'') is null then
        select string_agg(distinct ep.numero||case when ep.ano is null then '' else '/'||ep.ano end,', ') into v_empenho
          from public.empenho_itens ep_it join public.empenhos ep on ep.id=ep_it.empenho_id where ep_it.item_id=it.id;
      end if;
      select identificador into v_processo from public.processos where id=it.processo_id;
      select numero_contrato into v_contrato from public.contratos where id=it.contrato_id;
      if v_patrimonios is null and nullif(btrim(e.patrimonio),'') is not null then v_patrimonios:=to_jsonb(regexp_split_to_array(e.patrimonio,'[;,\n]+')); end if;
      select nome into v_nome from public.unidades where id=v_unidade;
    elsif ref->>'tipo'='ATA' then
      select * into a from public.atas_execucao where id=v_id;
      if not found then raise exception 'Pedido de ATA não encontrado ou sem permissão.'; end if;
      v_secao:=a.secao_id;
      if not private.can_access_domain(v_secao,array['atas','itens'],'edit') then raise exception 'Sem permissão para requisitar este pedido.'; end if;
      if a.origem_recurso='carona' then raise exception 'Carona usa o aviso de retirada ao órgão solicitante.'; end if;
      if a.tipo_material='CONSUMO' or nullif(a.dt_entrega,'') is null or coalesce(a.qtde,0)<=0 then raise exception 'Selecione um bem permanente recebido.'; end if;
      select * into ai from public.atas_itens where id=a.ata_item_id;
      select * into ei from public.emenda_itens where id=a.emenda_item_id;
      select array_agg(distinct unidade_id) filter(where unidade_id is not null),
        jsonb_agg(nullif(btrim(patrimonio),'') order by unidade_seq),
        jsonb_agg(jsonb_build_object('id',id,'patrimonio',patrimonio,'unidade_id',unidade_id,'unidade_nome',unidade_nome) order by unidade_seq)
        into v_unidades,v_patrimonios,v_fisicas from public.atas_execucao_unidades where exec_id=a.id
          and (not ref ? 'unidades_ids' or id in(select value::uuid from jsonb_array_elements_text(ref->'unidades_ids')));
      v_unidade:=coalesce(v_unidades[1],ei.unidade_entrega_id,ei.unidade_beneficiada_id,(a.unidade_snapshot->>'id')::bigint);
      v_quantidade:=a.qtde; v_descricao:=coalesce(nullif(a.item,''),ai.item,ei.item);
      v_processo:=coalesce(nullif(a.cpl,''),ai.cpl); v_contrato:=coalesce(nullif(a.sim,''),ai.sim);
      v_empenho:=coalesce(nullif(a.empenho,''),ei.empenho); v_nf:=coalesce(nullif(a.nf,''),ei.nota_fiscal); v_af:=a.af_numero;
      if nullif(v_empenho,'') is null then
        select string_agg(distinct ep.numero||case when ep.ano is null then '' else '/'||ep.ano end,', ') into v_empenho
          from public.empenho_itens ep_it join public.empenhos ep on ep.id=ep_it.empenho_id where ep_it.emenda_item_id=a.emenda_item_id;
      end if;
      if v_patrimonios is null and nullif(btrim(ei.patrimonio),'') is not null then v_patrimonios:=to_jsonb(regexp_split_to_array(ei.patrimonio,'[;,\n]+')); end if;
      v_nome:=coalesce(nullif(a.unidade,''),ei.unidade_entrega,ei.unidade_beneficiada);
      if v_unidade is null then select id into v_unidade from public.unidades where ativo and lower(btrim(nome))=lower(btrim(v_nome)) order by id limit 1; end if;
    else raise exception 'Tipo de recebimento inválido.';
    end if;
    if ref ? 'unidades_ids' then
      if coalesce(jsonb_array_length(v_fisicas),0)<>jsonb_array_length(ref->'unidades_ids') then raise exception 'Bem físico inválido ou repetido na seleção.'; end if;
      v_quantidade:=jsonb_array_length(v_fisicas);
    end if;
    if coalesce(array_length(v_unidades,1),0)>1 then v_unidade:=null; end if;
    if nullif(btrim(v_nf),'') is null then raise exception 'O recebimento precisa estar vinculado a uma nota fiscal.'; end if;
    resultado:=resultado||jsonb_build_array(jsonb_build_object('tipo',ref->>'tipo','id',v_id,
      'unidade_id',v_unidade,'unidade_nome',v_nome,'item',v_descricao,'qtde',v_quantidade,
      'patrimonios',coalesce(v_patrimonios,'[]'::jsonb),'unidades_fisicas',coalesce(v_fisicas,'[]'::jsonb),
      'destinos_multiplos',coalesce(array_length(v_unidades,1),0)>1,'processo',v_processo,'contrato',v_contrato,
      'empenho',v_empenho,'nota_fiscal',v_nf,'af',v_af,'secao_id',v_secao));
  end loop;
  return resultado;
end;
$$;
revoke all on function public.preparar_requisicao_materiais(jsonb) from public,anon;
grant execute on function public.preparar_requisicao_materiais(jsonb) to authenticated;

create or replace function public.ficha_unidade_requisicao(p_id bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.ficha_unidade(u.id) from public.unidades u where u.id=p_id and u.ativo is true and auth.uid() is not null;
$$;
revoke all on function public.ficha_unidade_requisicao(bigint) from public,anon;
grant execute on function public.ficha_unidade_requisicao(bigint) to authenticated;

create or replace function private.validar_requisicao_materiais()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_ficha jsonb; v_itens jsonb; v_nome text;
begin
  if tg_op='UPDATE' then
    if to_jsonb(new)-'pdf_pronto' is distinct from to_jsonb(old)-'pdf_pronto' or old.pdf_pronto or not new.pdf_pronto then
      raise exception 'Uma requisição gerada é imutável. Gere uma nova versão.';
    end if;
    if not exists(select 1 from storage.objects where bucket_id='requisicoes-materiais' and name=old.pdf_path) then
      raise exception 'O PDF ainda não foi armazenado.';
    end if;
    return new;
  end if;
  if auth.uid() is null then raise exception 'É necessário estar logado.'; end if;
  if not new.coordenador_conferido then raise exception 'Confira os dados do coordenador antes de gerar.'; end if;
  v_itens:=public.preparar_requisicao_materiais(new.referencias);
  if new.dados_itens is distinct from v_itens then raise exception 'Os recebimentos mudaram. Atualize a prévia antes de gerar.'; end if;
  if exists(select 1 from jsonb_array_elements(v_itens) i where i->>'unidade_id' is not null and (i->>'unidade_id')::bigint<>new.unidade_id) then
    raise exception 'Todos os itens devem pertencer à mesma unidade de destino.';
  end if;
  if exists(select 1 from jsonb_array_elements(v_itens) i where (i->>'destinos_multiplos')::boolean) then
    raise exception 'Selecione somente os bens físicos destinados à mesma unidade.';
  end if;
  if jsonb_array_length(v_itens)>1 and exists(select 1 from jsonb_array_elements(v_itens) i where i->>'unidade_id' is null) then
    raise exception 'Identifique a unidade de cada registro individualmente antes de gerar um termo em lote.';
  end if;
  v_ficha:=public.ficha_unidade_requisicao(new.unidade_id);
  if v_ficha is null then raise exception 'Selecione uma unidade ativa cadastrada.'; end if;
  if nullif(btrim(v_ficha->>'endereco'),'') is null or nullif(btrim(v_ficha->>'telefone'),'') is null or nullif(btrim(v_ficha->'coordenador'->>'nome'),'') is null then
    raise exception 'Cadastre endereço, telefone e coordenador da unidade antes de gerar.';
  end if;
  if new.unidade_snapshot is distinct from v_ficha then raise exception 'O cadastro da unidade mudou. Confira a prévia novamente.'; end if;
  select nome into v_nome from public.profiles where id=auth.uid() and aprovado is true;
  if nullif(btrim(v_nome),'') is null then raise exception 'Preencha seu nome completo no cadastro de usuário.'; end if;
  new.solicitante_id:=auth.uid(); new.solicitante_nome:=v_nome; new.gerado_em:=clock_timestamp();
  new.dados_itens:=v_itens; new.unidade_snapshot:=v_ficha; new.pdf_pronto:=false;
  new.pdf_path:=new.id::text||'/termo.pdf';
  if char_length(coalesce(new.observacao,''))>3000 then raise exception 'Observações limitadas a 3000 caracteres.'; end if;
  return new;
end;
$$;
revoke all on function private.validar_requisicao_materiais() from public,anon;
grant execute on function private.validar_requisicao_materiais() to authenticated;
drop trigger if exists validar_requisicao_materiais on public.requisicoes_materiais;
create trigger validar_requisicao_materiais before insert or update on public.requisicoes_materiais
for each row execute function private.validar_requisicao_materiais();

create or replace function private.registrar_email_requisicao()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'É necessário estar logado.'; end if;
  if not exists(select 1 from public.requisicoes_materiais r where r.id=new.requisicao_id and r.pdf_pronto
    and private.pode_acessar_requisicao(r.dados_itens,'edit')) then raise exception 'Gere o PDF antes de preparar o e-mail.'; end if;
  new.clicado_por:=auth.uid(); new.clicado_em:=clock_timestamp();
  select nome into new.clicado_por_nome from public.profiles where id=auth.uid();
  return new;
end;
$$;
revoke all on function private.registrar_email_requisicao() from public,anon;
grant execute on function private.registrar_email_requisicao() to authenticated;
drop trigger if exists registrar_email_requisicao on public.requisicoes_materiais_emails;
create trigger registrar_email_requisicao before insert on public.requisicoes_materiais_emails
for each row execute function private.registrar_email_requisicao();

alter table public.requisicoes_materiais enable row level security;
alter table public.requisicoes_materiais_emails enable row level security;
revoke all on public.requisicoes_materiais,public.requisicoes_materiais_emails from anon,authenticated;
grant select,insert,update on public.requisicoes_materiais to authenticated;
grant select,insert on public.requisicoes_materiais_emails to authenticated;
drop policy if exists requisicoes_select on public.requisicoes_materiais;
create policy requisicoes_select on public.requisicoes_materiais for select to authenticated
  using(private.pode_acessar_requisicao(dados_itens,'view'));
drop policy if exists requisicoes_insert on public.requisicoes_materiais;
create policy requisicoes_insert on public.requisicoes_materiais for insert to authenticated
  with check(solicitante_id=(select auth.uid()) and private.pode_acessar_requisicao(dados_itens,'edit'));
drop policy if exists requisicoes_finalize on public.requisicoes_materiais;
create policy requisicoes_finalize on public.requisicoes_materiais for update to authenticated
  using(solicitante_id=(select auth.uid()) and not pdf_pronto and private.pode_acessar_requisicao(dados_itens,'edit'))
  with check(solicitante_id=(select auth.uid()) and private.pode_acessar_requisicao(dados_itens,'edit'));
drop policy if exists requisicoes_emails_select on public.requisicoes_materiais_emails;
create policy requisicoes_emails_select on public.requisicoes_materiais_emails for select to authenticated
  using(exists(select 1 from public.requisicoes_materiais r where r.id=requisicao_id));
drop policy if exists requisicoes_emails_insert on public.requisicoes_materiais_emails;
create policy requisicoes_emails_insert on public.requisicoes_materiais_emails for insert to authenticated
  with check(clicado_por=(select auth.uid()) and exists(select 1 from public.requisicoes_materiais r
    where r.id=requisicao_id and r.pdf_pronto and private.pode_acessar_requisicao(r.dados_itens,'edit')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('requisicoes-materiais','requisicoes-materiais',false,10485760,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists requisicoes_pdf_select on storage.objects;
create policy requisicoes_pdf_select on storage.objects for select to authenticated
  using(bucket_id='requisicoes-materiais' and exists(select 1 from public.requisicoes_materiais r where r.pdf_path=name));
drop policy if exists requisicoes_pdf_insert on storage.objects;
create policy requisicoes_pdf_insert on storage.objects for insert to authenticated
  with check(bucket_id='requisicoes-materiais' and exists(select 1 from public.requisicoes_materiais r where r.pdf_path=name
    and r.solicitante_id=(select auth.uid()) and not r.pdf_pronto and private.pode_acessar_requisicao(r.dados_itens,'edit')));
drop policy if exists requisicoes_pdf_cleanup on storage.objects;
create policy requisicoes_pdf_cleanup on storage.objects for delete to authenticated
  using(bucket_id='requisicoes-materiais' and exists(select 1 from public.requisicoes_materiais r where r.pdf_path=name
    and r.solicitante_id=(select auth.uid()) and not r.pdf_pronto and private.pode_acessar_requisicao(r.dados_itens,'edit')));
notify pgrst,'reload schema';
