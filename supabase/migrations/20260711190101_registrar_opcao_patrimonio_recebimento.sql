alter table public.itens_entregas
  add column if not exists possui_patrimonio boolean;

alter table public.atas_execucao
  add column if not exists possui_patrimonio boolean;

comment on column public.itens_entregas.possui_patrimonio is
  'Escolha obrigatoria no recebimento: true individualiza unidades fisicas; false mantem a quantidade consolidada.';

comment on column public.atas_execucao.possui_patrimonio is
  'Escolha obrigatoria no recebimento: true individualiza unidades fisicas; false mantem a quantidade consolidada.';

update public.itens_entregas ie
set possui_patrimonio = case
  when nullif(btrim(ie.patrimonio), '') is not null
    or nullif(btrim(ie.numero_serie), '') is not null
    or exists (
      select 1 from public.itens_entregas_unidades ieu
      where ieu.entrega_id = ie.id
        and (nullif(btrim(ieu.patrimonio), '') is not null or nullif(btrim(ieu.numero_serie), '') is not null)
    ) then true
  else false
end
where ie.possui_patrimonio is null
  and (coalesce(ie.qtde_recebida, 0) > 0 or ie.data_recebimento is not null);

update public.atas_execucao ae
set possui_patrimonio = case
  when exists (
    select 1 from public.atas_execucao_unidades aeu
    where aeu.exec_id = ae.id
      and (nullif(btrim(aeu.patrimonio), '') is not null or nullif(btrim(aeu.numero_serie), '') is not null)
  ) then true
  else false
end
where ae.possui_patrimonio is null
  and nullif(btrim(ae.dt_entrega), '') is not null;
