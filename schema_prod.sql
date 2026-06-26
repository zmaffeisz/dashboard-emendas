


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_unidade_key"("p" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN base IN ('VARIAS','CERRADO,FIORE,HARO,LARANJEIRAS, SIMUS','CARANDA / SAD / LARANJEIRAS',
                  'RODRIGO/ LOPES','SAD/ZOONOSES','UBS''S - COMPUTADORES P/ ACS',
                  'LARANJEIRAS - COMPUTADORES','LARANJEIRAS - TOTEM','ZOONOSES - COMPUTADORES',
                  'SAO CONRADO - MODULADOS') THEN NULL
    WHEN base = 'FIORI' THEN 'FIORE'
    WHEN base = 'LOPES DE OLIVIERA' THEN 'LOPES DE OLIVEIRA'
    WHEN base = 'SOROCABA 1' THEN 'SOROCABA I'
    WHEN base = 'VISA' THEN 'VIGILANCIA SANITARIA'
    WHEN base IN ('LARANJEIRAS PA','LARANJEIRAS P.A','PA LARANJEIRAS') THEN 'PA LARANJEIRAS'
    ELSE base
  END
  FROM (
    SELECT nullif(upper(btrim(regexp_replace(
             translate(coalesce(p,''),
               'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
               'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
             '\s+',' ','g'))),'') AS base
  ) x
$$;


ALTER FUNCTION "public"."_unidade_key"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."abrir_chamado_publico"("p_carimbo" "text", "p_data_solicitacao" "text", "p_unidade" "text", "p_equipamento" "text", "p_fabricante" "text", "p_serie" "text", "p_patrimonio" "text", "p_categoria" "text", "p_servico" "text", "p_problema" "text", "p_descricao" "text", "p_endereco" "text", "p_telefone" "text", "p_responsavel" "text", "p_grau_urgencia" "text", "p_email_retorno" "text", "p_rechamado" "text" DEFAULT NULL::"text", "p_data_rechamado" "text" DEFAULT NULL::"text", "p_observacao" "text" DEFAULT NULL::"text", "p_protocolo" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_num    bigint;
  v_mm     text;
  v_yyyy   text;
  v_proto  text;
BEGIN
  v_num  := nextval('chamados_seq');
  v_mm   := to_char(now(), 'MM');
  v_yyyy := to_char(now(), 'YYYY');
  v_proto := 'SES-' || lpad(v_num::text, 4, '0') || '/' || v_mm || v_yyyy;

  INSERT INTO chamados (
    protocolo, carimbo, data_solicitacao, unidade,
    equipamento, fabricante, serie, patrimonio,
    categoria, servico, problema, descricao,
    endereco, telefone, responsavel, grau_urgencia,
    email_retorno, rechamado, data_rechamado, observacao
  ) VALUES (
    v_proto, p_carimbo, p_data_solicitacao, p_unidade,
    p_equipamento, p_fabricante, p_serie, p_patrimonio,
    p_categoria, p_servico, p_problema, p_descricao,
    p_endereco, p_telefone, p_responsavel, p_grau_urgencia,
    p_email_retorno, p_rechamado, p_data_rechamado, p_observacao
  );

  INSERT INTO chamados_controle (protocolo, status)
  VALUES (v_proto, 'Aguardando abertura')
  ON CONFLICT (protocolo) DO NOTHING;

  RETURN v_proto;
END;
$$;


ALTER FUNCTION "public"."abrir_chamado_publico"("p_carimbo" "text", "p_data_solicitacao" "text", "p_unidade" "text", "p_equipamento" "text", "p_fabricante" "text", "p_serie" "text", "p_patrimonio" "text", "p_categoria" "text", "p_servico" "text", "p_problema" "text", "p_descricao" "text", "p_endereco" "text", "p_telefone" "text", "p_responsavel" "text", "p_grau_urgencia" "text", "p_email_retorno" "text", "p_rechamado" "text", "p_data_rechamado" "text", "p_observacao" "text", "p_protocolo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_tab"("p_tab" "text", "p_action" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_is_admin boolean;
  v_perm     record;
BEGIN
  SELECT (papel = 'admin') INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS TRUE THEN RETURN true; END IF;

  SELECT * INTO v_perm FROM user_tab_permissions
   WHERE user_id = auth.uid() AND tab_key = p_tab;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_action = 'view' THEN RETURN v_perm.can_view = true; END IF;
  IF p_action = 'edit' THEN RETURN v_perm.can_view = true AND v_perm.can_edit = true; END IF;
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."can_access_tab"("p_tab" "text", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fill_chamado_id_by_protocolo"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.chamado_id IS NULL AND NEW.protocolo IS NOT NULL THEN
    SELECT id INTO NEW.chamado_id FROM chamados WHERE protocolo = NEW.protocolo;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fill_chamado_id_by_protocolo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."atas_execucao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cpl" "text",
    "sim" "text",
    "item" "text",
    "unidade" "text",
    "qtde" numeric,
    "valor" numeric,
    "empenho" "text",
    "data_af" "text",
    "prev_entrega" "text",
    "dt_entrega" "text",
    "nf" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "ata_item_id" "uuid" NOT NULL,
    "obs_prazo" "text"
);


ALTER TABLE "public"."atas_execucao" OWNER TO "postgres";


COMMENT ON COLUMN "public"."atas_execucao"."ata_item_id" IS 'Item de ATA ao qual a solicitacao ou execucao pertence.';



CREATE TABLE IF NOT EXISTS "public"."atas_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cpl" "text",
    "sim" "text",
    "item" "text",
    "marca_modelo" "text",
    "qtde_contratada" numeric,
    "valor_unit" numeric,
    "vencimento" "text",
    "status_contrato" "text" DEFAULT 'VIGENTE'::"text",
    "empresa" "text",
    "prazo_entrega" integer,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "contrato_id" integer NOT NULL
);


ALTER TABLE "public"."atas_itens" OWNER TO "postgres";


COMMENT ON COLUMN "public"."atas_itens"."contrato_id" IS 'Contrato principal do tipo ATA; empresa, numero, status e vigencia vem de contratos.';



CREATE TABLE IF NOT EXISTS "public"."chamados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "protocolo" "text",
    "carimbo" "text",
    "data_solicitacao" "text",
    "unidade" "text",
    "equipamento" "text",
    "fabricante" "text",
    "serie" "text",
    "patrimonio" "text",
    "categoria" "text",
    "servico" "text",
    "problema" "text",
    "descricao" "text",
    "rechamado" "text",
    "observacao" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "data_rechamado" "text",
    "endereco" "text",
    "telefone" "text",
    "responsavel" "text",
    "grau_urgencia" "text",
    "email_retorno" "text",
    "status" "text" DEFAULT 'sem_status'::"text",
    "cpl_contrato" "text",
    "contrato_id" integer,
    "os_numero" "text",
    "servico_realizado" "text",
    "situacao_os" "text",
    "ocorrencias" "text",
    "glosa" numeric(10,2),
    "nf_referencia" "text",
    "competencia" "text",
    "fiscalizado_por" "text",
    "fiscalizado_em" "date",
    "unidade_id" bigint
);


ALTER TABLE "public"."chamados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chamados_anexos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chamado_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "nome_original" "text",
    "tamanho_bytes" integer,
    "mime_type" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "apagado_em" timestamp with time zone
);


ALTER TABLE "public"."chamados_anexos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chamados_backup_21jun" (
    "id" "uuid",
    "protocolo" "text",
    "carimbo" "text",
    "data_solicitacao" "text",
    "unidade" "text",
    "equipamento" "text",
    "fabricante" "text",
    "serie" "text",
    "patrimonio" "text",
    "categoria" "text",
    "servico" "text",
    "problema" "text",
    "descricao" "text",
    "rechamado" "text",
    "observacao" "text",
    "created_at" timestamp without time zone,
    "data_rechamado" "text",
    "endereco" "text",
    "telefone" "text",
    "responsavel" "text",
    "grau_urgencia" "text",
    "email_retorno" "text",
    "status" "text",
    "cpl_contrato" "text",
    "contrato_id" integer,
    "os_numero" "text",
    "servico_realizado" "text",
    "situacao_os" "text",
    "ocorrencias" "text",
    "glosa" numeric(10,2),
    "nf_referencia" "text",
    "competencia" "text",
    "fiscalizado_por" "text",
    "fiscalizado_em" "date",
    "termo_id" "uuid"
);


ALTER TABLE "public"."chamados_backup_21jun" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chamados_controle" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "protocolo" "text",
    "status" "text" DEFAULT 'Aberto'::"text",
    "data_atendimento" "text",
    "empresa" "text",
    "os" "text",
    "feito" "text",
    "obs" "text",
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "chamado_protocolo" "text",
    "motivo_invalido" "text",
    "cpl_contrato" "text",
    "contrato_id" integer,
    "servico_realizado" "text",
    "situacao_os" "text",
    "ocorrencias" "text",
    "glosa" numeric(10,2),
    "nf_referencia" "text",
    "competencia" "text",
    "fiscalizado_por" "text",
    "fiscalizado_em" "date",
    "data_atendimento_os" "date",
    "chamado_id" "uuid"
);


ALTER TABLE "public"."chamados_controle" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chamados_controle_backup_21jun" (
    "id" "uuid",
    "protocolo" "text",
    "status" "text",
    "data_atendimento" "text",
    "empresa" "text",
    "os" "text",
    "feito" "text",
    "obs" "text",
    "updated_at" timestamp without time zone,
    "chamado_protocolo" "text",
    "motivo_invalido" "text",
    "cpl_contrato" "text",
    "contrato_id" integer,
    "servico_realizado" "text",
    "situacao_os" "text",
    "ocorrencias" "text",
    "glosa" numeric(10,2),
    "nf_referencia" "text",
    "competencia" "text",
    "fiscalizado_por" "text",
    "fiscalizado_em" "date",
    "termo_id" "uuid",
    "data_atendimento_os" "date"
);


ALTER TABLE "public"."chamados_controle_backup_21jun" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."chamados_seq"
    START WITH 19
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."chamados_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contratos" (
    "id" integer NOT NULL,
    "secao" "text",
    "prestador" "text",
    "cpl" "text",
    "objeto" "text",
    "numero_contrato" "text",
    "cnpj" "text",
    "data_inicio" "date",
    "data_assinatura" "date",
    "vigencia_atual" "text",
    "vencimento" "text",
    "status" "text" DEFAULT 'VIGENTE'::"text",
    "fonte" "text",
    "valor_inicial" "text",
    "valor_atual" "text",
    "valor_mensal" "text",
    "aditivo" "text",
    "reajuste" "text",
    "fiscalizacao" "text",
    "obs" "text",
    "supressao" "text",
    "contato" "text",
    "empenhos" "text",
    "data_atualizacao" "text",
    "total_periodos_vigencia" integer DEFAULT 1,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "email_empresa" "text",
    "prefixo_chamado" "text",
    "fornecedor_id" bigint,
    "tipo_instrumento" "text" DEFAULT 'CONTRATO'::"text" NOT NULL,
    "processo_id" bigint,
    CONSTRAINT "contratos_tipo_instrumento_check" CHECK (("tipo_instrumento" = ANY (ARRAY['CONTRATO'::"text", 'ATA'::"text"])))
);


ALTER TABLE "public"."contratos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."contratos"."tipo_instrumento" IS 'Define se o registro principal e um CONTRATO comum ou uma ATA.';



CREATE TABLE IF NOT EXISTS "public"."contratos_backup_21jun" (
    "id" integer,
    "secao" "text",
    "prestador" "text",
    "cpl" "text",
    "objeto" "text",
    "numero_contrato" "text",
    "cnpj" "text",
    "data_inicio" "date",
    "data_assinatura" "date",
    "vigencia_atual" "text",
    "vencimento" "text",
    "status" "text",
    "fonte" "text",
    "valor_inicial" "text",
    "valor_atual" "text",
    "valor_mensal" "text",
    "aditivo" "text",
    "reajuste" "text",
    "fiscalizacao" "text",
    "obs" "text",
    "supressao" "text",
    "contato" "text",
    "empenhos" "text",
    "data_atualizacao" "text",
    "total_periodos_vigencia" integer,
    "created_at" timestamp without time zone,
    "email_empresa" "text",
    "prefixo_chamado" "text"
);


ALTER TABLE "public"."contratos_backup_21jun" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contratos_fiscalizadores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contrato_id" integer,
    "cpl" "text",
    "nome" "text",
    "data_inicio" "date",
    "data_fim" "date",
    "ativo" boolean DEFAULT true,
    "obs" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "cargo" "text"
);


ALTER TABLE "public"."contratos_fiscalizadores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contratos_fiscalizadores_backup_21jun" (
    "id" "uuid",
    "contrato_id" integer,
    "cpl" "text",
    "nome" "text",
    "data_inicio" "date",
    "data_fim" "date",
    "ativo" boolean,
    "obs" "text",
    "created_at" timestamp without time zone,
    "cargo" "text"
);


ALTER TABLE "public"."contratos_fiscalizadores_backup_21jun" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contratos_historico" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contrato_id" integer,
    "cpl" "text",
    "tipo" "text",
    "data_evento" "date",
    "percentual" "text",
    "valor_novo" "text",
    "valor_mensal_novo" "text",
    "vigencia_nova_inicio" "date",
    "vigencia_nova_fim" "date",
    "obs" "text",
    "fiscalizacao_nova" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "usuario" "text"
);


ALTER TABLE "public"."contratos_historico" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contratos_historico_backup_21jun" (
    "id" "uuid",
    "contrato_id" integer,
    "cpl" "text",
    "tipo" "text",
    "data_evento" "date",
    "percentual" "text",
    "valor_novo" "text",
    "valor_mensal_novo" "text",
    "vigencia_nova_inicio" "date",
    "vigencia_nova_fim" "date",
    "obs" "text",
    "fiscalizacao_nova" "text",
    "created_at" timestamp without time zone,
    "usuario" "text"
);


ALTER TABLE "public"."contratos_historico_backup_21jun" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contratos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."contratos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contratos_id_seq" OWNED BY "public"."contratos"."id";



CREATE TABLE IF NOT EXISTS "public"."contratos_vigencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contrato_id" integer,
    "cpl" "text",
    "numero" integer,
    "data_inicio" "date",
    "data_fim" "date",
    "texto_original" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "valor_total" numeric,
    "valor_mensal" numeric,
    "obs" "text"
);


ALTER TABLE "public"."contratos_vigencias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contratos_vigencias_backup_21jun" (
    "id" "uuid",
    "contrato_id" integer,
    "cpl" "text",
    "numero" integer,
    "data_inicio" "date",
    "data_fim" "date",
    "texto_original" "text",
    "created_at" timestamp without time zone
);


ALTER TABLE "public"."contratos_vigencias_backup_21jun" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emenda_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "emenda_id" "uuid",
    "emenda" "text",
    "item" "text",
    "qtde" numeric,
    "vl_unitario" numeric,
    "vl_total" numeric,
    "cpl" "text",
    "status" "text",
    "nota_fiscal" "text",
    "empenho" "text",
    "patrimonio" "text",
    "unidade_entrega" "text",
    "data_entrega" "text",
    "ordem_pagamento" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "unidade_beneficiada" "text",
    "item_cadastrado" "text",
    "qtde_cadastrada" numeric,
    "vl_unitario_cadastrado" numeric,
    "vl_total_cadastrado" numeric,
    "data_atualizacao" "text",
    "comprovante_pagamento" "text",
    "unidade_beneficiada_id" bigint,
    "unidade_entrega_id" bigint,
    "processo_id" bigint
);


ALTER TABLE "public"."emenda_itens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emenda_itens_backup_21jun" (
    "id" "uuid",
    "emenda_id" "uuid",
    "emenda" "text",
    "item" "text",
    "qtde" numeric,
    "vl_unitario" numeric,
    "vl_total" numeric,
    "cpl" "text",
    "status" "text",
    "nota_fiscal" "text",
    "empenho" "text",
    "patrimonio" "text",
    "unidade_entrega" "text",
    "data_entrega" "text",
    "ordem_pagamento" "text",
    "created_at" timestamp without time zone,
    "unidade_beneficiada" "text",
    "item_cadastrado" "text",
    "qtde_cadastrada" numeric,
    "vl_unitario_cadastrado" numeric,
    "vl_total_cadastrado" numeric,
    "data_atualizacao" "text",
    "comprovante_pagamento" "text"
);


ALTER TABLE "public"."emenda_itens_backup_21jun" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emendas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text",
    "emenda" "text",
    "parlamentar" "text",
    "sei_emenda" "text",
    "valor_cedido" numeric,
    "unidade" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "ano" integer,
    "unidade_id" bigint
);


ALTER TABLE "public"."emendas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emendas_backup_21jun" (
    "id" "uuid",
    "tipo" "text",
    "emenda" "text",
    "parlamentar" "text",
    "sei_emenda" "text",
    "valor_cedido" numeric,
    "unidade" "text",
    "created_at" timestamp without time zone,
    "ano" integer
);


ALTER TABLE "public"."emendas_backup_21jun" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fiscalizacao_historico" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "protocolo" "text" NOT NULL,
    "situacao_anterior" "text",
    "situacao_nova" "text" NOT NULL,
    "data_alteracao" "date" DEFAULT CURRENT_DATE NOT NULL,
    "alterado_por" "text",
    "observacao" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "chamado_id" "uuid"
);


ALTER TABLE "public"."fiscalizacao_historico" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fornecedor_contatos" (
    "id" bigint NOT NULL,
    "fornecedor_id" bigint,
    "nome" "text",
    "email" "text",
    "telefone" "text",
    "principal" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fornecedor_contatos" OWNER TO "postgres";


ALTER TABLE "public"."fornecedor_contatos" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."fornecedor_contatos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."fornecedores" (
    "id" bigint NOT NULL,
    "cnpj_normalizado" "text",
    "razao_social" "text",
    "nome_fantasia" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fornecedores" OWNER TO "postgres";


ALTER TABLE "public"."fornecedores" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."fornecedores_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."inventario_ac" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "num" "text",
    "situacao" "text",
    "estabelecimento" "text",
    "endereco" "text",
    "sala" "text",
    "patrimonio" "text",
    "ano_fab" "text",
    "marca" "text",
    "modelo" "text",
    "serie" "text",
    "btu" "text",
    "quente_frio" "text",
    "tipo" "text",
    "contrato" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "unidade_id" bigint,
    "emenda_item_id" "uuid"
);


ALTER TABLE "public"."inventario_ac" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventario_ac_backup_21jun" (
    "id" "uuid",
    "num" "text",
    "situacao" "text",
    "estabelecimento" "text",
    "endereco" "text",
    "sala" "text",
    "patrimonio" "text",
    "ano_fab" "text",
    "marca" "text",
    "modelo" "text",
    "serie" "text",
    "btu" "text",
    "quente_frio" "text",
    "tipo" "text",
    "contrato" "text",
    "created_at" timestamp without time zone
);


ALTER TABLE "public"."inventario_ac_backup_21jun" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "processo_id" bigint,
    "origem" "text" DEFAULT 'aquisicao'::"text" NOT NULL,
    "fonte_tipo" "text" NOT NULL,
    "emenda_id" "uuid",
    "emenda_item_id" "uuid",
    "fonte_descricao" "text",
    "grupo_item_id" "uuid",
    "descricao" "text" NOT NULL,
    "qtde" numeric NOT NULL,
    "valor_estimado" numeric,
    "prazo_entrega_dias" integer,
    "unidade_destino_id" bigint,
    "contrato_id" integer,
    "fornecedor_id" bigint,
    "valor_contratado" numeric,
    "ata_item_id" "uuid",
    "status" "text" DEFAULT 'em licitação'::"text",
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "itens_fonte_tipo_check" CHECK (("fonte_tipo" = ANY (ARRAY['emenda'::"text", 'sem_emenda'::"text", 'recurso_proprio'::"text", 'municipal'::"text", 'outra'::"text"]))),
    CONSTRAINT "itens_origem_check" CHECK (("origem" = ANY (ARRAY['aquisicao'::"text", 'ata'::"text"])))
);


ALTER TABLE "public"."itens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."itens_entregas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "af_numero" "text",
    "af_data" "date",
    "data_limite_entrega" "date",
    "nota_fiscal" "text",
    "nf_data" "date",
    "empenho" "text",
    "patrimonio" "text",
    "qtde_recebida" numeric,
    "data_recebimento" "date",
    "recebido_por" "text",
    "recebimento_tipo" "text",
    "data_entrega_unidade" "date",
    "termo_arquivo" "text",
    "termo_responsavel" "text",
    "termo_cargo" "text",
    "confirmacao_obs" "text",
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "itens_entregas_recebimento_tipo_check" CHECK (("recebimento_tipo" = ANY (ARRAY['parcial'::"text", 'total'::"text"])))
);


ALTER TABLE "public"."itens_entregas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parlamentares" (
    "id" bigint NOT NULL,
    "nome" "text" NOT NULL,
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."parlamentares" OWNER TO "postgres";


ALTER TABLE "public"."parlamentares" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."parlamentares_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."pessoas" (
    "id" bigint NOT NULL,
    "nome" "text" NOT NULL,
    "cargo" "text",
    "orgao" "text",
    "email" "text",
    "telefone" "text",
    "ativo" boolean DEFAULT true,
    "usuario_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pessoas" OWNER TO "postgres";


ALTER TABLE "public"."pessoas" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."pessoas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."processos" (
    "id" bigint NOT NULL,
    "identificador" "text" NOT NULL,
    "tipo" "text",
    "objeto" "text",
    "modalidade" "text",
    "status" "text",
    "secao" "text",
    "valor_estimado" numeric,
    "observacao" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "natureza" "text",
    "gera_mais_contratos" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."processos" OWNER TO "postgres";


ALTER TABLE "public"."processos" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."processos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nome" "text",
    "email" "text",
    "papel" "text" DEFAULT 'visualizador'::"text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles_backup_21jun" (
    "id" "uuid",
    "nome" "text",
    "email" "text",
    "papel" "text",
    "created_at" timestamp without time zone
);


ALTER TABLE "public"."profiles_backup_21jun" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sancao_itens" (
    "id" bigint NOT NULL,
    "sancao_id" "uuid" NOT NULL,
    "emenda_item_id" "uuid",
    "ref_origem" "text",
    "descricao" "text",
    "cpl" "text",
    "sim" "text",
    "unidade" "text",
    "qtde" numeric,
    "vl_unitario" numeric,
    "vl_total" numeric,
    "empenho" "text",
    "data_af" "text",
    "prev_entrega" "text",
    "dt_entrega" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sancao_itens" OWNER TO "postgres";


ALTER TABLE "public"."sancao_itens" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sancao_itens_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sancoes_administrativas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "processo" "text",
    "empresa" "text" NOT NULL,
    "contrato" "text",
    "tipo" "text" NOT NULL,
    "status" "text" DEFAULT 'Em análise'::"text" NOT NULL,
    "valor_multa" numeric(14,2),
    "data_ocorrencia" "date",
    "prazo_defesa" "date",
    "observacoes" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "contrato_id" integer,
    CONSTRAINT "sancoes_status_valido" CHECK (("status" = ANY (ARRAY['Em análise'::"text", 'Notificada'::"text", 'Em defesa'::"text", 'Aplicada'::"text", 'Encerrada'::"text", 'Cancelada'::"text"]))),
    CONSTRAINT "sancoes_tipo_valido" CHECK (("tipo" = ANY (ARRAY['Advertência'::"text", 'Multa'::"text", 'Suspensão'::"text", 'Impedimento de licitar'::"text", 'Declaração de inidoneidade'::"text"]))),
    CONSTRAINT "sancoes_valor_multa_nao_negativo" CHECK ((("valor_multa" IS NULL) OR ("valor_multa" >= (0)::numeric)))
);


ALTER TABLE "public"."sancoes_administrativas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sancoes_solicitadas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cpl_contrato" "text",
    "contrato_id" integer,
    "empresa" "text",
    "tipo_sancao" "text",
    "motivo" "text",
    "motivo_livre" "text",
    "clausula_contratual" "text",
    "percentual_multa" numeric(5,2),
    "dias_atraso" integer,
    "itens_ids" "text",
    "itens_json" "text",
    "solicitado_por" "text",
    "gerado_em" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."sancoes_solicitadas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sancoes_solicitadas_backup" (
    "id" "uuid",
    "cpl_contrato" "text",
    "contrato_id" integer,
    "empresa" "text",
    "tipo_sancao" "text",
    "motivo" "text",
    "motivo_livre" "text",
    "clausula_contratual" "text",
    "percentual_multa" numeric(5,2),
    "dias_atraso" integer,
    "itens_ids" "text",
    "itens_json" "text",
    "solicitado_por" "text",
    "gerado_em" "date",
    "created_at" timestamp without time zone
);


ALTER TABLE "public"."sancoes_solicitadas_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sancoes_solicitadas_backup_21jun" (
    "id" "uuid",
    "cpl_contrato" "text",
    "contrato_id" integer,
    "empresa" "text",
    "tipo_sancao" "text",
    "motivo" "text",
    "motivo_livre" "text",
    "clausula_contratual" "text",
    "percentual_multa" numeric(5,2),
    "dias_atraso" integer,
    "itens_ids" "text",
    "itens_json" "text",
    "solicitado_por" "text",
    "gerado_em" "date",
    "created_at" timestamp without time zone
);


ALTER TABLE "public"."sancoes_solicitadas_backup_21jun" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."secoes" (
    "id" bigint NOT NULL,
    "sigla" "text" NOT NULL,
    "nome" "text",
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."secoes" OWNER TO "postgres";


ALTER TABLE "public"."secoes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."secoes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."status_opcoes" (
    "id" bigint NOT NULL,
    "contexto" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "ordem" integer,
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."status_opcoes" OWNER TO "postgres";


ALTER TABLE "public"."status_opcoes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."status_opcoes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."termo_chamados" (
    "id" bigint NOT NULL,
    "termo_id" "uuid" NOT NULL,
    "chamado_id" "uuid" NOT NULL
);


ALTER TABLE "public"."termo_chamados" OWNER TO "postgres";


ALTER TABLE "public"."termo_chamados" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."termo_chamados_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."termo_contratos" (
    "id" bigint NOT NULL,
    "termo_id" "uuid" NOT NULL,
    "contrato_id" integer NOT NULL
);


ALTER TABLE "public"."termo_contratos" OWNER TO "postgres";


ALTER TABLE "public"."termo_contratos" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."termo_contratos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."termos_ateste" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero_termo" "text",
    "cpl_contrato" "text",
    "contrato_id" integer,
    "competencia" "text",
    "nf_referencia" "text",
    "fiscalizado_por" "text",
    "gerado_em" "date" DEFAULT CURRENT_DATE,
    "obs_termo" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."termos_ateste" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."termos_ateste_backup" (
    "id" "uuid",
    "numero_termo" "text",
    "cpl_contrato" "text",
    "contrato_id" integer,
    "competencia" "text",
    "nf_referencia" "text",
    "fiscalizado_por" "text",
    "gerado_em" "date",
    "obs_termo" "text",
    "created_at" timestamp without time zone
);


ALTER TABLE "public"."termos_ateste_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."termos_ateste_backup_21jun" (
    "id" "uuid",
    "numero_termo" "text",
    "cpl_contrato" "text",
    "contrato_id" integer,
    "competencia" "text",
    "nf_referencia" "text",
    "fiscalizado_por" "text",
    "gerado_em" "date",
    "obs_termo" "text",
    "created_at" timestamp without time zone
);


ALTER TABLE "public"."termos_ateste_backup_21jun" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unidades" (
    "id" bigint NOT NULL,
    "nome" "text",
    "nome_chave" "text",
    "endereco" "text",
    "telefone" "text",
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."unidades" OWNER TO "postgres";


ALTER TABLE "public"."unidades" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."unidades_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_tab_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tab_key" "text" NOT NULL,
    "can_view" boolean DEFAULT true,
    "can_edit" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_tab_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_tab_permissions_backup_21jun" (
    "id" "uuid",
    "user_id" "uuid",
    "tab_key" "text",
    "can_view" boolean,
    "can_edit" boolean,
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."user_tab_permissions_backup_21jun" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_emendas_saldo" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"text" AS "numero_emenda",
    NULL::integer AS "ano",
    NULL::"text" AS "tipo",
    NULL::"text" AS "parlamentar",
    NULL::"text" AS "sei_emenda",
    NULL::"text" AS "unidade",
    NULL::numeric AS "valor_cedido",
    NULL::numeric AS "total_planejado",
    NULL::numeric AS "total_executado",
    NULL::numeric AS "total_comprometido",
    NULL::numeric AS "saldo_remanescente",
    NULL::"text" AS "status_execucao",
    NULL::bigint AS "qtd_itens";


ALTER VIEW "public"."vw_emendas_saldo" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_processos_resumo" AS
 SELECT "id",
    "identificador",
    "tipo",
    "natureza",
    "objeto",
    "modalidade",
    "status",
    "secao",
    "valor_estimado",
    "observacao",
    "created_at",
    ( SELECT "count"(*) AS "count"
           FROM "public"."contratos" "c"
          WHERE ("c"."processo_id" = "p"."id")) AS "n_contratos",
    ( SELECT "count"(*) AS "count"
           FROM "public"."emenda_itens" "i"
          WHERE ("i"."processo_id" = "p"."id")) AS "n_itens",
    ( SELECT "count"(DISTINCT "i"."emenda_id") AS "count"
           FROM "public"."emenda_itens" "i"
          WHERE ("i"."processo_id" = "p"."id")) AS "n_emendas",
    "gera_mais_contratos"
   FROM "public"."processos" "p";


ALTER VIEW "public"."vw_processos_resumo" OWNER TO "postgres";


ALTER TABLE ONLY "public"."contratos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contratos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."atas_execucao"
    ADD CONSTRAINT "atas_execucao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atas_itens"
    ADD CONSTRAINT "atas_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chamados_anexos"
    ADD CONSTRAINT "chamados_anexos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chamados_controle"
    ADD CONSTRAINT "chamados_controle_chamado_id_key" UNIQUE ("chamado_id");



ALTER TABLE ONLY "public"."chamados_controle"
    ADD CONSTRAINT "chamados_controle_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chamados_controle"
    ADD CONSTRAINT "chamados_controle_protocolo_key" UNIQUE ("protocolo");



ALTER TABLE ONLY "public"."chamados"
    ADD CONSTRAINT "chamados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chamados"
    ADD CONSTRAINT "chamados_protocolo_key" UNIQUE ("protocolo");



ALTER TABLE ONLY "public"."contratos_fiscalizadores"
    ADD CONSTRAINT "contratos_fiscalizadores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contratos_historico"
    ADD CONSTRAINT "contratos_historico_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contratos_vigencias"
    ADD CONSTRAINT "contratos_vigencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emenda_itens"
    ADD CONSTRAINT "emenda_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emendas"
    ADD CONSTRAINT "emendas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fiscalizacao_historico"
    ADD CONSTRAINT "fiscalizacao_historico_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fornecedor_contatos"
    ADD CONSTRAINT "fornecedor_contatos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fornecedores"
    ADD CONSTRAINT "fornecedores_cnpj_normalizado_key" UNIQUE ("cnpj_normalizado");



ALTER TABLE ONLY "public"."fornecedores"
    ADD CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventario_ac"
    ADD CONSTRAINT "inventario_ac_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."itens_entregas"
    ADD CONSTRAINT "itens_entregas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."itens"
    ADD CONSTRAINT "itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parlamentares"
    ADD CONSTRAINT "parlamentares_nome_key" UNIQUE ("nome");



ALTER TABLE ONLY "public"."parlamentares"
    ADD CONSTRAINT "parlamentares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pessoas"
    ADD CONSTRAINT "pessoas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."processos"
    ADD CONSTRAINT "processos_identificador_key" UNIQUE ("identificador");



ALTER TABLE ONLY "public"."processos"
    ADD CONSTRAINT "processos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sancao_itens"
    ADD CONSTRAINT "sancao_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sancoes_administrativas"
    ADD CONSTRAINT "sancoes_administrativas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sancoes_solicitadas"
    ADD CONSTRAINT "sancoes_solicitadas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."secoes"
    ADD CONSTRAINT "secoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."secoes"
    ADD CONSTRAINT "secoes_sigla_key" UNIQUE ("sigla");



ALTER TABLE ONLY "public"."status_opcoes"
    ADD CONSTRAINT "status_opcoes_contexto_nome_key" UNIQUE ("contexto", "nome");



ALTER TABLE ONLY "public"."status_opcoes"
    ADD CONSTRAINT "status_opcoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."termo_chamados"
    ADD CONSTRAINT "termo_chamados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."termo_chamados"
    ADD CONSTRAINT "termo_chamados_termo_id_chamado_id_key" UNIQUE ("termo_id", "chamado_id");



ALTER TABLE ONLY "public"."termo_contratos"
    ADD CONSTRAINT "termo_contratos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."termo_contratos"
    ADD CONSTRAINT "termo_contratos_termo_id_contrato_id_key" UNIQUE ("termo_id", "contrato_id");



ALTER TABLE ONLY "public"."termos_ateste"
    ADD CONSTRAINT "termos_ateste_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unidades"
    ADD CONSTRAINT "unidades_nome_chave_key" UNIQUE ("nome_chave");



ALTER TABLE ONLY "public"."unidades"
    ADD CONSTRAINT "unidades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_tab_permissions"
    ADD CONSTRAINT "user_tab_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_tab_permissions"
    ADD CONSTRAINT "user_tab_permissions_user_id_tab_key_key" UNIQUE ("user_id", "tab_key");



CREATE INDEX "atas_execucao_ata_item_id_idx" ON "public"."atas_execucao" USING "btree" ("ata_item_id");



CREATE INDEX "atas_itens_contrato_id_idx" ON "public"."atas_itens" USING "btree" ("contrato_id");



CREATE INDEX "contratos_tipo_instrumento_idx" ON "public"."contratos" USING "btree" ("tipo_instrumento");



CREATE INDEX "idx_chamados_contrato_id" ON "public"."chamados" USING "btree" ("contrato_id");



CREATE INDEX "idx_chamados_controle_contrato_id" ON "public"."chamados_controle" USING "btree" ("contrato_id");



CREATE INDEX "idx_chamados_unidade_id" ON "public"."chamados" USING "btree" ("unidade_id");



CREATE INDEX "idx_contratos_fornecedor_id" ON "public"."contratos" USING "btree" ("fornecedor_id");



CREATE INDEX "idx_contratos_processo_id" ON "public"."contratos" USING "btree" ("processo_id");



CREATE INDEX "idx_contratos_vigencias_contrato_id" ON "public"."contratos_vigencias" USING "btree" ("contrato_id");



CREATE INDEX "idx_emenda_itens_emenda_id" ON "public"."emenda_itens" USING "btree" ("emenda_id");



CREATE INDEX "idx_emenda_itens_processo_id" ON "public"."emenda_itens" USING "btree" ("processo_id");



CREATE INDEX "idx_emenda_itens_unid_benef" ON "public"."emenda_itens" USING "btree" ("unidade_beneficiada_id");



CREATE INDEX "idx_emenda_itens_unid_entrega" ON "public"."emenda_itens" USING "btree" ("unidade_entrega_id");



CREATE INDEX "idx_emendas_unidade_id" ON "public"."emendas" USING "btree" ("unidade_id");



CREATE INDEX "idx_fisc_hist_chamado_id" ON "public"."fiscalizacao_historico" USING "btree" ("chamado_id");



CREATE INDEX "idx_fisc_hist_protocolo" ON "public"."fiscalizacao_historico" USING "btree" ("protocolo");



CREATE INDEX "idx_fiscalizadores_ativo" ON "public"."contratos_fiscalizadores" USING "btree" ("ativo");



CREATE INDEX "idx_fiscalizadores_contrato_id" ON "public"."contratos_fiscalizadores" USING "btree" ("contrato_id");



CREATE INDEX "idx_forn_contatos_fornecedor_id" ON "public"."fornecedor_contatos" USING "btree" ("fornecedor_id");



CREATE INDEX "idx_historico_contrato_id" ON "public"."contratos_historico" USING "btree" ("contrato_id");



CREATE INDEX "idx_historico_tipo" ON "public"."contratos_historico" USING "btree" ("tipo");



CREATE INDEX "idx_inventario_ac_emenda_item_id" ON "public"."inventario_ac" USING "btree" ("emenda_item_id") WHERE ("emenda_item_id" IS NOT NULL);



CREATE INDEX "idx_inventario_unidade_id" ON "public"."inventario_ac" USING "btree" ("unidade_id");



CREATE INDEX "idx_itens_ata_item" ON "public"."itens" USING "btree" ("ata_item_id");



CREATE INDEX "idx_itens_contrato" ON "public"."itens" USING "btree" ("contrato_id");



CREATE INDEX "idx_itens_emenda_item" ON "public"."itens" USING "btree" ("emenda_item_id");



CREATE INDEX "idx_itens_entregas_item" ON "public"."itens_entregas" USING "btree" ("item_id");



CREATE INDEX "idx_itens_grupo" ON "public"."itens" USING "btree" ("grupo_item_id");



CREATE INDEX "idx_itens_processo" ON "public"."itens" USING "btree" ("processo_id");



CREATE INDEX "idx_pessoas_usuario_id" ON "public"."pessoas" USING "btree" ("usuario_id");



CREATE INDEX "idx_processos_identificador" ON "public"."processos" USING "btree" ("upper"("identificador"));



CREATE INDEX "idx_sancao_itens_emenda_item" ON "public"."sancao_itens" USING "btree" ("emenda_item_id");



CREATE INDEX "idx_sancao_itens_sancao" ON "public"."sancao_itens" USING "btree" ("sancao_id");



CREATE INDEX "idx_sancoes_adm_contrato" ON "public"."sancoes_administrativas" USING "btree" ("contrato_id");



CREATE INDEX "idx_sancoes_solic_contrato" ON "public"."sancoes_solicitadas" USING "btree" ("contrato_id");



CREATE INDEX "idx_termo_chamados_chamado" ON "public"."termo_chamados" USING "btree" ("chamado_id");



CREATE INDEX "idx_termo_chamados_termo" ON "public"."termo_chamados" USING "btree" ("termo_id");



CREATE INDEX "idx_termo_contratos_contrato" ON "public"."termo_contratos" USING "btree" ("contrato_id");



CREATE INDEX "idx_termo_contratos_termo" ON "public"."termo_contratos" USING "btree" ("termo_id");



CREATE INDEX "idx_termos_ateste_contrato_id" ON "public"."termos_ateste" USING "btree" ("contrato_id");



CREATE OR REPLACE VIEW "public"."vw_emendas_saldo" WITH ("security_invoker"='true') AS
 SELECT "e"."id",
    "e"."emenda" AS "numero_emenda",
    "e"."ano",
    "e"."tipo",
    "e"."parlamentar",
    "e"."sei_emenda",
    "e"."unidade",
    "e"."valor_cedido",
    COALESCE("sum"("i"."vl_total_cadastrado"), (0)::numeric) AS "total_planejado",
    COALESCE("sum"("i"."vl_total"), (0)::numeric) AS "total_executado",
    COALESCE("sum"(
        CASE
            WHEN (("i"."vl_total" IS NOT NULL) AND ("i"."vl_total" > (0)::numeric)) THEN "i"."vl_total"
            ELSE COALESCE("i"."vl_total_cadastrado", (0)::numeric)
        END), (0)::numeric) AS "total_comprometido",
    ("e"."valor_cedido" - COALESCE("sum"(
        CASE
            WHEN (("i"."vl_total" IS NOT NULL) AND ("i"."vl_total" > (0)::numeric)) THEN "i"."vl_total"
            ELSE COALESCE("i"."vl_total_cadastrado", (0)::numeric)
        END), (0)::numeric)) AS "saldo_remanescente",
        CASE
            WHEN ("e"."valor_cedido" IS NULL) THEN NULL::"text"
            WHEN (COALESCE("sum"("i"."vl_total"), (0)::numeric) >= ("e"."valor_cedido" * 0.99)) THEN 'Executada'::"text"
            WHEN (COALESCE("sum"("i"."vl_total"), (0)::numeric) > (0)::numeric) THEN 'Em andamento'::"text"
            ELSE 'Não iniciada'::"text"
        END AS "status_execucao",
    "count"("i"."id") AS "qtd_itens"
   FROM ("public"."emendas" "e"
     LEFT JOIN "public"."emenda_itens" "i" ON (("i"."emenda_id" = "e"."id")))
  GROUP BY "e"."id";



CREATE OR REPLACE TRIGGER "trg_fill_chamado_id" BEFORE INSERT OR UPDATE ON "public"."chamados_controle" FOR EACH ROW EXECUTE FUNCTION "public"."fill_chamado_id_by_protocolo"();



CREATE OR REPLACE TRIGGER "trg_fill_chamado_id" BEFORE INSERT OR UPDATE ON "public"."fiscalizacao_historico" FOR EACH ROW EXECUTE FUNCTION "public"."fill_chamado_id_by_protocolo"();



ALTER TABLE ONLY "public"."atas_execucao"
    ADD CONSTRAINT "atas_execucao_ata_item_id_fkey" FOREIGN KEY ("ata_item_id") REFERENCES "public"."atas_itens"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."atas_itens"
    ADD CONSTRAINT "atas_itens_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."chamados_anexos"
    ADD CONSTRAINT "chamados_anexos_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chamados"
    ADD CONSTRAINT "chamados_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id");



ALTER TABLE ONLY "public"."chamados_controle"
    ADD CONSTRAINT "chamados_controle_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chamados_controle"
    ADD CONSTRAINT "chamados_controle_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id");



ALTER TABLE ONLY "public"."chamados"
    ADD CONSTRAINT "chamados_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id");



ALTER TABLE ONLY "public"."contratos_fiscalizadores"
    ADD CONSTRAINT "contratos_fiscalizadores_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id");



ALTER TABLE ONLY "public"."contratos_historico"
    ADD CONSTRAINT "contratos_historico_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id");



ALTER TABLE ONLY "public"."contratos_vigencias"
    ADD CONSTRAINT "contratos_vigencias_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emenda_itens"
    ADD CONSTRAINT "emenda_itens_emenda_id_fkey" FOREIGN KEY ("emenda_id") REFERENCES "public"."emendas"("id");



ALTER TABLE ONLY "public"."emenda_itens"
    ADD CONSTRAINT "emenda_itens_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id");



ALTER TABLE ONLY "public"."emenda_itens"
    ADD CONSTRAINT "emenda_itens_unidade_beneficiada_id_fkey" FOREIGN KEY ("unidade_beneficiada_id") REFERENCES "public"."unidades"("id");



ALTER TABLE ONLY "public"."emenda_itens"
    ADD CONSTRAINT "emenda_itens_unidade_entrega_id_fkey" FOREIGN KEY ("unidade_entrega_id") REFERENCES "public"."unidades"("id");



ALTER TABLE ONLY "public"."emendas"
    ADD CONSTRAINT "emendas_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id");



ALTER TABLE ONLY "public"."fiscalizacao_historico"
    ADD CONSTRAINT "fiscalizacao_historico_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fornecedor_contatos"
    ADD CONSTRAINT "fornecedor_contatos_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventario_ac"
    ADD CONSTRAINT "inventario_ac_emenda_item_id_fkey" FOREIGN KEY ("emenda_item_id") REFERENCES "public"."emenda_itens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventario_ac"
    ADD CONSTRAINT "inventario_ac_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id");



ALTER TABLE ONLY "public"."itens"
    ADD CONSTRAINT "itens_ata_item_id_fkey" FOREIGN KEY ("ata_item_id") REFERENCES "public"."atas_itens"("id");



ALTER TABLE ONLY "public"."itens"
    ADD CONSTRAINT "itens_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id");



ALTER TABLE ONLY "public"."itens"
    ADD CONSTRAINT "itens_emenda_id_fkey" FOREIGN KEY ("emenda_id") REFERENCES "public"."emendas"("id");



ALTER TABLE ONLY "public"."itens"
    ADD CONSTRAINT "itens_emenda_item_id_fkey" FOREIGN KEY ("emenda_item_id") REFERENCES "public"."emenda_itens"("id");



ALTER TABLE ONLY "public"."itens_entregas"
    ADD CONSTRAINT "itens_entregas_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."itens"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itens"
    ADD CONSTRAINT "itens_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id");



ALTER TABLE ONLY "public"."itens"
    ADD CONSTRAINT "itens_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id");



ALTER TABLE ONLY "public"."itens"
    ADD CONSTRAINT "itens_unidade_destino_id_fkey" FOREIGN KEY ("unidade_destino_id") REFERENCES "public"."unidades"("id");



ALTER TABLE ONLY "public"."pessoas"
    ADD CONSTRAINT "pessoas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sancao_itens"
    ADD CONSTRAINT "sancao_itens_emenda_item_id_fkey" FOREIGN KEY ("emenda_item_id") REFERENCES "public"."emenda_itens"("id");



ALTER TABLE ONLY "public"."sancao_itens"
    ADD CONSTRAINT "sancao_itens_sancao_id_fkey" FOREIGN KEY ("sancao_id") REFERENCES "public"."sancoes_solicitadas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sancoes_administrativas"
    ADD CONSTRAINT "sancoes_administrativas_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id");



ALTER TABLE ONLY "public"."sancoes_solicitadas"
    ADD CONSTRAINT "sancoes_solicitadas_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id");



ALTER TABLE ONLY "public"."termo_chamados"
    ADD CONSTRAINT "termo_chamados_chamado_id_fkey" FOREIGN KEY ("chamado_id") REFERENCES "public"."chamados"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."termo_chamados"
    ADD CONSTRAINT "termo_chamados_termo_id_fkey" FOREIGN KEY ("termo_id") REFERENCES "public"."termos_ateste"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."termo_contratos"
    ADD CONSTRAINT "termo_contratos_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id");



ALTER TABLE ONLY "public"."termo_contratos"
    ADD CONSTRAINT "termo_contratos_termo_id_fkey" FOREIGN KEY ("termo_id") REFERENCES "public"."termos_ateste"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."termos_ateste"
    ADD CONSTRAINT "termos_ateste_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id");



ALTER TABLE ONLY "public"."user_tab_permissions"
    ADD CONSTRAINT "user_tab_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins podem alterar papel de qualquer perfil" ON "public"."profiles" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."papel" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."papel" = 'admin'::"text")))));



CREATE POLICY "admins_manage_tab_perms" ON "public"."user_tab_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."papel" = 'admin'::"text")))));



CREATE POLICY "anon_insert_anexos" ON "public"."chamados_anexos" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



ALTER TABLE "public"."atas_execucao" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."atas_itens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auth_select_anexos" ON "public"."chamados_anexos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "auth_update_anexos" ON "public"."chamados_anexos" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."chamados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chamados_anexos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chamados_backup_21jun" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chamados_controle" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chamados_controle_backup_21jun" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contratos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contratos_backup_21jun" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contratos_fiscalizadores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contratos_fiscalizadores_backup_21jun" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contratos_historico" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contratos_historico_backup_21jun" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contratos_vigencias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contratos_vigencias_backup_21jun" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."emenda_itens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."emenda_itens_backup_21jun" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."emendas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."emendas_backup_21jun" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "escrita cadastros parlamentares" ON "public"."parlamentares" TO "authenticated" USING ("public"."can_access_tab"('cadastros'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('cadastros'::"text", 'edit'::"text"));



CREATE POLICY "escrita cadastros pessoas" ON "public"."pessoas" TO "authenticated" USING ("public"."can_access_tab"('cadastros'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('cadastros'::"text", 'edit'::"text"));



CREATE POLICY "escrita cadastros secoes" ON "public"."secoes" TO "authenticated" USING ("public"."can_access_tab"('cadastros'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('cadastros'::"text", 'edit'::"text"));



CREATE POLICY "escrita cadastros status_opcoes" ON "public"."status_opcoes" TO "authenticated" USING ("public"."can_access_tab"('cadastros'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('cadastros'::"text", 'edit'::"text"));



CREATE POLICY "escrita itens" ON "public"."itens" TO "authenticated" USING (("public"."can_access_tab"('itens'::"text", 'edit'::"text") OR "public"."can_access_tab"('contratos'::"text", 'edit'::"text") OR "public"."can_access_tab"('dashboard'::"text", 'edit'::"text"))) WITH CHECK (("public"."can_access_tab"('itens'::"text", 'edit'::"text") OR "public"."can_access_tab"('contratos'::"text", 'edit'::"text") OR "public"."can_access_tab"('dashboard'::"text", 'edit'::"text")));



CREATE POLICY "escrita itens_entregas" ON "public"."itens_entregas" TO "authenticated" USING (("public"."can_access_tab"('itens'::"text", 'edit'::"text") OR "public"."can_access_tab"('contratos'::"text", 'edit'::"text") OR "public"."can_access_tab"('dashboard'::"text", 'edit'::"text") OR "public"."can_access_tab"('atas'::"text", 'edit'::"text"))) WITH CHECK (("public"."can_access_tab"('itens'::"text", 'edit'::"text") OR "public"."can_access_tab"('contratos'::"text", 'edit'::"text") OR "public"."can_access_tab"('dashboard'::"text", 'edit'::"text") OR "public"."can_access_tab"('atas'::"text", 'edit'::"text")));



CREATE POLICY "escrita por aba atas_execucao" ON "public"."atas_execucao" TO "authenticated" USING ("public"."can_access_tab"('atas'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('atas'::"text", 'edit'::"text"));



CREATE POLICY "escrita por aba atas_itens" ON "public"."atas_itens" TO "authenticated" USING ("public"."can_access_tab"('atas'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('atas'::"text", 'edit'::"text"));



CREATE POLICY "escrita por aba chamados" ON "public"."chamados" TO "authenticated" USING (("public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text") OR "public"."can_access_tab"('fiscalizacao'::"text", 'edit'::"text"))) WITH CHECK (("public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text") OR "public"."can_access_tab"('fiscalizacao'::"text", 'edit'::"text")));



CREATE POLICY "escrita por aba chamados_controle" ON "public"."chamados_controle" TO "authenticated" USING (("public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text") OR "public"."can_access_tab"('fiscalizacao'::"text", 'edit'::"text"))) WITH CHECK (("public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text") OR "public"."can_access_tab"('fiscalizacao'::"text", 'edit'::"text")));



CREATE POLICY "escrita por aba contratos" ON "public"."contratos" TO "authenticated" USING ("public"."can_access_tab"('contratos'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('contratos'::"text", 'edit'::"text"));



CREATE POLICY "escrita por aba emenda_itens" ON "public"."emenda_itens" TO "authenticated" USING ("public"."can_access_tab"('dashboard'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('dashboard'::"text", 'edit'::"text"));



CREATE POLICY "escrita por aba emendas" ON "public"."emendas" TO "authenticated" USING ("public"."can_access_tab"('dashboard'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('dashboard'::"text", 'edit'::"text"));



CREATE POLICY "escrita por aba fiscalizacao_historico" ON "public"."fiscalizacao_historico" TO "authenticated" USING (("public"."can_access_tab"('fiscalizacao'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text"))) WITH CHECK (("public"."can_access_tab"('fiscalizacao'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text")));



CREATE POLICY "escrita por aba fiscalizadores" ON "public"."contratos_fiscalizadores" TO "authenticated" USING ("public"."can_access_tab"('contratos'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('contratos'::"text", 'edit'::"text"));



CREATE POLICY "escrita por aba fornecedor_contatos" ON "public"."fornecedor_contatos" TO "authenticated" USING ("public"."can_access_tab"('contratos'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('contratos'::"text", 'edit'::"text"));



CREATE POLICY "escrita por aba fornecedores" ON "public"."fornecedores" TO "authenticated" USING ("public"."can_access_tab"('contratos'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('contratos'::"text", 'edit'::"text"));



CREATE POLICY "escrita por aba historico" ON "public"."contratos_historico" TO "authenticated" USING ("public"."can_access_tab"('contratos'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('contratos'::"text", 'edit'::"text"));



CREATE POLICY "escrita por aba inventario_ac" ON "public"."inventario_ac" TO "authenticated" USING ("public"."can_access_tab"('inventario-ac'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('inventario-ac'::"text", 'edit'::"text"));



CREATE POLICY "escrita por aba sancao_itens" ON "public"."sancao_itens" TO "authenticated" USING (("public"."can_access_tab"('atas'::"text", 'edit'::"text") OR "public"."can_access_tab"('sancoes'::"text", 'edit'::"text"))) WITH CHECK (("public"."can_access_tab"('atas'::"text", 'edit'::"text") OR "public"."can_access_tab"('sancoes'::"text", 'edit'::"text")));



CREATE POLICY "escrita por aba sancoes_administrativas" ON "public"."sancoes_administrativas" TO "authenticated" USING ("public"."can_access_tab"('sancoes'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('sancoes'::"text", 'edit'::"text"));



CREATE POLICY "escrita por aba sancoes_solicitadas" ON "public"."sancoes_solicitadas" TO "authenticated" USING (("public"."can_access_tab"('atas'::"text", 'edit'::"text") OR "public"."can_access_tab"('sancoes'::"text", 'edit'::"text"))) WITH CHECK (("public"."can_access_tab"('atas'::"text", 'edit'::"text") OR "public"."can_access_tab"('sancoes'::"text", 'edit'::"text")));



CREATE POLICY "escrita por aba termo_chamados" ON "public"."termo_chamados" TO "authenticated" USING (("public"."can_access_tab"('fiscalizacao'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text"))) WITH CHECK (("public"."can_access_tab"('fiscalizacao'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text")));



CREATE POLICY "escrita por aba termo_contratos" ON "public"."termo_contratos" TO "authenticated" USING (("public"."can_access_tab"('fiscalizacao'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text"))) WITH CHECK (("public"."can_access_tab"('fiscalizacao'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text")));



CREATE POLICY "escrita por aba termos_ateste" ON "public"."termos_ateste" TO "authenticated" USING (("public"."can_access_tab"('fiscalizacao'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text"))) WITH CHECK (("public"."can_access_tab"('fiscalizacao'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text")));



CREATE POLICY "escrita por aba unidades" ON "public"."unidades" TO "authenticated" USING (("public"."can_access_tab"('dashboard'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text") OR "public"."can_access_tab"('inventario-ac'::"text", 'edit'::"text") OR "public"."can_access_tab"('contratos'::"text", 'edit'::"text"))) WITH CHECK (("public"."can_access_tab"('dashboard'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados'::"text", 'edit'::"text") OR "public"."can_access_tab"('chamados-novos'::"text", 'edit'::"text") OR "public"."can_access_tab"('inventario-ac'::"text", 'edit'::"text") OR "public"."can_access_tab"('contratos'::"text", 'edit'::"text")));



CREATE POLICY "escrita por aba vigencias" ON "public"."contratos_vigencias" TO "authenticated" USING ("public"."can_access_tab"('contratos'::"text", 'edit'::"text")) WITH CHECK ("public"."can_access_tab"('contratos'::"text", 'edit'::"text"));



CREATE POLICY "escrita processos" ON "public"."processos" TO "authenticated" USING (("public"."can_access_tab"('contratos'::"text", 'edit'::"text") OR "public"."can_access_tab"('dashboard'::"text", 'edit'::"text"))) WITH CHECK (("public"."can_access_tab"('contratos'::"text", 'edit'::"text") OR "public"."can_access_tab"('dashboard'::"text", 'edit'::"text")));



ALTER TABLE "public"."fiscalizacao_historico" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fornecedor_contatos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fornecedores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventario_ac" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventario_ac_backup_21jun" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."itens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."itens_entregas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leitura autenticada" ON "public"."atas_execucao" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada" ON "public"."atas_itens" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada" ON "public"."chamados" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada" ON "public"."chamados_controle" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada" ON "public"."inventario_ac" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada contratos" ON "public"."contratos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada controle" ON "public"."chamados_controle" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada fiscalizacao_historico" ON "public"."fiscalizacao_historico" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada fiscalizadores" ON "public"."contratos_fiscalizadores" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada fornecedor_contatos" ON "public"."fornecedor_contatos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada fornecedores" ON "public"."fornecedores" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada historico" ON "public"."contratos_historico" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada itens" ON "public"."itens" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada itens_entregas" ON "public"."itens_entregas" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada parlamentares" ON "public"."parlamentares" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada pessoas" ON "public"."pessoas" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada processos" ON "public"."processos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada sancao_itens" ON "public"."sancao_itens" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada sancoes" ON "public"."sancoes_administrativas" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada sancoes solicitadas" ON "public"."sancoes_solicitadas" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada secoes" ON "public"."secoes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada status_opcoes" ON "public"."status_opcoes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada termo_chamados" ON "public"."termo_chamados" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada termo_contratos" ON "public"."termo_contratos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada termos_ateste" ON "public"."termos_ateste" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada unidades" ON "public"."unidades" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura autenticada vigencias" ON "public"."contratos_vigencias" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "leitura publica" ON "public"."emenda_itens" FOR SELECT USING (true);



CREATE POLICY "leitura publica" ON "public"."emendas" FOR SELECT USING (true);



ALTER TABLE "public"."parlamentares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pessoas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."processos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles_backup_21jun" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sancao_itens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sancoes_administrativas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sancoes_solicitadas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sancoes_solicitadas_backup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sancoes_solicitadas_backup_21jun" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."secoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."status_opcoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."termo_chamados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."termo_contratos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."termos_ateste" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."termos_ateste_backup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."termos_ateste_backup_21jun" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."unidades" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tab_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tab_permissions_backup_21jun" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_read_own_tab_perms" ON "public"."user_tab_permissions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "usuario insere proprio perfil" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("id" = "auth"."uid"()) AND ("papel" = 'visualizador'::"text")));



CREATE POLICY "usuarios autenticados veem perfis" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "usuarios editam proprio perfil" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK ((("id" = "auth"."uid"()) AND ("papel" = ( SELECT "profiles_1"."papel"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."_unidade_key"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_unidade_key"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_unidade_key"("p" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."abrir_chamado_publico"("p_carimbo" "text", "p_data_solicitacao" "text", "p_unidade" "text", "p_equipamento" "text", "p_fabricante" "text", "p_serie" "text", "p_patrimonio" "text", "p_categoria" "text", "p_servico" "text", "p_problema" "text", "p_descricao" "text", "p_endereco" "text", "p_telefone" "text", "p_responsavel" "text", "p_grau_urgencia" "text", "p_email_retorno" "text", "p_rechamado" "text", "p_data_rechamado" "text", "p_observacao" "text", "p_protocolo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."abrir_chamado_publico"("p_carimbo" "text", "p_data_solicitacao" "text", "p_unidade" "text", "p_equipamento" "text", "p_fabricante" "text", "p_serie" "text", "p_patrimonio" "text", "p_categoria" "text", "p_servico" "text", "p_problema" "text", "p_descricao" "text", "p_endereco" "text", "p_telefone" "text", "p_responsavel" "text", "p_grau_urgencia" "text", "p_email_retorno" "text", "p_rechamado" "text", "p_data_rechamado" "text", "p_observacao" "text", "p_protocolo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."abrir_chamado_publico"("p_carimbo" "text", "p_data_solicitacao" "text", "p_unidade" "text", "p_equipamento" "text", "p_fabricante" "text", "p_serie" "text", "p_patrimonio" "text", "p_categoria" "text", "p_servico" "text", "p_problema" "text", "p_descricao" "text", "p_endereco" "text", "p_telefone" "text", "p_responsavel" "text", "p_grau_urgencia" "text", "p_email_retorno" "text", "p_rechamado" "text", "p_data_rechamado" "text", "p_observacao" "text", "p_protocolo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_tab"("p_tab" "text", "p_action" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_tab"("p_tab" "text", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_tab"("p_tab" "text", "p_action" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fill_chamado_id_by_protocolo"() TO "anon";
GRANT ALL ON FUNCTION "public"."fill_chamado_id_by_protocolo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fill_chamado_id_by_protocolo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."atas_execucao" TO "anon";
GRANT ALL ON TABLE "public"."atas_execucao" TO "authenticated";
GRANT ALL ON TABLE "public"."atas_execucao" TO "service_role";



GRANT ALL ON TABLE "public"."atas_itens" TO "anon";
GRANT ALL ON TABLE "public"."atas_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."atas_itens" TO "service_role";



GRANT ALL ON TABLE "public"."chamados" TO "anon";
GRANT ALL ON TABLE "public"."chamados" TO "authenticated";
GRANT ALL ON TABLE "public"."chamados" TO "service_role";



GRANT ALL ON TABLE "public"."chamados_anexos" TO "anon";
GRANT ALL ON TABLE "public"."chamados_anexos" TO "authenticated";
GRANT ALL ON TABLE "public"."chamados_anexos" TO "service_role";



GRANT ALL ON TABLE "public"."chamados_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."chamados_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."chamados_backup_21jun" TO "service_role";



GRANT ALL ON TABLE "public"."chamados_controle" TO "anon";
GRANT ALL ON TABLE "public"."chamados_controle" TO "authenticated";
GRANT ALL ON TABLE "public"."chamados_controle" TO "service_role";



GRANT ALL ON TABLE "public"."chamados_controle_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."chamados_controle_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."chamados_controle_backup_21jun" TO "service_role";



GRANT ALL ON SEQUENCE "public"."chamados_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."chamados_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."chamados_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contratos" TO "anon";
GRANT ALL ON TABLE "public"."contratos" TO "authenticated";
GRANT ALL ON TABLE "public"."contratos" TO "service_role";



GRANT ALL ON TABLE "public"."contratos_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."contratos_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."contratos_backup_21jun" TO "service_role";



GRANT ALL ON TABLE "public"."contratos_fiscalizadores" TO "anon";
GRANT ALL ON TABLE "public"."contratos_fiscalizadores" TO "authenticated";
GRANT ALL ON TABLE "public"."contratos_fiscalizadores" TO "service_role";



GRANT ALL ON TABLE "public"."contratos_fiscalizadores_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."contratos_fiscalizadores_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."contratos_fiscalizadores_backup_21jun" TO "service_role";



GRANT ALL ON TABLE "public"."contratos_historico" TO "anon";
GRANT ALL ON TABLE "public"."contratos_historico" TO "authenticated";
GRANT ALL ON TABLE "public"."contratos_historico" TO "service_role";



GRANT ALL ON TABLE "public"."contratos_historico_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."contratos_historico_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."contratos_historico_backup_21jun" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contratos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contratos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contratos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contratos_vigencias" TO "anon";
GRANT ALL ON TABLE "public"."contratos_vigencias" TO "authenticated";
GRANT ALL ON TABLE "public"."contratos_vigencias" TO "service_role";



GRANT ALL ON TABLE "public"."contratos_vigencias_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."contratos_vigencias_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."contratos_vigencias_backup_21jun" TO "service_role";



GRANT ALL ON TABLE "public"."emenda_itens" TO "anon";
GRANT ALL ON TABLE "public"."emenda_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."emenda_itens" TO "service_role";



GRANT ALL ON TABLE "public"."emenda_itens_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."emenda_itens_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."emenda_itens_backup_21jun" TO "service_role";



GRANT ALL ON TABLE "public"."emendas" TO "anon";
GRANT ALL ON TABLE "public"."emendas" TO "authenticated";
GRANT ALL ON TABLE "public"."emendas" TO "service_role";



GRANT ALL ON TABLE "public"."emendas_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."emendas_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."emendas_backup_21jun" TO "service_role";



GRANT ALL ON TABLE "public"."fiscalizacao_historico" TO "anon";
GRANT ALL ON TABLE "public"."fiscalizacao_historico" TO "authenticated";
GRANT ALL ON TABLE "public"."fiscalizacao_historico" TO "service_role";



GRANT ALL ON TABLE "public"."fornecedor_contatos" TO "anon";
GRANT ALL ON TABLE "public"."fornecedor_contatos" TO "authenticated";
GRANT ALL ON TABLE "public"."fornecedor_contatos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fornecedor_contatos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fornecedor_contatos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fornecedor_contatos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fornecedores" TO "anon";
GRANT ALL ON TABLE "public"."fornecedores" TO "authenticated";
GRANT ALL ON TABLE "public"."fornecedores" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fornecedores_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fornecedores_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fornecedores_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inventario_ac" TO "anon";
GRANT ALL ON TABLE "public"."inventario_ac" TO "authenticated";
GRANT ALL ON TABLE "public"."inventario_ac" TO "service_role";



GRANT ALL ON TABLE "public"."inventario_ac_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."inventario_ac_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."inventario_ac_backup_21jun" TO "service_role";



GRANT ALL ON TABLE "public"."itens" TO "anon";
GRANT ALL ON TABLE "public"."itens" TO "authenticated";
GRANT ALL ON TABLE "public"."itens" TO "service_role";



GRANT ALL ON TABLE "public"."itens_entregas" TO "anon";
GRANT ALL ON TABLE "public"."itens_entregas" TO "authenticated";
GRANT ALL ON TABLE "public"."itens_entregas" TO "service_role";



GRANT ALL ON TABLE "public"."parlamentares" TO "anon";
GRANT ALL ON TABLE "public"."parlamentares" TO "authenticated";
GRANT ALL ON TABLE "public"."parlamentares" TO "service_role";



GRANT ALL ON SEQUENCE "public"."parlamentares_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."parlamentares_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."parlamentares_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pessoas" TO "anon";
GRANT ALL ON TABLE "public"."pessoas" TO "authenticated";
GRANT ALL ON TABLE "public"."pessoas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pessoas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pessoas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pessoas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."processos" TO "anon";
GRANT ALL ON TABLE "public"."processos" TO "authenticated";
GRANT ALL ON TABLE "public"."processos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."processos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."processos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."processos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."profiles_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."profiles_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles_backup_21jun" TO "service_role";



GRANT ALL ON TABLE "public"."sancao_itens" TO "anon";
GRANT ALL ON TABLE "public"."sancao_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."sancao_itens" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sancao_itens_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sancao_itens_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sancao_itens_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sancoes_administrativas" TO "authenticated";
GRANT ALL ON TABLE "public"."sancoes_administrativas" TO "service_role";



GRANT ALL ON TABLE "public"."sancoes_solicitadas" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."sancoes_solicitadas" TO "authenticated";



GRANT ALL ON TABLE "public"."sancoes_solicitadas_backup" TO "anon";
GRANT ALL ON TABLE "public"."sancoes_solicitadas_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."sancoes_solicitadas_backup" TO "service_role";



GRANT ALL ON TABLE "public"."sancoes_solicitadas_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."sancoes_solicitadas_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."sancoes_solicitadas_backup_21jun" TO "service_role";



GRANT ALL ON TABLE "public"."secoes" TO "anon";
GRANT ALL ON TABLE "public"."secoes" TO "authenticated";
GRANT ALL ON TABLE "public"."secoes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."secoes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."secoes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."secoes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."status_opcoes" TO "anon";
GRANT ALL ON TABLE "public"."status_opcoes" TO "authenticated";
GRANT ALL ON TABLE "public"."status_opcoes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."status_opcoes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."status_opcoes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."status_opcoes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."termo_chamados" TO "anon";
GRANT ALL ON TABLE "public"."termo_chamados" TO "authenticated";
GRANT ALL ON TABLE "public"."termo_chamados" TO "service_role";



GRANT ALL ON SEQUENCE "public"."termo_chamados_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."termo_chamados_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."termo_chamados_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."termo_contratos" TO "anon";
GRANT ALL ON TABLE "public"."termo_contratos" TO "authenticated";
GRANT ALL ON TABLE "public"."termo_contratos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."termo_contratos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."termo_contratos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."termo_contratos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."termos_ateste" TO "anon";
GRANT ALL ON TABLE "public"."termos_ateste" TO "authenticated";
GRANT ALL ON TABLE "public"."termos_ateste" TO "service_role";



GRANT ALL ON TABLE "public"."termos_ateste_backup" TO "anon";
GRANT ALL ON TABLE "public"."termos_ateste_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."termos_ateste_backup" TO "service_role";



GRANT ALL ON TABLE "public"."termos_ateste_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."termos_ateste_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."termos_ateste_backup_21jun" TO "service_role";



GRANT ALL ON TABLE "public"."unidades" TO "anon";
GRANT ALL ON TABLE "public"."unidades" TO "authenticated";
GRANT ALL ON TABLE "public"."unidades" TO "service_role";



GRANT ALL ON SEQUENCE "public"."unidades_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."unidades_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."unidades_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_tab_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_tab_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tab_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."user_tab_permissions_backup_21jun" TO "anon";
GRANT ALL ON TABLE "public"."user_tab_permissions_backup_21jun" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tab_permissions_backup_21jun" TO "service_role";



GRANT ALL ON TABLE "public"."vw_emendas_saldo" TO "anon";
GRANT ALL ON TABLE "public"."vw_emendas_saldo" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_emendas_saldo" TO "service_role";



GRANT ALL ON TABLE "public"."vw_processos_resumo" TO "anon";
GRANT ALL ON TABLE "public"."vw_processos_resumo" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_processos_resumo" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































