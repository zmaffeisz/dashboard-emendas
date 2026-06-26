-- Migração: Fases 0–2 para banco local
-- Aplique no SQL Editor: http://127.0.0.1:54323
-- É seguro rodar mais de uma vez (todos os comandos são idempotentes)

-- ══════════════════════════════════════════
-- Etapa 3 — coluna natureza em processos
-- ══════════════════════════════════════════
ALTER TABLE public.processos
  ADD COLUMN IF NOT EXISTS natureza text;

-- Notifica PostgREST local para recarregar o schema
SELECT pg_notify('pgrst', 'reload schema');


-- ══════════════════════════════════════════
-- Fase 0 — tabela itens
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.itens (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id       bigint      REFERENCES public.processos(id),
  origem            text        NOT NULL DEFAULT 'aquisicao',
  fonte_tipo        text        NOT NULL,
  emenda_id         uuid        REFERENCES public.emendas(id),
  emenda_item_id    uuid        REFERENCES public.emenda_itens(id),
  fonte_descricao   text,
  grupo_item_id     uuid,
  descricao         text        NOT NULL,
  qtde              numeric     NOT NULL,
  valor_estimado    numeric,
  prazo_entrega_dias int,
  unidade_destino_id bigint     REFERENCES public.unidades(id),
  contrato_id       int         REFERENCES public.contratos(id),
  fornecedor_id     bigint      REFERENCES public.fornecedores(id),
  valor_contratado  numeric,
  ata_item_id       uuid        REFERENCES public.atas_itens(id),
  status            text        DEFAULT 'em licitação',
  observacoes       text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS itens_processo_idx      ON public.itens(processo_id);
CREATE INDEX IF NOT EXISTS itens_emenda_item_idx   ON public.itens(emenda_item_id);
CREATE INDEX IF NOT EXISTS itens_status_idx        ON public.itens(status);

ALTER TABLE public.itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitura autenticada itens" ON public.itens;
CREATE POLICY "leitura autenticada itens" ON public.itens
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "escrita itens" ON public.itens;
CREATE POLICY "escrita itens" ON public.itens
  FOR ALL USING (
    can_access_tab('itens','edit')
    OR can_access_tab('contratos','edit')
    OR can_access_tab('dashboard','edit')
  );


-- ══════════════════════════════════════════
-- Fase 0 — tabela itens_entregas
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.itens_entregas (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id               uuid        NOT NULL REFERENCES public.itens(id) ON DELETE CASCADE,
  af_numero             text,
  af_data               date,
  data_limite_entrega   date,
  nota_fiscal           text,
  nf_data               date,
  empenho               text,
  patrimonio            text,
  qtde_recebida         numeric,
  data_recebimento      date,
  recebido_por          text,
  recebimento_tipo      text,
  data_entrega_unidade  date,
  termo_arquivo         text,
  termo_responsavel     text,
  termo_cargo           text,
  confirmacao_obs       text,
  status                text,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS itens_entregas_item_idx ON public.itens_entregas(item_id);

ALTER TABLE public.itens_entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitura autenticada itens_entregas" ON public.itens_entregas;
CREATE POLICY "leitura autenticada itens_entregas" ON public.itens_entregas
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "escrita itens_entregas" ON public.itens_entregas;
CREATE POLICY "escrita itens_entregas" ON public.itens_entregas
  FOR ALL USING (
    can_access_tab('itens','edit')
    OR can_access_tab('contratos','edit')
    OR can_access_tab('dashboard','edit')
    OR can_access_tab('atas','edit')
  );


-- ══════════════════════════════════════════
-- Confirmar (deve retornar as 3 linhas)
-- ══════════════════════════════════════════
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('processos','itens','itens_entregas')
ORDER BY table_name;
