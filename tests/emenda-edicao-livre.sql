-- Executar SOMENTE em transação com ROLLBACK, após carregar a migration na mesma
-- transação. Cria dados sintéticos; não utiliza itens reais como alvo de escrita.
do $$
declare
  v_user uuid; v_secao bigint; v_emenda uuid:=gen_random_uuid();
  v_livre uuid:='00000000-0000-4000-8000-000000000001';
  v_preso uuid:='ffffffff-ffff-4fff-8fff-ffffffffffff';
  v_dados jsonb; v_itens jsonb; v_versao text; v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.listar_emenda_itens_edicao(v_emenda);
    raise exception 'TESTE: acesso anônimo foi aceito';
  exception when insufficient_privilege then null; end;
  select id into v_user from public.profiles where papel='admin' and aprovado is true order by created_at limit 1;
  if v_user is null then raise exception 'Teste requer um administrador aprovado'; end if;
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  select id into v_secao from public.secoes where private.can_access_domain(id,array['dashboard'],'edit') limit 1;
  if v_secao is null then raise exception 'Teste requer seção acessível ao administrador'; end if;
  insert into public.emendas(id,secao_id,tipo,emenda,ano,parlamentar,objeto,valor_cedido)
  values(v_emenda,v_secao,'FEDERAL','TESTE-ROLLBACK-'||v_emenda::text,2026,'Teste','Teste',10000);
  insert into public.emenda_itens(id,emenda_id,secao_id,item,item_cadastrado,qtde,qtde_cadastrada,vl_unitario_cadastrado,vl_total_cadastrado)
  values(v_livre,v_emenda,v_secao,'Livre','Livre',2,2,500,1000),(v_preso,v_emenda,v_secao,'Vinculado','Vinculado',1,1,300,300);
  insert into public.itens(emenda_item_id,secao_id) values(v_preso,v_secao);
  -- API sob o mesmo papel SQL do cliente, com RLS ativo.
  execute 'set local role authenticated';
  v_itens:=public.listar_emenda_itens_edicao(v_emenda);
  assert jsonb_array_length(v_itens)=2,'Lista deve retornar os dois itens';
  assert private.emenda_item_bloqueio_edicao(v_livre) is null,'Item livre bloqueado';
  assert private.emenda_item_bloqueio_edicao(v_preso) is not null,'Vínculo indireto não detectado';
  select to_jsonb(e) into v_dados from public.emendas e where id=v_emenda;
  select md5(to_jsonb(ei)::text) into v_versao from public.emenda_itens ei where id=v_livre;
  v_result:=public.salvar_emenda_com_itens_livres(v_emenda,v_dados,jsonb_build_array(
    jsonb_build_object('id',v_livre,'versao',v_versao,'item','Livre editado','qtde',3,'valor',600.50)));
  assert (v_result->>'atualizados')::int=1;
  assert (select qtde_cadastrada=3 and qtde=3 and vl_total_cadastrado=1801.50 and vl_unitario is null and vl_total is null from public.emenda_itens where id=v_livre),'Plano incorreto ou execução inventada';
  begin
    perform public.salvar_emenda_com_itens_livres(v_emenda,v_dados,jsonb_build_array(
      jsonb_build_object('id',v_livre,'versao',v_versao,'excluir',true)));
    raise exception 'TESTE: versão antiga foi aceita';
  exception when serialization_failure then null; end;
  select md5(to_jsonb(ei)::text) into v_versao from public.emenda_itens ei where id=v_livre;
  begin
    insert into public.itens(emenda_item_id,secao_id) values(v_livre,v_secao);
    perform public.salvar_emenda_com_itens_livres(v_emenda,v_dados,jsonb_build_array(
      jsonb_build_object('id',v_livre,'versao',v_versao,'excluir',true)));
    raise exception 'TESTE: vínculo criado depois de abrir a edição foi ignorado';
  exception when foreign_key_violation then null; end;
  begin
    perform public.salvar_emenda_com_itens_livres(v_emenda,v_dados||'{"objeto":"Não deve salvar"}',jsonb_build_array(
      jsonb_build_object('id',v_livre,'versao',v_versao,'excluir',true),
      jsonb_build_object('id',v_preso,'versao','qualquer','excluir',true)));
    raise exception 'TESTE: exclusão vinculada foi aceita';
  exception when foreign_key_violation then null; end;
  assert exists(select 1 from public.emenda_itens where id=v_livre),'Exclusão parcial não foi revertida';
  assert (select objeto='Teste' from public.emendas where id=v_emenda),'Cabeçalho foi salvo parcialmente';
  begin
    perform public.salvar_emenda_com_itens_livres(v_emenda,v_dados,jsonb_build_array(
      jsonb_build_object('id',v_livre,'versao',v_versao,'item','Inválido','qtde',0,'valor',500)));
    raise exception 'TESTE: quantidade zero foi aceita';
  exception when invalid_parameter_value then null; end;
  v_result:=public.salvar_emenda_com_itens_livres(v_emenda,v_dados,jsonb_build_array(
    jsonb_build_object('id',v_livre,'versao',v_versao,'excluir',true)));
  assert (v_result->>'excluidos')::int=1 and not exists(select 1 from public.emenda_itens where id=v_livre);
  assert exists(select 1 from public.itens where emenda_item_id=v_preso),'Vínculo de outro item removido';
  execute 'reset role';
end;
$$;
select 'PASSOU: RLS, item livre, vínculo indireto, versão concorrente, validação, exclusão e atomicidade; dados sintéticos serão revertidos.' as resultado;
