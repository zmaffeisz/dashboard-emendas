-- Somente qpvgpfwuurqcqprnpxua. Todos os eventos de teste são desfeitos.
begin;
do $$ begin
  perform set_config('request.jwt.claims',json_build_object('sub',(
    select id from public.profiles where aprovado is true and papel='admin' limit 1
  ),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare alvos jsonb; req uuid:=gen_random_uuid(); invalido uuid:=gen_random_uuid(); fechado uuid;
begin
  select jsonb_agg(jsonb_build_object('ata_execucao_id',t.id)) into alvos from (
    select id from public.atas_execucao where coalesce(btrim(dt_entrega),'')=''
      and private.can_access_domain(secao_id,array['itens'],'edit') limit 2
  ) t;
  if jsonb_array_length(alvos)<>2 then raise exception 'Fixtures insuficientes'; end if;
  begin
    perform public.registrar_situacao_entregas(alvos,'pendente','',gen_random_uuid());
    raise exception 'FALHOU: pendência vazia aceita';
  exception when check_violation then null; end;
  if public.registrar_situacao_entregas(alvos,'pendente','Faltam peças — teste transacional',req)<>2 then
    raise exception 'FALHOU: lote não gravado';
  end if;
  perform public.registrar_situacao_entregas(alvos,'pendente','Faltam peças — teste transacional',req);
  if (select count(*) from public.entregas_situacoes where requisicao_id=req)<>2 then
    raise exception 'FALHOU: duplicidade';
  end if;
  begin
    perform public.registrar_situacao_entregas(alvos||jsonb_build_array(jsonb_build_object('ata_execucao_id',gen_random_uuid())),'sem_prazo','',invalido);
    raise exception 'FALHOU: alvo inválido aceito';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.entregas_situacoes where requisicao_id=invalido) then
    raise exception 'FALHOU: lote parcial gravado';
  end if;
  select id into fechado from public.atas_execucao where length(btrim(coalesce(dt_entrega,'')))>0
    and private.can_access_domain(secao_id,array['itens'],'edit') limit 1;
  if fechado is not null then
    begin
      perform public.registrar_situacao_entregas(jsonb_build_array(jsonb_build_object('ata_execucao_id',fechado)),'pendente','Teste',gen_random_uuid());
      raise exception 'FALHOU: entrega concluída aceita';
    exception when check_violation then null; end;
  end if;
  perform public.registrar_situacao_entregas(alvos,'sem_prazo','Sem previsão',gen_random_uuid());
  perform public.registrar_situacao_entregas(alvos,'automatico','Resolvido',gen_random_uuid());
  begin
    update public.entregas_situacoes set descricao='modificada' where requisicao_id=req;
    raise exception 'FALHOU: histórico editável';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.entregas_situacoes where requisicao_id=req;
    raise exception 'FALHOU: histórico apagável';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.registrar_situacao_entregas(jsonb,text,text,uuid)','execute') then
    raise exception 'FALHOU: função pública para anônimos';
  end if;
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
  begin
    perform public.registrar_situacao_entregas(alvos,'pendente','Teste',gen_random_uuid());
    raise exception 'FALHOU: perfil não aprovado aceito';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
