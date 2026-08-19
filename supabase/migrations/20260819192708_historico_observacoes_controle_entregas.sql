-- Converte a observação sobrescrevível do Controle de Entregas em histórico permanente.

create table if not exists public.entregas_observacoes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.itens(id) on delete cascade,
  item_entrega_id uuid references public.itens_entregas(id) on delete cascade,
  ata_execucao_id uuid references public.atas_execucao(id) on delete cascade,
  secao_id bigint not null references public.secoes(id) on delete restrict,
  texto text not null,
  autor_id uuid references public.profiles(id) on delete set null,
  autor_nome text not null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_by_nome text,
  updated_at timestamptz,
  migrada boolean not null default false,
  constraint entregas_observacoes_origem_check check (
    num_nonnulls(item_id, item_entrega_id, ata_execucao_id) = 1
  ),
  constraint entregas_observacoes_texto_check check (btrim(texto) <> '')
);

create index if not exists entregas_observacoes_item_idx
  on public.entregas_observacoes(item_id, created_at);
create index if not exists entregas_observacoes_item_entrega_idx
  on public.entregas_observacoes(item_entrega_id, created_at);
create index if not exists entregas_observacoes_ata_execucao_idx
  on public.entregas_observacoes(ata_execucao_id, created_at);
create index if not exists entregas_observacoes_secao_idx
  on public.entregas_observacoes(secao_id);
create index if not exists entregas_observacoes_autor_idx
  on public.entregas_observacoes(autor_id);
create index if not exists entregas_observacoes_updated_by_idx
  on public.entregas_observacoes(updated_by);

create or replace function private.preparar_observacao_entrega()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secao_id bigint;
  v_autor_nome text;
begin
  if num_nonnulls(new.item_id, new.item_entrega_id, new.ata_execucao_id) <> 1 then
    raise exception 'Informe exatamente uma origem para a observação.';
  end if;

  if new.item_id is not null then
    select i.secao_id into v_secao_id
    from public.itens i where i.id = new.item_id;
  elsif new.item_entrega_id is not null then
    select e.secao_id into v_secao_id
    from public.itens_entregas e where e.id = new.item_entrega_id;
  else
    select a.secao_id into v_secao_id
    from public.atas_execucao a where a.id = new.ata_execucao_id;
  end if;

  if v_secao_id is null then
    raise exception 'Origem da observação não encontrada ou sem seção.';
  end if;

  new.secao_id := v_secao_id;
  new.texto := btrim(new.texto);

  if not coalesce(new.migrada, false) then
    if auth.uid() is null then
      raise exception 'Usuário não autenticado.';
    end if;
    select p.nome into v_autor_nome
    from public.profiles p
    where p.id = auth.uid() and p.aprovado is true;
    if v_autor_nome is null then
      raise exception 'Perfil aprovado não encontrado.';
    end if;
    new.autor_id := auth.uid();
    new.autor_nome := v_autor_nome;
    new.created_at := now();
    new.updated_by := null;
    new.updated_by_nome := null;
    new.updated_at := null;
  else
    new.autor_id := null;
    new.autor_nome := coalesce(nullif(btrim(new.autor_nome), ''), 'Registro anterior');
  end if;

  return new;
end;
$$;

create or replace function private.auditar_edicao_observacao_entrega()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_editor_nome text;
begin
  if not private.is_admin_approved() then
    raise exception 'Somente administradores podem editar observações já salvas.';
  end if;

  select p.nome into v_editor_nome
  from public.profiles p
  where p.id = auth.uid() and p.aprovado is true;

  new.id := old.id;
  new.item_id := old.item_id;
  new.item_entrega_id := old.item_entrega_id;
  new.ata_execucao_id := old.ata_execucao_id;
  new.secao_id := old.secao_id;
  new.autor_id := old.autor_id;
  new.autor_nome := old.autor_nome;
  new.created_at := old.created_at;
  new.migrada := old.migrada;
  new.texto := btrim(new.texto);
  new.updated_by := auth.uid();
  new.updated_by_nome := coalesce(v_editor_nome, 'Administrador');
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.preparar_observacao_entrega() from public, anon, authenticated;
revoke all on function private.auditar_edicao_observacao_entrega() from public, anon, authenticated;

drop trigger if exists trg_preparar_observacao_entrega on public.entregas_observacoes;
create trigger trg_preparar_observacao_entrega
before insert on public.entregas_observacoes
for each row execute function private.preparar_observacao_entrega();

drop trigger if exists trg_auditar_edicao_observacao_entrega on public.entregas_observacoes;
create trigger trg_auditar_edicao_observacao_entrega
before update on public.entregas_observacoes
for each row execute function private.auditar_edicao_observacao_entrega();

alter table public.entregas_observacoes enable row level security;

revoke all on table public.entregas_observacoes from public, anon, authenticated;
grant select on table public.entregas_observacoes to authenticated, service_role;
grant insert (item_id, item_entrega_id, ata_execucao_id, texto)
  on public.entregas_observacoes to authenticated;
grant update (texto) on public.entregas_observacoes to authenticated;
grant insert, update, delete on public.entregas_observacoes to service_role;

drop policy if exists "leitura observacoes entregas" on public.entregas_observacoes;
create policy "leitura observacoes entregas"
  on public.entregas_observacoes
  for select
  to authenticated
  using (private.can_access_domain(secao_id, array['atas','itens'], 'view'));

drop policy if exists "inserir observacoes entregas" on public.entregas_observacoes;
create policy "inserir observacoes entregas"
  on public.entregas_observacoes
  for insert
  to authenticated
  with check (
    autor_id = (select auth.uid())
    and migrada is false
    and private.can_access_domain(secao_id, array['atas','itens'], 'edit')
  );

drop policy if exists "admin editar observacoes entregas" on public.entregas_observacoes;
create policy "admin editar observacoes entregas"
  on public.entregas_observacoes
  for update
  to authenticated
  using (
    (select private.is_admin_approved())
    and private.can_access_domain(secao_id, array['atas','itens'], 'edit')
  )
  with check (
    (select private.is_admin_approved())
    and private.can_access_domain(secao_id, array['atas','itens'], 'edit')
  );

-- Preserva os textos atuais. A data real dessas anotações antigas não era armazenada.
insert into public.entregas_observacoes (
  item_id, texto, autor_nome, migrada
)
select i.id, btrim(i.controle_obs), 'Registro anterior', true
from public.itens i
where nullif(btrim(i.controle_obs), '') is not null
  and not exists (
    select 1 from public.entregas_observacoes o
    where o.item_id = i.id and o.migrada is true
  );

insert into public.entregas_observacoes (
  item_entrega_id, texto, autor_nome, migrada
)
select e.id, btrim(e.controle_obs), 'Registro anterior', true
from public.itens_entregas e
where nullif(btrim(e.controle_obs), '') is not null
  and not exists (
    select 1 from public.entregas_observacoes o
    where o.item_entrega_id = e.id and o.migrada is true
  );

insert into public.entregas_observacoes (
  ata_execucao_id, texto, autor_nome, migrada
)
select a.id, btrim(a.controle_obs), 'Registro anterior', true
from public.atas_execucao a
where nullif(btrim(a.controle_obs), '') is not null
  and not exists (
    select 1 from public.entregas_observacoes o
    where o.ata_execucao_id = a.id and o.migrada is true
  );

-- A nova linha do tempo não é temporária e não desaparece após o recebimento.
drop trigger if exists trg_limpar_controle_obs_ao_receber on public.itens_entregas;
drop trigger if exists trg_limpar_controle_obs_ao_receber on public.atas_execucao;
drop function if exists private.limpar_controle_obs_ao_receber();

notify pgrst, 'reload schema';
