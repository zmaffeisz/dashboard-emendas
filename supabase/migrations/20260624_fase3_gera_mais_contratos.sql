-- Migração: Fase 3 — seletor de processo no contrato + flag "gera mais contratos"
-- Aplique no SQL Editor: http://127.0.0.1:54323
-- É seguro rodar mais de uma vez (idempotente)

-- ══════════════════════════════════════════
-- Coluna flag em processos
-- ══════════════════════════════════════════
ALTER TABLE public.processos
  ADD COLUMN IF NOT EXISTS gera_mais_contratos boolean NOT NULL DEFAULT false;

-- ══════════════════════════════════════════
-- Expor natureza + gera_mais_contratos na view de resumo.
-- Mantém as 13 colunas existentes na mesma ordem e acrescenta as
-- duas novas no FIM, para CREATE OR REPLACE não reclamar de renomear coluna.
-- ══════════════════════════════════════════
CREATE OR REPLACE VIEW public.vw_processos_resumo AS
 SELECT id,
    identificador,
    tipo,
    objeto,
    modalidade,
    status,
    secao,
    valor_estimado,
    observacao,
    created_at,
    ( SELECT count(*) AS count
           FROM contratos c
          WHERE c.processo_id = p.id) AS n_contratos,
    ( SELECT count(*) AS count
           FROM emenda_itens i
          WHERE i.processo_id = p.id) AS n_itens,
    ( SELECT count(DISTINCT i.emenda_id) AS count
           FROM emenda_itens i
          WHERE i.processo_id = p.id) AS n_emendas,
    natureza,
    gera_mais_contratos
   FROM processos p;

-- Notifica PostgREST local para recarregar o schema
SELECT pg_notify('pgrst', 'reload schema');
