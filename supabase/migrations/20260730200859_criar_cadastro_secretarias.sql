-- Cadastro-mestre de secretarias municipais.
-- Os registros iniciais representam a lista institucional solicitada e podem ser
-- administrados somente por usuários autorizados na aba Cadastros.

create table if not exists public.secretarias (
  id bigint generated always as identity primary key,
  sigla text not null unique,
  nome text not null,
  ativo boolean not null default true,
  revisado boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.secretarias enable row level security;

grant select, insert, update, delete on table public.secretarias to authenticated;
grant usage, select on sequence public.secretarias_id_seq to authenticated;

drop policy if exists read_secretarias on public.secretarias;
create policy read_secretarias on public.secretarias
  for select to authenticated using (true);

drop policy if exists insert_secretarias on public.secretarias;
create policy insert_secretarias on public.secretarias
  for insert to authenticated
  with check (private.is_admin_approved() or can_access_tab('cadastros', 'edit'));

drop policy if exists update_secretarias on public.secretarias;
create policy update_secretarias on public.secretarias
  for update to authenticated
  using (private.is_admin_approved() or can_access_tab('cadastros', 'edit'))
  with check (private.is_admin_approved() or can_access_tab('cadastros', 'edit'));

drop policy if exists delete_secretarias on public.secretarias;
create policy delete_secretarias on public.secretarias
  for delete to authenticated
  using (private.is_admin_approved() or can_access_tab('cadastros', 'edit'));

insert into public.secretarias (sigla, nome) values
  ('SEAD', 'Administração'),
  ('AUDI', 'Auditoria'),
  ('SECID', 'Cidadania'),
  ('SECOM', 'Comunicação'),
  ('CGM', 'Controladoria'),
  ('COR', 'Corregedoria'),
  ('CGTI', 'Tecnologia da Informação'),
  ('SECULT', 'Cultura'),
  ('SEDE', 'Desenvolvimento Econômico'),
  ('SEDU', 'Educação'),
  ('SEMEPP', 'Empreendedorismo'),
  ('SEQUAV', 'Esportes'),
  ('SEFAZ', 'Fazenda'),
  ('FSS', 'Fundo Social'),
  ('SGC', 'Gabinete Central'),
  ('SEGOV', 'Governo'),
  ('SEHAB', 'Habitação'),
  ('SINTEA', 'Inclusão e Autismo'),
  ('SEJ', 'Jurídico'),
  ('SEMA', 'Meio Ambiente'),
  ('SEMOB', 'Mobilidade'),
  ('SEMUL', 'Mulher'),
  ('OGM', 'Ouvidoria'),
  ('SEPAR', 'Parcerias'),
  ('SEPLAN', 'Planejamento Urbano'),
  ('SERH', 'Recursos Humanos'),
  ('SERIM', 'Relações Institucionais'),
  ('SERT', 'Trabalho e Qualificação'),
  ('SETUR', 'Turismo'),
  ('SES', 'Saúde'),
  ('SESU', 'Segurança Urbana'),
  ('SERPO', 'Serviços e Obras')
on conflict (sigla) do nothing;

notify pgrst, 'reload schema';
