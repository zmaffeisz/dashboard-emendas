begin;

alter table public.atas_execucao
  add column if not exists marca_modelo text;

comment on column public.atas_execucao.marca_modelo is
  'Fotografia da marca/modelo válida para a solicitação. Apostilamentos só alteram execuções ainda não recebidas.';

update public.atas_execucao ae
   set marca_modelo = ai.marca_modelo
  from public.atas_itens ai
 where ai.id = ae.ata_item_id
   and nullif(btrim(ae.marca_modelo), '') is null;

create table if not exists public.atas_item_marca_apostilamentos (
  id uuid primary key default gen_random_uuid(),
  ata_item_id uuid not null references public.atas_itens(id) on delete restrict,
  contrato_id integer not null references public.contratos(id) on delete restrict,
  marca_modelo_anterior text,
  marca_modelo_nova text not null,
  apostilamento text not null,
  data_apostilamento date not null,
  observacoes text,
  execucoes_atualizadas integer not null default 0 check (execucoes_atualizadas >= 0),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  secao_id bigint references public.secoes(id)
);

comment on table public.atas_item_marca_apostilamentos is
  'Histórico auditável das trocas de marca/modelo de itens de ATA por apostilamento.';

create index if not exists atas_item_marca_apostilamentos_item_idx
  on public.atas_item_marca_apostilamentos (ata_item_id, data_apostilamento desc, criado_em desc);

create index if not exists atas_item_marca_apostilamentos_contrato_idx
  on public.atas_item_marca_apostilamentos (contrato_id, data_apostilamento desc);

alter table public.atas_item_marca_apostilamentos enable row level security;

drop policy if exists scoped_select on public.atas_item_marca_apostilamentos;
create policy scoped_select on public.atas_item_marca_apostilamentos
  for select to authenticated
  using (private.can_access_domain(secao_id, array['atas']::text[], 'view'));

drop policy if exists scoped_insert on public.atas_item_marca_apostilamentos;
create policy scoped_insert on public.atas_item_marca_apostilamentos
  for insert to authenticated
  with check (private.can_access_domain(secao_id, array['atas']::text[], 'edit'));

grant select, insert on public.atas_item_marca_apostilamentos to authenticated;

create or replace function public.preencher_marca_modelo_execucao_ata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if nullif(btrim(new.marca_modelo), '') is null then
    select ai.marca_modelo
      into new.marca_modelo
      from public.atas_itens ai
     where ai.id = new.ata_item_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_preencher_marca_modelo_execucao_ata on public.atas_execucao;
create trigger trg_preencher_marca_modelo_execucao_ata
before insert on public.atas_execucao
for each row execute function public.preencher_marca_modelo_execucao_ata();

create or replace function public.registrar_troca_marca_item_ata(
  p_ata_item_id uuid,
  p_marca_modelo_nova text,
  p_apostilamento text,
  p_data_apostilamento date,
  p_observacoes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_item public.atas_itens%rowtype;
  v_nova text;
  v_apostilamento text;
  v_atualizadas integer := 0;
  v_secao_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_nova := nullif(btrim(p_marca_modelo_nova), '');
  v_apostilamento := nullif(btrim(p_apostilamento), '');
  if v_nova is null then
    raise exception 'Informe a nova marca/modelo.';
  end if;
  if v_apostilamento is null then
    raise exception 'Informe a referência do apostilamento.';
  end if;
  if p_data_apostilamento is null then
    raise exception 'Informe a data do apostilamento.';
  end if;

  select *
    into v_item
    from public.atas_itens
   where id = p_ata_item_id
   for update;
  if not found then
    raise exception 'Item da ATA não encontrado ou sem permissão de acesso.';
  end if;

  v_secao_id := coalesce(v_item.secao_id, (
    select c.secao_id from public.contratos c where c.id = v_item.contrato_id
  ));
  if not private.can_access_domain(v_secao_id, array['atas']::text[], 'edit') then
    raise exception 'Você não tem permissão para trocar a marca deste item.';
  end if;
  if upper(coalesce(btrim(v_item.marca_modelo), '')) = upper(v_nova) then
    raise exception 'A nova marca/modelo é igual à marca/modelo vigente.';
  end if;

  -- Garante uma fotografia da marca anterior inclusive para o legado antes de
  -- modificar a fonte atual do item.
  update public.atas_execucao ae
     set marca_modelo = v_item.marca_modelo
   where ae.ata_item_id = v_item.id
     and nullif(btrim(ae.marca_modelo), '') is null;

  update public.atas_itens
     set marca_modelo = v_nova
   where id = v_item.id;

  -- AF emitida não bloqueia a troca. Somente o recebimento administrativo,
  -- representado pela data ou por uma unidade física recebida, congela a marca.
  update public.atas_execucao ae
     set marca_modelo = v_nova
   where ae.ata_item_id = v_item.id
     and nullif(btrim(ae.dt_entrega), '') is null
     and not exists (
       select 1
         from public.atas_execucao_unidades u
        where u.exec_id = ae.id
          and u.recebido_em is not null
     );
  get diagnostics v_atualizadas = row_count;

  insert into public.atas_item_marca_apostilamentos (
    ata_item_id, contrato_id, marca_modelo_anterior, marca_modelo_nova,
    apostilamento, data_apostilamento, observacoes,
    execucoes_atualizadas, criado_por, secao_id
  ) values (
    v_item.id, v_item.contrato_id, nullif(btrim(v_item.marca_modelo), ''), v_nova,
    v_apostilamento, p_data_apostilamento, nullif(btrim(p_observacoes), ''),
    v_atualizadas, auth.uid(), v_secao_id
  );

  return jsonb_build_object(
    'ata_item_id', v_item.id,
    'marca_modelo_anterior', v_item.marca_modelo,
    'marca_modelo_nova', v_nova,
    'execucoes_atualizadas', v_atualizadas
  );
end;
$function$;

revoke all on function public.preencher_marca_modelo_execucao_ata() from public;
revoke all on function public.registrar_troca_marca_item_ata(uuid,text,text,date,text) from public;
grant execute on function public.registrar_troca_marca_item_ata(uuid,text,text,date,text) to authenticated;

commit;
