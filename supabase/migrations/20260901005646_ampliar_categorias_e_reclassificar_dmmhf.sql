-- Novas categorias informadas pela área gestora. São opções oficiais, portanto
-- entram ativas e revisadas. A ordem continua depois das 25 categorias iniciais.
insert into public.categorias_licitacao (nome, ordem, ativo, revisado)
values
  ('DIETA - REDE', 26, true, true),
  ('DIETA - MJ', 27, true, true),
  ('DIETA', 28, true, true),
  ('FRALDA - REDE', 29, true, true),
  ('FRALDA - MJ', 30, true, true),
  ('FREESTYLE', 31, true, true),
  ('PROVOX', 32, true, true),
  ('I-PORT', 33, true, true),
  ('IMPRESSOS', 34, true, true),
  ('LABORATÓRIO', 35, true, true),
  ('DIVERSOS', 36, true, true)
on conflict (nome_chave) do update
set ordem = excluded.ordem,
    ativo = true,
    revisado = true,
    updated_at = now();

create temporary table reclassificacao_processos (
  processo_id bigint primary key,
  categoria_nome text not null
) on commit drop;

-- Somente vínculos sustentados expressamente pelo objeto, descrição dos itens
-- ou objeto das Atas importadas. "Diversos" não é usado como fallback.
insert into reclassificacao_processos (processo_id, categoria_nome)
values
  (250, 'LABORATÓRIO'),
  (324, 'DIETA - MJ'),
  (325, 'DIETA - MJ'),
  (327, 'DIETA - REDE'),
  (328, 'DIETA - REDE'),
  (329, 'DIETA - REDE'),
  (330, 'DIETA - REDE'),
  (331, 'DIETA - REDE'),
  (333, 'DIETA - REDE'),
  (334, 'DIETA - REDE'),
  (336, 'DIETA - REDE'),
  (373, 'DIETA - REDE'),
  (374, 'DIETA - REDE'),
  (375, 'FRALDA - MJ'),
  (376, 'DIETA - REDE'),
  (379, 'FRALDA - REDE'),
  (380, 'I-PORT'),
  (382, 'DIETA - REDE'),
  (386, 'DIETA - REDE'),
  (387, 'FRALDA - MJ'),
  (388, 'DIETA - REDE'),
  (389, 'FRALDA - MJ'),
  (392, 'DIETA - MJ'),
  (394, 'FRALDA - MJ'),
  (396, 'PROVOX'),
  (398, 'FRALDA - MJ'),
  (399, 'IMPRESSOS'),
  (401, 'IMPRESSOS'),
  (405, 'FREESTYLE');

do $prevalidacao$
begin
  if (select count(*) from reclassificacao_processos) <> 29 then
    raise exception 'A reclassificação deve conter exatamente 29 processos inequívocos';
  end if;

  if exists (
    select 1
    from reclassificacao_processos m
    left join public.processos p on p.id = m.processo_id
    where p.id is null
  ) then
    raise exception 'Há processos inexistentes no mapa de reclassificação';
  end if;

  if exists (
    select 1
    from reclassificacao_processos m
    left join public.categorias_licitacao c on c.nome = m.categoria_nome
    where c.id is null
  ) then
    raise exception 'Há categorias inexistentes no mapa de reclassificação';
  end if;
end
$prevalidacao$;

update public.processos p
set categoria_id = c.id
from reclassificacao_processos m
join public.categorias_licitacao c on c.nome = m.categoria_nome
where p.id = m.processo_id
  and p.categoria_id is distinct from c.id;

-- Estes três casos não permitem distinguir com segurança a nova categoria:
-- 332 e 335 têm conflito entre objeto "Rede" e item "MJ"; 381 é sala de
-- vacina, sem correspondência inequívoca. Só removemos a inferência anterior,
-- preservando uma futura revisão humana caso a migration seja reaplicada.
update public.processos p
set categoria_id = null
from public.categorias_licitacao anterior
where p.id in (332, 335, 381)
  and anterior.nome = 'MATERIAL HOSPITALAR'
  and p.categoria_id = anterior.id;

do $validacao$
begin
  if exists (
    select 1
    from reclassificacao_processos m
    join public.processos p on p.id = m.processo_id
    join public.categorias_licitacao c on c.id = p.categoria_id
    where c.nome <> m.categoria_nome
  ) then
    raise exception 'Há divergência no mapa de reclassificação aplicado';
  end if;

  if exists (
    select 1
    from public.itens i
    join public.processos p on p.id = i.processo_id
    where i.categoria_id is distinct from p.categoria_id
  ) then
    raise exception 'Há itens divergentes da categoria do processo';
  end if;

  if exists (
    select 1
    from public.contratos c
    join public.processos p on p.id = c.processo_id
    where c.categoria_id is distinct from p.categoria_id
  ) then
    raise exception 'Há contratos divergentes da categoria do processo';
  end if;

  if exists (
    select 1
    from public.atas_itens ai
    join public.contratos c on c.id = ai.contrato_id
    where ai.categoria_id is distinct from c.categoria_id
  ) then
    raise exception 'Há itens de ATA divergentes da categoria do contrato';
  end if;
end
$validacao$;
