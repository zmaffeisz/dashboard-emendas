-- Classificação inicial dos processos existentes, inferida a partir do objeto e
-- da composição dos itens em 2026-09-01. A categoria é gravada somente quando
-- ainda está vazia, para que uma eventual reaplicação não reverta revisão humana.
create temporary table classificacao_categorias_processos (
  processo_id bigint primary key,
  categoria_nome text not null
) on commit drop;

insert into classificacao_categorias_processos (processo_id, categoria_nome)
values
  (29, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (36, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (41, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (50, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (104, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (118, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (125, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (153, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (168, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (174, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (222, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (241, 'INFORMÁTICA'),
  (242, 'ELETROELETRÔNICOS'),
  (244, 'EQUIPAMENTO MÉDICO-ODONTOLÓGICO'),
  (245, 'MOBILIÁRIO'),
  (247, 'EQUIPAMENTO MÉDICO-HOSPITALAR'),
  (248, 'ELETRODOMÉSTICOS'),
  (249, 'EQUIPAMENTO MÉDICO-ODONTOLÓGICO'),
  (250, 'EQUIPAMENTO MÉDICO-HOSPITALAR'),
  (251, 'TRANSPORTE'),
  (252, 'TRANSPORTE'),
  (253, 'EQUIPAMENTO MÉDICO-HOSPITALAR'),
  (254, 'MOBILIÁRIO'),
  (255, 'TRANSPORTE'),
  (256, 'TRANSPORTE'),
  (258, 'TRANSPORTE'),
  (259, 'EQUIPAMENTO MÉDICO-HOSPITALAR'),
  (260, 'MOBILIÁRIO'),
  (261, 'EQUIPAMENTO MÉDICO-HOSPITALAR'),
  (302, 'EQUIPAMENTO MÉDICO-HOSPITALAR'),
  (303, 'ELETRODOMÉSTICOS'),
  (304, 'ELETROELETRÔNICOS'),
  (305, 'EQUIPAMENTO MÉDICO-ODONTOLÓGICO'),
  (306, 'ELETRODOMÉSTICOS'),
  (307, 'ELETRODOMÉSTICOS'),
  (308, 'EQUIPAMENTO MÉDICO-HOSPITALAR'),
  (309, 'ELETRODOMÉSTICOS'),
  (310, 'TRANSPORTE'),
  (311, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (312, 'SERVIÇOS TERCEIRIZADOS'),
  (313, 'EQUIPAMENTO MÉDICO-HOSPITALAR'),
  (314, 'SERVIÇOS TERCEIRIZADOS'),
  (315, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (316, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (317, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (318, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (319, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (320, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (321, 'MANUTENÇÃO DE EQUIPAMENTOS'),
  (322, 'MOBILIÁRIO'),
  (323, 'INFORMÁTICA'),
  (324, 'MATERIAL HOSPITALAR'),
  (325, 'MATERIAL HOSPITALAR'),
  (327, 'MATERIAL HOSPITALAR'),
  (328, 'MATERIAL HOSPITALAR'),
  (329, 'MATERIAL HOSPITALAR'),
  (330, 'MATERIAL HOSPITALAR'),
  (331, 'MATERIAL HOSPITALAR'),
  (332, 'MATERIAL HOSPITALAR'),
  (333, 'MATERIAL HOSPITALAR'),
  (334, 'MATERIAL HOSPITALAR'),
  (335, 'MATERIAL HOSPITALAR'),
  (336, 'MATERIAL HOSPITALAR'),
  (337, 'MATERIAL ODONTOLÓGICO'),
  (338, 'MATERIAL ODONTOLÓGICO'),
  (339, 'MATERIAL ODONTOLÓGICO'),
  (373, 'MATERIAL HOSPITALAR'),
  (374, 'MATERIAL HOSPITALAR'),
  (375, 'MATERIAL HOSPITALAR'),
  (376, 'MATERIAL HOSPITALAR'),
  (377, 'MATERIAL ODONTOLÓGICO'),
  (378, 'MATERIAL DE EXPEDIENTE'),
  (379, 'MATERIAL HOSPITALAR'),
  (380, 'MATERIAL HOSPITALAR'),
  (381, 'MATERIAL HOSPITALAR'),
  (382, 'MATERIAL HOSPITALAR'),
  (383, 'MATERIAL DE EXPEDIENTE'),
  (384, 'MATERIAL ODONTOLÓGICO'),
  (385, 'GASES MEDICINAIS'),
  (386, 'MATERIAL HOSPITALAR'),
  (387, 'MATERIAL HOSPITALAR'),
  (388, 'MATERIAL HOSPITALAR'),
  (389, 'MATERIAL HOSPITALAR'),
  (390, 'MATERIAL ODONTOLÓGICO'),
  (391, 'MATERIAL ODONTOLÓGICO'),
  (392, 'MATERIAL HOSPITALAR'),
  (393, 'GASES MEDICINAIS'),
  (394, 'MATERIAL HOSPITALAR'),
  (395, 'MATERIAL ODONTOLÓGICO'),
  (396, 'MATERIAL HOSPITALAR'),
  (397, 'LIMPEZA E HIGIENE'),
  (398, 'MATERIAL HOSPITALAR'),
  (399, 'MATERIAL DE EXPEDIENTE'),
  (400, 'LIMPEZA E HIGIENE'),
  (401, 'MATERIAL DE EXPEDIENTE'),
  (402, 'MATERIAL ODONTOLÓGICO'),
  (403, 'LIMPEZA E HIGIENE'),
  (404, 'MATERIAL ODONTOLÓGICO'),
  (405, 'MATERIAL HOSPITALAR');

do $classificacao$
begin
  if (select count(*) from classificacao_categorias_processos) <> 99 then
    raise exception 'A classificação inicial deve conter exatamente 99 processos';
  end if;

  if exists (
    select 1
    from classificacao_categorias_processos m
    left join public.processos p on p.id = m.processo_id
    where p.id is null
  ) then
    raise exception 'Há processos inexistentes no mapa de classificação';
  end if;

  if exists (
    select 1
    from classificacao_categorias_processos m
    left join public.categorias_licitacao c on c.nome = m.categoria_nome
    where c.id is null
  ) then
    raise exception 'Há categorias inexistentes no mapa de classificação';
  end if;
end
$classificacao$;

update public.processos p
set categoria_id = c.id
from classificacao_categorias_processos m
join public.categorias_licitacao c on c.nome = m.categoria_nome
where p.id = m.processo_id
  and p.categoria_id is null;

do $validacao$
begin
  if exists (
    select 1
    from classificacao_categorias_processos m
    join public.processos p on p.id = m.processo_id
    where p.categoria_id is null
  ) then
    raise exception 'Persistiram processos sem categoria após a classificação';
  end if;

  if exists (
    select 1
    from public.itens i
    join classificacao_categorias_processos m on m.processo_id = i.processo_id
    where i.categoria_id is null
  ) then
    raise exception 'Persistiram itens sem categoria após a propagação';
  end if;

  if exists (
    select 1
    from public.contratos c
    join classificacao_categorias_processos m on m.processo_id = c.processo_id
    where c.categoria_id is null
  ) then
    raise exception 'Persistiram contratos sem categoria após a propagação';
  end if;

  if exists (
    select 1
    from public.atas_itens ai
    join public.contratos c on c.id = ai.contrato_id
    join classificacao_categorias_processos m on m.processo_id = c.processo_id
    where ai.categoria_id is null
  ) then
    raise exception 'Persistiram itens de ata sem categoria após a propagação';
  end if;
end
$validacao$;
