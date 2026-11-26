-- Alvo exclusivo: qpvgpfwuurqcqprnpxua (contratos-dag).
-- Backup dos contratos obtido antes da aplicação, fora do repositório.
-- Só a classificação é preenchida: não reescrever execução, valores ou histórico.
alter table public.contratos add column if not exists modelo_contrato text;

update public.contratos c set modelo_contrato = case
  when c.recebimento_escopo='parcial' then 'servico_escopo_fechado'
  when c.recebimento_escopo='integral' then 'servico_pontual_pagamento_unico'
  when c.modelo_execucao='por_demanda' then 'servico_continuo_demanda'
  when c.modelo_execucao='continuo_trimestral_preventiva_corretiva' or c.periodicidade_pagamento='TRIMESTRAL' then 'servico_continuo_trimestral_fixo'
  when c.modelo_execucao='continuo_mensal_fixo' or c.periodicidade_pagamento='MENSAL' then 'servico_continuo_mensal_fixo'
  when p.tipo_servico='Serviço mensal valor fixo' then 'servico_continuo_mensal_fixo'
  when p.tipo_servico='Serviço trimestral valor fixo' then 'servico_continuo_trimestral_fixo'
  when p.tipo_servico='Serviço por demanda/execução' then 'servico_continuo_demanda'
  when p.tipo_servico='Locação de bem móvel' then 'locacao_bens_moveis'
  when p.tipo_servico='Mão de obra com dedicação exclusiva' then 'mao_obra_dedicacao_exclusiva'
  when p.tipo_servico='Credenciamento' then 'credenciamento'
  when p.natureza='LOCAÇÃO' and c.objeto ~* '(veículos|veiculos|vans|ambulâncias|ambulancias|CPAP|BIPAP|equipamentos|EPIS|VESTIMENTAS)' then 'locacao_bens_moveis'
  when p.natureza='LOCAÇÃO' and c.objeto ~* '(galpão|galpao|imóvel|imovel|LOCAÇÃO CAF|LOCAÇÃO CEREST|LOCAÇÃO CAPS)' then 'locacao_imovel'
  when c.objeto ~* '^CONSTRUÇÃO DE (UBS|UNIDADE)' then 'obra_engenharia'
  else null
end
from public.processos p
where p.id=c.processo_id and c.modelo_contrato is null and coalesce(c.tipo_instrumento,'CONTRATO')<>'ATA';

-- Contratos sem processo ainda mantêm a classificação operacional explícita.
update public.contratos set modelo_contrato=case
  when recebimento_escopo='parcial' then 'servico_escopo_fechado'
  when recebimento_escopo='integral' then 'servico_pontual_pagamento_unico'
  when modelo_execucao='por_demanda' then 'servico_continuo_demanda'
  when modelo_execucao='continuo_trimestral_preventiva_corretiva' or periodicidade_pagamento='TRIMESTRAL' then 'servico_continuo_trimestral_fixo'
  when modelo_execucao='continuo_mensal_fixo' or periodicidade_pagamento='MENSAL' then 'servico_continuo_mensal_fixo'
end
where modelo_contrato is null and coalesce(tipo_instrumento,'CONTRATO')<>'ATA'
  and (recebimento_escopo is not null or modelo_execucao is not null or periodicidade_pagamento is not null);

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.contratos'::regclass and conname='contratos_modelo_contrato_check') then
    alter table public.contratos add constraint contratos_modelo_contrato_check check (
      modelo_contrato is null or modelo_contrato in (
        'aquisicao_entrega_unica','aquisicao_entrega_parcelada',
        'servico_continuo_mensal_fixo','servico_continuo_trimestral_fixo','servico_continuo_demanda',
        'servico_pontual_pagamento_unico','obra_engenharia','locacao_bens_moveis','locacao_imovel',
        'fornecimento_com_instalacao','servico_com_materiais_pecas','mao_obra_dedicacao_exclusiva','credenciamento',
        'servico_escopo_fechado' -- compatibilidade exclusiva com escopo parcial legado
      )
    );
  end if;
end $$;

create or replace function private.preparar_classificacao_contrato()
returns trigger language plpgsql set search_path='' as $$
declare
  esperado text;
  tipo_servico text;
begin
  if tg_op='UPDATE' and new.modelo_contrato is distinct from old.modelo_contrato
     and current_user not in ('postgres','supabase_admin') and not private.is_admin_approved() then
    raise exception 'A classificação do contrato só pode ser alterada por administrador.' using errcode='42501';
  end if;
  if tg_op='UPDATE' and new.modelo_contrato is distinct from old.modelo_contrato
     and old.modelo_contrato in ('servico_continuo_mensal_fixo','servico_continuo_trimestral_fixo','servico_continuo_demanda','servico_pontual_pagamento_unico','servico_escopo_fechado') then
    raise exception 'Este contrato já possui fluxo próprio. A classificação não pode ser convertida pelo editor geral.' using errcode='23514';
  end if;
  if coalesce(new.tipo_instrumento,'CONTRATO')='ATA' then
    new.modelo_contrato:=null;
    return new;
  end if;
  select p.tipo_servico into tipo_servico from public.processos p where p.id=new.processo_id;
  esperado:=case
    when new.recebimento_escopo='parcial' then 'servico_escopo_fechado'
    when new.recebimento_escopo='integral' then 'servico_pontual_pagamento_unico'
    when new.modelo_execucao='por_demanda' then 'servico_continuo_demanda'
    when new.modelo_execucao='continuo_trimestral_preventiva_corretiva' then 'servico_continuo_trimestral_fixo'
    when new.modelo_execucao='continuo_mensal_fixo' then 'servico_continuo_mensal_fixo'
  end;
  if new.modelo_contrato is null then
    new.modelo_contrato:=coalesce(esperado,case
      when new.periodicidade_pagamento='MENSAL' then 'servico_continuo_mensal_fixo'
      when new.periodicidade_pagamento='TRIMESTRAL' then 'servico_continuo_trimestral_fixo'
    end);
  end if;
  if esperado is not null and new.modelo_contrato is distinct from esperado then
    raise exception 'A classificação deve preservar o fluxo de execução existente (%).',esperado using errcode='23514';
  end if;
  if new.modelo_contrato='servico_escopo_fechado' and new.recebimento_escopo is distinct from 'parcial' then
    raise exception 'Escopo parcial é reservado ao fluxo legado de recebimento.' using errcode='23514';
  end if;
  -- Não habilitar um fluxo especializado em um contrato apenas por mudar seu nome.
  if new.modelo_contrato in ('servico_continuo_demanda','servico_continuo_trimestral_fixo','servico_pontual_pagamento_unico')
     and esperado is null then
    raise exception 'Este modelo exige o fluxo de execução correspondente cadastrado no processo.' using errcode='23514';
  end if;
  if new.modelo_contrato='servico_continuo_mensal_fixo' and esperado is null
     and tipo_servico is distinct from 'Serviço mensal valor fixo' and new.periodicidade_pagamento is distinct from 'MENSAL' then
    raise exception 'Mensal fixo exige contrato de manutenção mensal fixa.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.preparar_classificacao_contrato() from public, anon, authenticated;
drop trigger if exists zz_preparar_classificacao_contrato on public.contratos;
create trigger zz_preparar_classificacao_contrato before insert or update on public.contratos
for each row execute function private.preparar_classificacao_contrato();

comment on column public.contratos.modelo_contrato is
  'Classificação do contrato; determina participação no controle mensal de documentos, sem flag adicional. Preserva campos e fluxos operacionais.';
notify pgrst, 'reload schema';
