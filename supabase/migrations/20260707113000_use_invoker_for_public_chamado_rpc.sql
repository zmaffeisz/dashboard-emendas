create or replace function public.abrir_chamado_publico(
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
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_proto text;
begin
  v_proto := 'SES-' || lpad(nextval('public.chamados_seq')::text, 4, '0') || '/' || to_char(now(),'MMYYYY');

  insert into public.chamados(
    protocolo,
    carimbo,
    data_solicitacao,
    unidade,
    equipamento,
    fabricante,
    serie,
    patrimonio,
    categoria,
    servico,
    problema,
    descricao,
    endereco,
    telefone,
    responsavel,
    grau_urgencia,
    email_retorno,
    rechamado,
    data_rechamado,
    observacao
  ) values (
    v_proto,
    p_carimbo,
    p_data_solicitacao,
    p_unidade,
    p_equipamento,
    p_fabricante,
    p_serie,
    p_patrimonio,
    p_categoria,
    p_servico,
    p_problema,
    p_descricao,
    p_endereco,
    p_telefone,
    p_responsavel,
    p_grau_urgencia,
    p_email_retorno,
    p_rechamado,
    p_data_rechamado,
    p_observacao
  );

  insert into public.chamados_controle(protocolo,status)
  values (v_proto,'Aguardando abertura')
  on conflict (protocolo) do nothing;

  return v_proto;
end;
$$;

grant usage, select on sequence public.chamados_seq to anon, authenticated;
grant insert on table public.chamados to anon, authenticated;
grant insert on table public.chamados_controle to anon, authenticated;
revoke all on function public.abrir_chamado_publico(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.abrir_chamado_publico(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) to anon, authenticated;
