-- Preserva o prazo original e cada alteração posterior do Controle de Entregas.

create table if not exists public.entregas_prazos_historico (
  id uuid primary key default gen_random_uuid(),
  item_entrega_id uuid references public.itens_entregas(id) on delete cascade,
  ata_execucao_id uuid references public.atas_execucao(id) on delete cascade,
  prazo_anterior date not null,
  prazo_novo date not null,
  observacao text,
  alterado_por uuid references auth.users(id) on delete set null default auth.uid(),
  alterado_em timestamptz,
  created_at timestamptz not null default now(),
  constraint entregas_prazos_historico_origem_check check (
    (item_entrega_id is not null and ata_execucao_id is null)
    or (item_entrega_id is null and ata_execucao_id is not null)
  ),
  constraint entregas_prazos_historico_datas_check check (prazo_anterior <> prazo_novo)
);

create index if not exists entregas_prazos_historico_item_idx
  on public.entregas_prazos_historico(item_entrega_id, created_at);
create index if not exists entregas_prazos_historico_ata_idx
  on public.entregas_prazos_historico(ata_execucao_id, created_at);
create index if not exists entregas_prazos_historico_alterado_por_idx
  on public.entregas_prazos_historico(alterado_por);

alter table public.entregas_prazos_historico enable row level security;

revoke all on table public.entregas_prazos_historico from public, anon;
grant select on table public.entregas_prazos_historico to authenticated, service_role;

drop policy if exists "leitura historico prazos entrega" on public.entregas_prazos_historico;
create policy "leitura historico prazos entrega"
  on public.entregas_prazos_historico
  for select
  to authenticated
  using (
    public.can_access_tab('itens', 'view')
    or public.can_access_tab('atas', 'view')
  );

create or replace function private.registrar_historico_prazo_entrega()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prazo_anterior date;
  v_prazo_novo date;
  v_observacao text := nullif(current_setting('app.prazo_entrega_observacao', true), '');
begin
  if tg_table_name = 'itens_entregas' then
    v_prazo_anterior := old.data_limite_entrega;
    v_prazo_novo := new.data_limite_entrega;
  elsif tg_table_name = 'atas_execucao' then
    if old.prev_entrega ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      v_prazo_anterior := old.prev_entrega::date;
    end if;
    if new.prev_entrega ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      v_prazo_novo := new.prev_entrega::date;
    end if;
  end if;

  if v_prazo_anterior is null or v_prazo_novo is null or v_prazo_anterior = v_prazo_novo then
    return new;
  end if;

  insert into public.entregas_prazos_historico (
    item_entrega_id,
    ata_execucao_id,
    prazo_anterior,
    prazo_novo,
    observacao,
    alterado_por,
    alterado_em
  ) values (
    case when tg_table_name = 'itens_entregas' then new.id end,
    case when tg_table_name = 'atas_execucao' then new.id end,
    v_prazo_anterior,
    v_prazo_novo,
    v_observacao,
    auth.uid(),
    now()
  );

  return new;
end;
$$;

revoke all on function private.registrar_historico_prazo_entrega() from public;

drop trigger if exists trg_historico_prazo_itens_entregas on public.itens_entregas;
create trigger trg_historico_prazo_itens_entregas
after update of data_limite_entrega on public.itens_entregas
for each row execute function private.registrar_historico_prazo_entrega();

drop trigger if exists trg_historico_prazo_atas_execucao on public.atas_execucao;
create trigger trg_historico_prazo_atas_execucao
after update of prev_entrega on public.atas_execucao
for each row execute function private.registrar_historico_prazo_entrega();

create or replace function public.prorrogar_prazo_entrega(
  p_item_entrega_id uuid default null,
  p_ata_execucao_id uuid default null,
  p_novo_prazo date default null,
  p_observacao text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if p_novo_prazo is null then
    raise exception 'Informe o novo prazo.';
  end if;
  if (p_item_entrega_id is null) = (p_ata_execucao_id is null) then
    raise exception 'Informe exatamente uma origem para o prazo.';
  end if;

  perform set_config('app.prazo_entrega_observacao', left(trim(coalesce(p_observacao, '')), 1000), true);

  if p_item_entrega_id is not null then
    if not public.can_access_tab('itens', 'edit') then
      raise exception 'Sem permissão para alterar o prazo desta entrega.';
    end if;
    update public.itens_entregas
       set data_limite_entrega = p_novo_prazo
     where id = p_item_entrega_id
       and data_limite_entrega is distinct from p_novo_prazo;
  else
    if not (public.can_access_tab('itens', 'edit') or public.can_access_tab('atas', 'edit')) then
      raise exception 'Sem permissão para alterar o prazo desta execução de ATA.';
    end if;
    update public.atas_execucao
       set prev_entrega = p_novo_prazo::text,
           obs_prazo = case
             when nullif(trim(coalesce(p_observacao, '')), '') is not null
               then 'Prorrogado: ' || trim(p_observacao)
             else obs_prazo
           end
     where id = p_ata_execucao_id
       and prev_entrega is distinct from p_novo_prazo::text;
  end if;

  return found;
end;
$$;

revoke all on function public.prorrogar_prazo_entrega(uuid, uuid, date, text) from public, anon;
grant execute on function public.prorrogar_prazo_entrega(uuid, uuid, date, text) to authenticated, service_role;

-- Recupera alterações anteriores quando o prazo original ainda pode ser calculado.
insert into public.entregas_prazos_historico (
  item_entrega_id, prazo_anterior, prazo_novo, observacao
)
select
  ie.id,
  ie.af_data + i.prazo_entrega_dias,
  ie.data_limite_entrega,
  'Alteração anterior recuperada a partir da data da AF e do prazo cadastrado no item.'
from public.itens_entregas ie
join public.itens i on i.id = ie.item_id
where ie.af_data is not null
  and ie.data_limite_entrega is not null
  and i.prazo_entrega_dias is not null
  and ie.data_limite_entrega <> ie.af_data + i.prazo_entrega_dias
  and not exists (
    select 1 from public.entregas_prazos_historico h where h.item_entrega_id = ie.id
  );

insert into public.entregas_prazos_historico (
  ata_execucao_id, prazo_anterior, prazo_novo, observacao
)
select
  ae.id,
  ae.data_af::date + ai.prazo_entrega,
  ae.prev_entrega::date,
  nullif(trim(regexp_replace(ae.obs_prazo, '^Prorrogado:[[:space:]]*', '', 'i')), '')
from public.atas_execucao ae
join public.atas_itens ai on ai.id = ae.ata_item_id
where ae.data_af ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  and ae.prev_entrega ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  and ai.prazo_entrega is not null
  and ae.prev_entrega::date <> ae.data_af::date + ai.prazo_entrega
  and ae.obs_prazo ilike 'Prorrogado:%'
  and not exists (
    select 1 from public.entregas_prazos_historico h where h.ata_execucao_id = ae.id
  );

notify pgrst, 'reload schema';
