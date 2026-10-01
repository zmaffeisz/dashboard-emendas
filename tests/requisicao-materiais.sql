-- Teste transacional no projeto qpvgpfwuurqcqprnpxua. Nada é persistido.
-- Seleciona o admin aprovado da seção dos dois bens reais corrigidos pelo usuário.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where papel='admin' and aprovado and nome='Patrick Santos Maffei' limit 1),true);
set local role authenticated;
do $$
declare refs jsonb; dados jsonb; ficha jsonb; req public.requisicoes_materiais%rowtype; mensagem text;
begin
  select jsonb_agg(jsonb_build_object('tipo','ATA','id',exec_id,'unidades_ids',jsonb_build_array(id))) into refs
    from public.atas_execucao_unidades where patrimonio in('399392','399354');
  dados:=public.preparar_requisicao_materiais(refs);
  if jsonb_array_length(dados)<>2 or exists(select 1 from jsonb_array_elements(dados) i where (i->>'qtde')::numeric<>1 or (i->>'unidade_id')::bigint<>38) then raise exception 'FAIL: quantidades/destino incorretos'; end if;
  ficha:=public.ficha_unidade_requisicao(38);
  insert into public.requisicoes_materiais(unidade_id,unidade_snapshot,referencias,dados_itens,coordenador_conferido)
    values(38,ficha,refs,dados,true) returning * into req;
  perform set_config('test.requisicao_id',req.id::text,true);
  if req.solicitante_id<>auth.uid() or req.solicitante_nome<>'Patrick Santos Maffei' or req.pdf_path<>req.id::text||'/termo.pdf' then raise exception 'FAIL: autor/caminho'; end if;
  begin
    insert into public.requisicoes_materiais(unidade_id,unidade_snapshot,referencias,dados_itens,coordenador_conferido) values(27,ficha,refs,dados,true);
    raise exception 'FAIL: permitiu outro destino';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; if sqlerrm not like '%mesma unidade%' then raise; end if; end;
  begin
    insert into public.requisicoes_materiais(unidade_id,unidade_snapshot,referencias,dados_itens,coordenador_conferido) values(38,ficha,refs,jsonb_set(dados,'{0,qtde}','999'),true);
    raise exception 'FAIL: permitiu quantidade adulterada';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; if sqlerrm not like '%recebimentos mudaram%' then raise; end if; end;
  begin
    insert into public.requisicoes_materiais(unidade_id,unidade_snapshot,referencias,dados_itens,coordenador_conferido) values(38,jsonb_set(ficha,'{endereco}','"Outro endereço"'),refs,dados,true);
    raise exception 'FAIL: permitiu cadastro desatualizado';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; if sqlerrm not like '%cadastro da unidade mudou%' then raise; end if; end;
  begin
    insert into public.requisicoes_materiais(unidade_id,unidade_snapshot,referencias,dados_itens,coordenador_conferido) values(38,ficha,refs,dados,false);
    raise exception 'FAIL: permitiu gerar sem conferir';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; if sqlerrm not like '%Confira%' then raise; end if; end;
  begin
    update public.requisicoes_materiais set observacao='reescrita' where id=req.id;
    raise exception 'FAIL: permitiu reescrever o termo';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; if sqlerrm not like '%imutável%' then raise; end if; end;
  begin
    update public.requisicoes_materiais set pdf_pronto=true where id=req.id;
    raise exception 'FAIL: finalizou sem PDF';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; if sqlerrm not like '%PDF ainda%' then raise; end if; end;
  begin
    insert into public.requisicoes_materiais_emails(requisicao_id,titulo,corpo) values(req.id,'Teste','Teste');
    raise exception 'FAIL: marcou envio antes do PDF';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; if sqlerrm not like '%Gere o PDF%' then raise; end if; end;
end $$;
reset role;
-- Apenas metadados simulados dentro do rollback, sem upload externo.
insert into storage.objects(bucket_id,name) select 'requisicoes-materiais',pdf_path from public.requisicoes_materiais where id=current_setting('test.requisicao_id')::uuid;
set local role authenticated;
update public.requisicoes_materiais set pdf_pronto=true where id=current_setting('test.requisicao_id')::uuid;
insert into public.requisicoes_materiais_emails(requisicao_id,titulo,corpo) values(current_setting('test.requisicao_id')::uuid,'Termo de Requisição - PA Laranjeiras - Patrimônios 399392, 399354','Texto preservado');
do $$ begin
  if not exists(select 1 from public.requisicoes_materiais_emails where requisicao_id=current_setting('test.requisicao_id')::uuid and clicado_por=auth.uid() and clicado_por_nome='Patrick Santos Maffei') then raise exception 'FAIL: evento sem autor'; end if;
end $$;
reset role;
update public.unidades set endereco=endereco||' (teste)' where id=38;
set local role authenticated;
do $$ begin
  if (select unidade_snapshot->>'endereco' from public.requisicoes_materiais where id=current_setting('test.requisicao_id')::uuid) like '%(teste)%' then raise exception 'FAIL: cadastro alterou termo passado'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ begin
  if exists(select 1 from public.requisicoes_materiais where id=current_setting('test.requisicao_id')::uuid) then raise exception 'FAIL: vazou termo a usuário sem acesso'; end if;
  if exists(select 1 from storage.objects where bucket_id='requisicoes-materiais' and name=current_setting('test.requisicao_id')||'/termo.pdf') then raise exception 'FAIL: vazou PDF'; end if;
end $$;
select 'PASSOU: destino, quantidades, conferência, corrida de cadastro, PDF obrigatório, autoria, imutabilidade e RLS' as resultado;
rollback;
