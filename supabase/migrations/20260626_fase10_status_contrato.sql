-- Fase 10 — status de contrato para o fluxo de Aquisição
-- Idempotente. status_opcoes já existe (schema base). contratos.status é texto livre.

insert into public.status_opcoes (contexto, nome, ordem, ativo)
values
  ('contrato', 'Aguardando emissão da Ordem de Entrega', 10, true),
  ('contrato', 'VIGENTE', 20, true),
  ('contrato', 'SUSPENSO', 30, true),
  ('contrato', 'ENCERRADO', 40, true)
on conflict (contexto, nome) do nothing;
