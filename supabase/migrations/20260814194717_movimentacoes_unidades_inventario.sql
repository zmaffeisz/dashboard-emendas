-- Gestao da vida de cada unidade fisica no Inventario Geral.
-- A unidade cadastrada na Emenda permanece historica; a localizacao atual vive aqui.

begin;

create table if not exists public.inventario_unidades (
  id uuid primary key default gen_random_uuid(),
  origem_tipo text not null check (origem_tipo in ('AQUISICAO', 'ATA')),
  unidade_fisica_id uuid not null,
  secao_id bigint references public.secoes(id),
  unidade_origem_id bigint references public.unidades(id),
  unidade_origem_nome text,
  unidade_atual_id bigint references public.unidades(id),
  unidade_atual_nome text,
  situacao_atual text not null default 'ATIVO'
    check (situacao_atual in ('ATIVO', 'EMPRESTADO', 'BAIXADO')),
  responsavel_atual text,
  emprestado_para text,
  previsao_devolucao date,
  ultima_movimentacao_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (origem_tipo, unidade_fisica_id)
);

create table if not exists public.inventario_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  inventario_unidade_id uuid not null references public.inventario_unidades(id),
  secao_id bigint references public.secoes(id),
  tipo text not null check (tipo in ('TRANSFERENCIA', 'EMPRESTIMO', 'DEVOLUCAO', 'BAIXA')),
  data_movimentacao date not null,
  unidade_origem_id bigint references public.unidades(id),
  unidade_origem_nome text,
  unidade_destino_id bigint references public.unidades(id),
  unidade_destino_nome text,
  destinatario text,
  previsao_devolucao date,
  responsavel_entrega text,
  responsavel_recebimento text,
  motivo text,
  observacao text,
  documento_path text not null,
  documento_nome text not null,
  documento_mime text,
  criado_por uuid not null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_inventario_unidades_secao
  on public.inventario_unidades(secao_id);
create index if not exists idx_inventario_unidades_atual
  on public.inventario_unidades(unidade_atual_id, situacao_atual);
create index if not exists idx_inventario_movimentacoes_unidade_data
  on public.inventario_movimentacoes(inventario_unidade_id, data_movimentacao desc, criado_em desc);
create index if not exists idx_inventario_movimentacoes_secao
  on public.inventario_movimentacoes(secao_id);

comment on table public.inventario_unidades is
  'Estado atual de cada unidade fisica. Nao altera a unidade historica cadastrada na Emenda.';
comment on table public.inventario_movimentacoes is
  'Historico imutavel de transferencias, emprestimos, devolucoes e baixas do Inventario Geral.';

alter table public.inventario_unidades enable row level security;
alter table public.inventario_movimentacoes enable row level security;

revoke all on table public.inventario_unidades from anon;
revoke all on table public.inventario_movimentacoes from anon;
grant select, insert, update on table public.inventario_unidades to authenticated;
grant select, insert on table public.inventario_movimentacoes to authenticated;

drop policy if exists "inventario_unidades_select" on public.inventario_unidades;
create policy "inventario_unidades_select"
on public.inventario_unidades for select to authenticated
using (private.can_access_domain(secao_id, array['inventario-ac','dashboard'], 'view'));

drop policy if exists "inventario_unidades_insert" on public.inventario_unidades;
create policy "inventario_unidades_insert"
on public.inventario_unidades for insert to authenticated
with check (private.can_access_domain(secao_id, array['inventario-ac','itens','atas'], 'edit'));

drop policy if exists "inventario_unidades_update" on public.inventario_unidades;
create policy "inventario_unidades_update"
on public.inventario_unidades for update to authenticated
using (private.can_access_domain(secao_id, array['inventario-ac','itens','atas'], 'edit'))
with check (private.can_access_domain(secao_id, array['inventario-ac','itens','atas'], 'edit'));

drop policy if exists "inventario_movimentacoes_select" on public.inventario_movimentacoes;
create policy "inventario_movimentacoes_select"
on public.inventario_movimentacoes for select to authenticated
using (private.can_access_domain(secao_id, array['inventario-ac','dashboard'], 'view'));

drop policy if exists "inventario_movimentacoes_insert" on public.inventario_movimentacoes;
create policy "inventario_movimentacoes_insert"
on public.inventario_movimentacoes for insert to authenticated
with check (private.can_access_domain(secao_id, array['inventario-ac'], 'edit'));

-- Estado inicial das unidades ja existentes. A unidade de origem e uma fotografia e
-- nao sera regravada por futuras movimentacoes.
insert into public.inventario_unidades (
  origem_tipo, unidade_fisica_id, secao_id,
  unidade_origem_id, unidade_origem_nome,
  unidade_atual_id, unidade_atual_nome
)
select
  'AQUISICAO', iu.id, iu.secao_id,
  coalesce(iu.unidade_id, i.unidade_destino_id), coalesce(iu.unidade_nome, u.nome),
  coalesce(iu.unidade_id, i.unidade_destino_id), coalesce(iu.unidade_nome, u.nome)
from public.itens_entregas_unidades iu
left join public.itens i on i.id = iu.item_id
left join public.unidades u on u.id = coalesce(iu.unidade_id, i.unidade_destino_id)
on conflict (origem_tipo, unidade_fisica_id) do nothing;

insert into public.inventario_unidades (
  origem_tipo, unidade_fisica_id, secao_id,
  unidade_origem_id, unidade_origem_nome,
  unidade_atual_id, unidade_atual_nome
)
select
  'ATA', au.id, au.secao_id,
  un.id, nullif(btrim(ae.unidade), ''),
  un.id, nullif(btrim(ae.unidade), '')
from public.atas_execucao_unidades au
join public.atas_execucao ae on ae.id = au.exec_id
left join lateral (
  select u.id
  from public.unidades u
  where lower(btrim(u.nome)) = lower(btrim(ae.unidade))
  order by (u.ativo is true) desc, u.id
  limit 1
) un on true
on conflict (origem_tipo, unidade_fisica_id) do nothing;

create or replace function public._proteger_historico_inventario()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if current_setting('app.inventario_movimentacao_autorizada', true) is distinct from '1' then
    raise exception 'O estado do inventario so pode ser alterado por uma movimentacao registrada.';
  end if;
  if tg_table_name = 'inventario_movimentacoes' and tg_op = 'INSERT'
     and not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'inventario-movimentacoes' and o.name = new.documento_path
     ) then
    raise exception 'O documento da movimentacao nao foi encontrado no armazenamento.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_proteger_inventario_unidades on public.inventario_unidades;
create trigger trg_proteger_inventario_unidades
before insert or update or delete on public.inventario_unidades
for each row execute function public._proteger_historico_inventario();

drop trigger if exists trg_proteger_inventario_movimentacoes on public.inventario_movimentacoes;
create trigger trg_proteger_inventario_movimentacoes
before insert or update or delete on public.inventario_movimentacoes
for each row execute function public._proteger_historico_inventario();

create or replace function public._sincronizar_inventario_unidade_aquisicao()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_unidade_id bigint;
  v_unidade_nome text;
begin
  select coalesce(new.unidade_id, i.unidade_destino_id), coalesce(new.unidade_nome, u.nome)
    into v_unidade_id, v_unidade_nome
  from public.itens i
  left join public.unidades u on u.id = coalesce(new.unidade_id, i.unidade_destino_id)
  where i.id = new.item_id;

  insert into public.inventario_unidades (
    origem_tipo, unidade_fisica_id, secao_id,
    unidade_origem_id, unidade_origem_nome, unidade_atual_id, unidade_atual_nome
  ) values (
    'AQUISICAO', new.id, new.secao_id,
    v_unidade_id, v_unidade_nome, v_unidade_id, v_unidade_nome
  )
  on conflict (origem_tipo, unidade_fisica_id) do update set
    secao_id = excluded.secao_id,
    unidade_origem_id = coalesce(inventario_unidades.unidade_origem_id, excluded.unidade_origem_id),
    unidade_origem_nome = coalesce(inventario_unidades.unidade_origem_nome, excluded.unidade_origem_nome),
    unidade_atual_id = case when inventario_unidades.ultima_movimentacao_em is null then excluded.unidade_atual_id else inventario_unidades.unidade_atual_id end,
    unidade_atual_nome = case when inventario_unidades.ultima_movimentacao_em is null then excluded.unidade_atual_nome else inventario_unidades.unidade_atual_nome end,
    atualizado_em = now();
  return null;
end;
$$;

drop trigger if exists trg_sincronizar_inventario_unidade_aquisicao
  on public.itens_entregas_unidades;
create trigger trg_sincronizar_inventario_unidade_aquisicao
after insert or update of unidade_id, unidade_nome, secao_id
on public.itens_entregas_unidades
for each row execute function public._sincronizar_inventario_unidade_aquisicao();

create or replace function public._sincronizar_inventario_unidade_ata()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_unidade_id bigint;
  v_unidade_nome text;
begin
  select u.id, nullif(btrim(ae.unidade), '')
    into v_unidade_id, v_unidade_nome
  from public.atas_execucao ae
  left join lateral (
    select ux.id
    from public.unidades ux
    where lower(btrim(ux.nome)) = lower(btrim(ae.unidade))
    order by (ux.ativo is true) desc, ux.id
    limit 1
  ) u on true
  where ae.id = new.exec_id;

  insert into public.inventario_unidades (
    origem_tipo, unidade_fisica_id, secao_id,
    unidade_origem_id, unidade_origem_nome, unidade_atual_id, unidade_atual_nome
  ) values (
    'ATA', new.id, new.secao_id,
    v_unidade_id, v_unidade_nome, v_unidade_id, v_unidade_nome
  )
  on conflict (origem_tipo, unidade_fisica_id) do update set
    secao_id = excluded.secao_id,
    unidade_origem_id = coalesce(inventario_unidades.unidade_origem_id, excluded.unidade_origem_id),
    unidade_origem_nome = coalesce(inventario_unidades.unidade_origem_nome, excluded.unidade_origem_nome),
    unidade_atual_id = case when inventario_unidades.ultima_movimentacao_em is null then excluded.unidade_atual_id else inventario_unidades.unidade_atual_id end,
    unidade_atual_nome = case when inventario_unidades.ultima_movimentacao_em is null then excluded.unidade_atual_nome else inventario_unidades.unidade_atual_nome end,
    atualizado_em = now();
  return null;
end;
$$;

drop trigger if exists trg_sincronizar_inventario_unidade_ata
  on public.atas_execucao_unidades;
create trigger trg_sincronizar_inventario_unidade_ata
after insert or update of exec_id, secao_id
on public.atas_execucao_unidades
for each row execute function public._sincronizar_inventario_unidade_ata();

create or replace function public.registrar_movimentacao_inventario(
  p_inventario_unidade_id uuid,
  p_tipo text,
  p_data_movimentacao date,
  p_documento_path text,
  p_documento_nome text,
  p_documento_mime text default null,
  p_unidade_destino_id bigint default null,
  p_destinatario text default null,
  p_previsao_devolucao date default null,
  p_responsavel_entrega text default null,
  p_responsavel_recebimento text default null,
  p_motivo text default null,
  p_observacao text default null
)
returns public.inventario_movimentacoes
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_estado public.inventario_unidades%rowtype;
  v_mov public.inventario_movimentacoes%rowtype;
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_destino_id bigint := p_unidade_destino_id;
  v_destino_nome text;
begin
  if auth.uid() is null then
    raise exception 'Sessao expirada. Entre novamente.';
  end if;
  if nullif(btrim(coalesce(p_documento_path, '')), '') is null
     or nullif(btrim(coalesce(p_documento_nome, '')), '') is null then
    raise exception 'Anexe o termo ou documento da movimentacao.';
  end if;
  if p_data_movimentacao is null or p_data_movimentacao > current_date then
    raise exception 'Informe uma data valida, que nao esteja no futuro.';
  end if;

  select * into v_estado
  from public.inventario_unidades
  where id = p_inventario_unidade_id
  for update;
  if not found then raise exception 'Item fisico nao encontrado no inventario.'; end if;
  if not private.can_access_domain(v_estado.secao_id, array['inventario-ac'], 'edit') then
    raise exception 'Sem permissao para movimentar este item.';
  end if;
  if v_tipo not in ('TRANSFERENCIA','EMPRESTIMO','DEVOLUCAO','BAIXA') then
    raise exception 'Tipo de movimentacao invalido.';
  end if;
  if v_estado.situacao_atual = 'BAIXADO' then
    raise exception 'O item ja foi baixado e nao pode receber nova movimentacao.';
  end if;

  if v_destino_id is not null then
    select nome into v_destino_nome from public.unidades
    where id = v_destino_id and ativo is distinct from false;
    if not found then raise exception 'Unidade de destino invalida ou inativa.'; end if;
  end if;

  if v_tipo = 'TRANSFERENCIA' then
    if v_estado.situacao_atual <> 'ATIVO' then
      raise exception 'Registre a devolucao antes de transferir um item emprestado.';
    end if;
    if v_destino_id is null then raise exception 'Informe a unidade de destino.'; end if;
    if v_destino_id is not distinct from v_estado.unidade_atual_id then
      raise exception 'A unidade de destino deve ser diferente da localizacao atual.';
    end if;
    if nullif(btrim(coalesce(p_responsavel_entrega, '')), '') is null
       or nullif(btrim(coalesce(p_responsavel_recebimento, '')), '') is null then
      raise exception 'Informe quem entrega e quem recebe o item.';
    end if;
  elsif v_tipo = 'EMPRESTIMO' then
    if v_estado.situacao_atual <> 'ATIVO' then raise exception 'O item ja esta emprestado.'; end if;
    if nullif(btrim(coalesce(p_destinatario, '')), '') is null then
      raise exception 'Informe para quem ou para qual setor o item sera emprestado.';
    end if;
    if p_previsao_devolucao is not null and p_previsao_devolucao < p_data_movimentacao then
      raise exception 'A previsao de devolucao nao pode ser anterior ao emprestimo.';
    end if;
    if nullif(btrim(coalesce(p_responsavel_entrega, '')), '') is null then
      raise exception 'Informe o responsavel pela entrega.';
    end if;
  elsif v_tipo = 'DEVOLUCAO' then
    if v_estado.situacao_atual <> 'EMPRESTADO' then
      raise exception 'Somente um item emprestado pode ser devolvido.';
    end if;
    if v_destino_id is null then
      select m.unidade_origem_id, m.unidade_origem_nome
        into v_destino_id, v_destino_nome
      from public.inventario_movimentacoes m
      where m.inventario_unidade_id = v_estado.id and m.tipo = 'EMPRESTIMO'
      order by m.data_movimentacao desc, m.criado_em desc
      limit 1;
    end if;
    if nullif(btrim(coalesce(p_responsavel_recebimento, '')), '') is null then
      raise exception 'Informe quem recebeu a devolucao.';
    end if;
  elsif v_tipo = 'BAIXA' then
    if v_estado.situacao_atual <> 'ATIVO' then
      raise exception 'Registre a devolucao antes de dar baixa em um item emprestado.';
    end if;
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
      raise exception 'Informe o motivo da baixa.';
    end if;
  end if;

  perform set_config('app.inventario_movimentacao_autorizada', '1', true);

  insert into public.inventario_movimentacoes (
    inventario_unidade_id, secao_id, tipo, data_movimentacao,
    unidade_origem_id, unidade_origem_nome, unidade_destino_id, unidade_destino_nome,
    destinatario, previsao_devolucao, responsavel_entrega, responsavel_recebimento,
    motivo, observacao, documento_path, documento_nome, documento_mime, criado_por
  ) values (
    v_estado.id, v_estado.secao_id, v_tipo, p_data_movimentacao,
    v_estado.unidade_atual_id, v_estado.unidade_atual_nome, v_destino_id, v_destino_nome,
    nullif(btrim(coalesce(p_destinatario, '')), ''), p_previsao_devolucao,
    nullif(btrim(coalesce(p_responsavel_entrega, '')), ''),
    nullif(btrim(coalesce(p_responsavel_recebimento, '')), ''),
    nullif(btrim(coalesce(p_motivo, '')), ''), nullif(btrim(coalesce(p_observacao, '')), ''),
    btrim(p_documento_path), btrim(p_documento_nome), nullif(btrim(coalesce(p_documento_mime, '')), ''), auth.uid()
  ) returning * into v_mov;

  update public.inventario_unidades set
    unidade_atual_id = case when v_tipo in ('TRANSFERENCIA','EMPRESTIMO','DEVOLUCAO') and v_destino_id is not null then v_destino_id else unidade_atual_id end,
    unidade_atual_nome = case when v_tipo in ('TRANSFERENCIA','EMPRESTIMO','DEVOLUCAO') and v_destino_nome is not null then v_destino_nome else unidade_atual_nome end,
    situacao_atual = case when v_tipo = 'EMPRESTIMO' then 'EMPRESTADO' when v_tipo = 'BAIXA' then 'BAIXADO' else 'ATIVO' end,
    responsavel_atual = case
      when v_tipo in ('TRANSFERENCIA','DEVOLUCAO') then nullif(btrim(coalesce(p_responsavel_recebimento, '')), '')
      when v_tipo = 'EMPRESTIMO' then coalesce(nullif(btrim(coalesce(p_responsavel_recebimento, '')), ''), nullif(btrim(coalesce(p_destinatario, '')), ''))
      else responsavel_atual end,
    emprestado_para = case when v_tipo = 'EMPRESTIMO' then nullif(btrim(coalesce(p_destinatario, '')), '') else null end,
    previsao_devolucao = case when v_tipo = 'EMPRESTIMO' then p_previsao_devolucao else null end,
    ultima_movimentacao_em = now(),
    atualizado_em = now()
  where id = v_estado.id;

  return v_mov;
end;
$$;

revoke all on function public.registrar_movimentacao_inventario(
  uuid, text, date, text, text, text, bigint, text, date, text, text, text, text
) from public, anon;
grant execute on function public.registrar_movimentacao_inventario(
  uuid, text, date, text, text, text, bigint, text, date, text, text, text, text
) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventario-movimentacoes', 'inventario-movimentacoes', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "leitura inventario-movimentacoes autorizada" on storage.objects;
create policy "leitura inventario-movimentacoes autorizada"
on storage.objects for select to authenticated
using (
  bucket_id = 'inventario-movimentacoes'
  and (public.can_access_tab('inventario-ac','view') or public.can_access_tab('dashboard','view'))
);

drop policy if exists "upload inventario-movimentacoes autorizado" on storage.objects;
create policy "upload inventario-movimentacoes autorizado"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'inventario-movimentacoes'
  and public.can_access_tab('inventario-ac','edit')
);

drop policy if exists "remove inventario-movimentacoes autorizado" on storage.objects;
create policy "remove inventario-movimentacoes autorizado"
on storage.objects for delete to authenticated
using (
  bucket_id = 'inventario-movimentacoes'
  and public.can_access_tab('inventario-ac','edit')
);

notify pgrst, 'reload schema';

commit;
