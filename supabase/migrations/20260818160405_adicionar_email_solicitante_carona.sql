alter table public.atas_execucao
  add column if not exists email_solicitante text;

do $migration$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.atas_execucao'::regclass
       and conname = 'atas_execucao_email_solicitante_check'
  ) then
    alter table public.atas_execucao
      add constraint atas_execucao_email_solicitante_check
      check (
        (
          origem_recurso = 'carona'
          and email_solicitante is not null
          and length(btrim(email_solicitante)) between 3 and 254
          and btrim(email_solicitante) like '%_@_%._%'
        )
        or (
          origem_recurso is distinct from 'carona'
          and email_solicitante is null
        )
      ) not valid;
  end if;
end
$migration$;

alter table public.atas_execucao
  validate constraint atas_execucao_email_solicitante_check;

drop function if exists public.criar_solicitacao_ata_execucao_carona(
  uuid, text, numeric, numeric, text, uuid, uuid, text, text, text
);

create or replace function public.criar_solicitacao_ata_execucao_carona(
  p_ata_item_id uuid,
  p_unidade text,
  p_qtde numeric,
  p_valor numeric default 0,
  p_origem_recurso text default 'carona',
  p_emenda_id uuid default null,
  p_emenda_item_id uuid default null,
  p_data_af text default null,
  p_dt_entrega text default null,
  p_codigo_siam_secretaria text default null,
  p_email_solicitante text default null
)
returns table(exec_id uuid, emenda_item_id uuid, saldo_item_id uuid, parcial boolean)
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_exec record;
  v_codigo text := nullif(btrim(p_codigo_siam_secretaria), '');
  v_email text := lower(nullif(btrim(p_email_solicitante), ''));
begin
  if coalesce(nullif(btrim(p_origem_recurso), ''), 'carona') <> 'carona' then
    raise exception 'Esta função aceita somente solicitações de Carona.';
  end if;
  if v_codigo is null then
    raise exception 'Informe o Código SIAM da secretaria.';
  end if;
  if v_email is null or length(v_email) > 254 or v_email not like '%_@_%._%' then
    raise exception 'Informe um e-mail válido para o solicitante.';
  end if;

  select *
    into v_exec
    from public.criar_solicitacao_ata_execucao(
      p_ata_item_id,
      p_unidade,
      p_qtde,
      p_valor,
      'carona',
      null,
      null,
      p_data_af,
      p_dt_entrega
    );

  update public.atas_execucao
     set codigo_siam_secretaria = v_codigo,
         email_solicitante = v_email
   where id = v_exec.exec_id;

  exec_id := v_exec.exec_id;
  emenda_item_id := v_exec.emenda_item_id;
  saldo_item_id := v_exec.saldo_item_id;
  parcial := v_exec.parcial;
  return next;
end;
$function$;

revoke all on function public.criar_solicitacao_ata_execucao_carona(
  uuid, text, numeric, numeric, text, uuid, uuid, text, text, text, text
) from public, anon;

grant execute on function public.criar_solicitacao_ata_execucao_carona(
  uuid, text, numeric, numeric, text, uuid, uuid, text, text, text, text
) to authenticated, service_role;
