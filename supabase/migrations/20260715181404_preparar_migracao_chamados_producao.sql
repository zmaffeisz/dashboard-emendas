-- Prepara o clone para receber os chamados reais sem duplicidade e sem perda
-- silenciosa do historico de fiscalizacao.

alter table public.chamados
  add column if not exists request_id uuid;

create unique index if not exists chamados_request_id_key
  on public.chamados(request_id)
  where request_id is not null;

create unique index if not exists chamados_controle_chamado_id_key
  on public.chamados_controle(chamado_id)
  where chamado_id is not null;

alter table public.fiscalizacao_historico
  add column if not exists situacao_anterior text,
  add column if not exists situacao_nova text,
  add column if not exists data_alteracao date,
  add column if not exists alterado_por text;

update public.fiscalizacao_historico
set situacao_nova=coalesce(situacao_nova,status),
    data_alteracao=coalesce(data_alteracao,created_at::date),
    alterado_por=coalesce(alterado_por,usuario)
where situacao_nova is null
   or data_alteracao is null
   or alterado_por is null;

drop function if exists public.registrar_fiscalizacao_os(text,text,date,text,text,text);

create function public.registrar_fiscalizacao_os(
  p_protocolo text,
  p_situacao text,
  p_data_atendimento_os date,
  p_servico_realizado text,
  p_ocorrencias text,
  p_fiscalizado_por text
)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public
as $$
declare
  v_anterior public.chamados_controle%rowtype;
  v_atual public.chamados_controle%rowtype;
begin
  if p_situacao is null or p_situacao not in (
    'nao_fiscalizado','pendente','conforme','conforme_ressalva','parcial','nao_conforme'
  ) then
    raise exception 'Situacao de fiscalizacao invalida.' using errcode='22023';
  end if;

  select * into v_anterior
  from public.chamados_controle
  where protocolo=p_protocolo
  for update;

  if not found then
    raise exception 'Chamado nao encontrado ou sem permissao para fiscalizar.' using errcode='P0002';
  end if;

  update public.chamados_controle
  set situacao_os=p_situacao,
      data_atendimento_os=p_data_atendimento_os,
      servico_realizado=nullif(btrim(p_servico_realizado),''),
      ocorrencias=nullif(btrim(p_ocorrencias),''),
      fiscalizado_por=nullif(btrim(p_fiscalizado_por),''),
      fiscalizado_em=current_date,
      updated_at=now()
  where id=v_anterior.id
  returning * into v_atual;

  if not found then
    raise exception 'Sem permissao para atualizar a fiscalizacao.' using errcode='42501';
  end if;

  if coalesce(v_anterior.situacao_os,'nao_fiscalizado') is distinct from p_situacao then
    insert into public.fiscalizacao_historico(
      chamado_id,contrato_id,protocolo,status,observacao,usuario,
      situacao_anterior,situacao_nova,data_alteracao,alterado_por,secao_id
    ) values (
      v_atual.chamado_id,v_atual.contrato_id,v_atual.protocolo,p_situacao,
      nullif(btrim(p_ocorrencias),''),nullif(btrim(p_fiscalizado_por),''),
      coalesce(v_anterior.situacao_os,'nao_fiscalizado'),p_situacao,current_date,
      nullif(btrim(p_fiscalizado_por),''),v_atual.secao_id
    );
  end if;

  return to_jsonb(v_atual);
end;
$$;

revoke all on function public.registrar_fiscalizacao_os(text,text,date,text,text,text) from public,anon;
grant execute on function public.registrar_fiscalizacao_os(text,text,date,text,text,text) to authenticated;

drop function if exists public.abrir_chamado_publico_v2(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
);
drop function if exists private.abrir_chamado_publico_idempotente(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
);

create function private.abrir_chamado_publico_idempotente(
  p_request_id uuid,
  p_carimbo text,
  p_data_solicitacao text,
  p_unidade text,
  p_equipamento text,
  p_fabricante text,
  p_serie text,
  p_patrimonio text,
  p_categoria text,
  p_servico text,
  p_problema text,
  p_descricao text,
  p_endereco text,
  p_telefone text,
  p_responsavel text,
  p_grau_urgencia text,
  p_email_retorno text,
  p_rechamado text default null,
  p_data_rechamado text default null,
  p_observacao text default null,
  p_protocolo text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_chamado_id uuid;
  v_proto text;
begin
  if p_request_id is null then
    raise exception 'Identificador da solicitacao obrigatorio.' using errcode='22004';
  end if;
  if nullif(btrim(p_unidade),'') is null
     or nullif(btrim(p_equipamento),'') is null
     or nullif(btrim(p_patrimonio),'') is null
     or nullif(btrim(p_descricao),'') is null
     or nullif(btrim(p_responsavel),'') is null
     or nullif(btrim(p_email_retorno),'') is null then
    raise exception 'Campos obrigatorios do chamado nao preenchidos.' using errcode='22023';
  end if;

  -- Serializa repeticoes do mesmo envio antes de consumir a sequencia.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));

  select id,protocolo into v_chamado_id,v_proto
  from public.chamados
  where request_id=p_request_id;

  if found then
    return jsonb_build_object('chamado_id',v_chamado_id,'protocolo',v_proto,'reutilizado',true);
  end if;

  v_proto := 'SES-' || lpad(nextval('public.chamados_seq')::text,4,'0') || '/' || to_char(now(),'MMYYYY');

  insert into public.chamados(
    request_id,protocolo,carimbo,data_solicitacao,unidade,equipamento,
    fabricante,serie,patrimonio,categoria,servico,problema,descricao,
    endereco,telefone,responsavel,grau_urgencia,email_retorno,rechamado,
    data_rechamado,observacao
  ) values (
    p_request_id,v_proto,p_carimbo,p_data_solicitacao,p_unidade,p_equipamento,
    p_fabricante,p_serie,p_patrimonio,p_categoria,p_servico,p_problema,p_descricao,
    p_endereco,p_telefone,p_responsavel,p_grau_urgencia,p_email_retorno,p_rechamado,
    p_data_rechamado,p_observacao
  )
  returning id into v_chamado_id;

  insert into public.chamados_controle(chamado_id,protocolo,chamado_protocolo,status)
  values (v_chamado_id,v_proto,v_proto,'Aguardando abertura');

  return jsonb_build_object('chamado_id',v_chamado_id,'protocolo',v_proto,'reutilizado',false);
end;
$$;

create function public.abrir_chamado_publico_v2(
  p_request_id uuid,
  p_carimbo text,
  p_data_solicitacao text,
  p_unidade text,
  p_equipamento text,
  p_fabricante text,
  p_serie text,
  p_patrimonio text,
  p_categoria text,
  p_servico text,
  p_problema text,
  p_descricao text,
  p_endereco text,
  p_telefone text,
  p_responsavel text,
  p_grau_urgencia text,
  p_email_retorno text,
  p_rechamado text default null,
  p_data_rechamado text default null,
  p_observacao text default null,
  p_protocolo text default null
)
returns jsonb
language sql
security invoker
set search_path=pg_catalog,public,private
as $$
  select private.abrir_chamado_publico_idempotente(
    p_request_id,p_carimbo,p_data_solicitacao,p_unidade,p_equipamento,
    p_fabricante,p_serie,p_patrimonio,p_categoria,p_servico,p_problema,
    p_descricao,p_endereco,p_telefone,p_responsavel,p_grau_urgencia,
    p_email_retorno,p_rechamado,p_data_rechamado,p_observacao,p_protocolo
  );
$$;

revoke all on function private.abrir_chamado_publico_idempotente(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) from public;
grant usage on schema private to anon,authenticated;
grant execute on function private.abrir_chamado_publico_idempotente(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) to anon,authenticated;

revoke all on function public.abrir_chamado_publico_v2(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) from public;
grant execute on function public.abrir_chamado_publico_v2(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) to anon,authenticated;

-- A versao antiga nao possui idempotencia e nao deve continuar exposta.
revoke all on function public.abrir_chamado_publico(
  text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text
) from public,anon,authenticated;
