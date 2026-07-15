export const CONTRACT_COLLECTION_KEYS = Object.freeze({
  contracts: "contracts",
  contractItems: "contractItems",
  contractEvents: "contractEvents",
  contractMeasurements: "contractMeasurements",
  contractInvoices: "contractInvoices",
  contractDocuments: "contractDocuments",
  contractHistory: "contractHistory"
});

export const CONTRACT_MODELS = Object.freeze([
  { key: "aquisicao_entrega_unica", label: "Aquisicao com entrega unica", usesRemainingMonths: false, measurementMode: "recebimento" },
  { key: "aquisicao_entrega_parcelada", label: "Aquisicao com entregas parceladas", usesRemainingMonths: false, measurementMode: "entrega_parcelada" },
  { key: "servico_continuo_mensal_fixo", label: "Servico continuo com valor mensal fixo", usesRemainingMonths: true, measurementMode: "competencia" },
  { key: "servico_continuo_demanda", label: "Servico continuo por demanda", usesRemainingMonths: false, measurementMode: "demanda" },
  { key: "servico_escopo_fechado", label: "Servico por escopo fechado", usesRemainingMonths: false, measurementMode: "etapa_marco" },
  { key: "obra_engenharia", label: "Obra ou servico de engenharia", usesRemainingMonths: false, measurementMode: "planilha_medicao" },
  { key: "locacao_bens_moveis", label: "Locacao de bens moveis", usesRemainingMonths: true, measurementMode: "competencia" },
  { key: "locacao_imovel", label: "Locacao de imovel", usesRemainingMonths: true, measurementMode: "competencia" },
  { key: "fornecimento_com_instalacao", label: "Fornecimento com instalacao", usesRemainingMonths: false, measurementMode: "aceite_instalacao" },
  { key: "servico_com_materiais_pecas", label: "Servico com materiais ou pecas", usesRemainingMonths: false, measurementMode: "medicao_mista" },
  { key: "mao_obra_dedicacao_exclusiva", label: "Mao de obra com dedicacao exclusiva", usesRemainingMonths: true, measurementMode: "competencia" },
  { key: "tecnologia_software_licenca", label: "Tecnologia, software, licenca ou sistema", usesRemainingMonths: null, measurementMode: "configuravel" },
  { key: "credenciamento", label: "Credenciamento", usesRemainingMonths: false, measurementMode: "procedimento_demanda" }
]);

export const PROCUREMENT_ORIGINS = Object.freeze([
  "licitacao",
  "dispensa",
  "inexigibilidade",
  "contratacao_direta",
  "arp",
  "credenciamento",
  "outro"
]);

export const EXECUTION_PAYMENT_MODELS = Object.freeze([
  "mensal_fixo",
  "por_item",
  "por_demanda",
  "por_ordem_servico",
  "por_medicao",
  "por_competencia",
  "por_entrega",
  "por_etapa_marco",
  "continuo",
  "estimativo"
]);

export const INSTRUMENT_TYPES = Object.freeze([
  "contrato",
  "ata",
  "empenho",
  "af",
  "os",
  "instrumento_equivalente"
]);

export const CONTRACT_EVENT_TYPES = Object.freeze([
  "reajuste",
  "aditivo",
  "supressao",
  "prorrogacao",
  "apostilamento",
  "alteracao_fiscal",
  "encerramento",
  "outro"
]);

export const CONTRACT_EVENT_STATUSES = Object.freeze([
  "rascunho",
  "em_analise",
  "aprovado",
  "formalizado",
  "cancelado"
]);

export const FORMALIZED_EVENT_STATUSES = Object.freeze(["formalizado"]);

export const MEASUREMENT_STATUSES = Object.freeze([
  "rascunho",
  "registrada",
  "aprovada_pelo_fiscal",
  "aprovada_com_glosa",
  "recusada",
  "cancelada"
]);

export const INVOICE_STATUSES = Object.freeze([
  "pendente",
  "em_conferencia",
  "aprovada",
  "aprovada_com_glosa",
  "recusada",
  "encaminhada_para_pagamento",
  "cancelada"
]);

export const DOCUMENT_TYPES = Object.freeze([
  "contrato_assinado",
  "termo_aditivo",
  "apostilamento",
  "reajuste",
  "supressao",
  "prorrogacao",
  "nota_fiscal",
  "relatorio_medicao",
  "certidao",
  "parecer",
  "publicacao",
  "outro"
]);

export function createContractRecord(input = {}) {
  return {
    id: input.id ?? null,
    number: input.number ?? input.numero_contrato ?? "",
    processNumber: input.processNumber ?? input.cpl ?? "",
    supplierId: input.supplierId ?? input.fornecedor_id ?? null,
    supplierName: input.supplierName ?? input.prestador ?? "",
    supplierDocument: input.supplierDocument ?? input.cnpj_fornecedor ?? input.cnpj ?? "",
    object: input.object ?? input.objeto ?? "",
    sector: input.sector ?? input.secao ?? "",
    manager: input.manager ?? "",
    fiscal: input.fiscal ?? input.fiscalizacao ?? "",
    contractModel: input.contractModel ?? input.modelo_contrato ?? "",
    procurementOrigin: input.procurementOrigin ?? input.origem_contratacao ?? "",
    executionPaymentModel: input.executionPaymentModel ?? input.forma_execucao_pagamento ?? "",
    instrumentType: input.instrumentType ?? (String(input.tipo_instrumento ?? "CONTRATO").toLowerCase() === "ata" ? "ata" : "contrato"),
    startDate: input.startDate ?? input.data_inicio ?? "",
    endDate: input.endDate ?? input.vencimento ?? "",
    originalEndDate: input.originalEndDate ?? input.vencimento_original ?? input.vencimento ?? "",
    initialValue: input.initialValue ?? input.valor_inicial_num ?? input.valor_inicial ?? null,
    monthlyValue: input.monthlyValue ?? input.valor_mensal_num ?? input.valor_mensal ?? null,
    currentValue: input.currentValue ?? input.valor_atual_num ?? input.valor_atual ?? null,
    status: input.status ?? "vigente",
    notes: input.notes ?? input.obs ?? "",
    createdAt: input.createdAt ?? input.created_at ?? "",
    updatedAt: input.updatedAt ?? input.updated_at ?? input.data_atualizacao ?? ""
  };
}

export function createContractItem(input = {}) {
  return {
    id: input.id ?? null,
    contractId: input.contractId ?? input.contrato_id ?? null,
    description: input.description ?? input.descricao ?? "",
    category: input.category ?? input.categoria ?? "",
    unit: input.unit ?? input.unidade ?? "unidade",
    originalQuantity: input.originalQuantity ?? input.qtde_original ?? input.qtde ?? 0,
    currentQuantity: input.currentQuantity ?? input.qtde_atual ?? input.qtde ?? null,
    receivedOrExecutedQuantity: input.receivedOrExecutedQuantity ?? input.qtde_executada ?? input.qtde_recebida ?? 0,
    originalUnitValue: input.originalUnitValue ?? input.valor_unitario_original ?? input.valor_unit ?? input.valor_contratado ?? 0,
    currentUnitValue: input.currentUnitValue ?? input.valor_unitario_atual ?? input.valor_unit ?? input.valor_contratado ?? 0,
    monthlyUnitValue: input.monthlyUnitValue ?? input.valor_mensal_unitario ?? 0,
    totalOriginalValue: input.totalOriginalValue ?? input.valor_total_original ?? null,
    status: input.status ?? "ativo",
    notes: input.notes ?? input.obs ?? ""
  };
}

export function createContractEvent(input = {}) {
  const eventType = input.eventType ?? input.tipo ?? "outro";
  return {
    id: input.id ?? null,
    contractId: input.contractId ?? input.contrato_id ?? null,
    eventType,
    status: input.status ?? "rascunho",
    title: input.title ?? input.titulo ?? "",
    description: input.description ?? input.obs ?? "",
    effectiveDate: input.effectiveDate ?? input.data_evento ?? "",
    formalizationDate: input.formalizationDate ?? input.data_formalizacao ?? "",
    processNumber: input.processNumber ?? input.processo ?? "",
    legalDocumentNumber: input.legalDocumentNumber ?? input.numero_documento ?? "",
    percentage: input.percentage ?? input.percentual ?? null,
    impactValue: input.impactValue ?? input.valor_impacto ?? input.valor_novo ?? null,
    baseValueBefore: input.baseValueBefore ?? input.valor_base_anterior ?? null,
    adjustedValueAfter: input.adjustedValueAfter ?? input.valor_reajustado ?? null,
    affectsValue: input.affectsValue ?? true,
    affectsTerm: input.affectsTerm ?? false,
    affectsInitialAdjustedValue: input.affectsInitialAdjustedValue ?? eventType === "reajuste",
    items: Array.isArray(input.items) ? input.items : [],
    createdAt: input.createdAt ?? input.created_at ?? "",
    updatedAt: input.updatedAt ?? input.updated_at ?? "",
    notes: input.notes ?? ""
  };
}

export function createContractMeasurement(input = {}) {
  return {
    id: input.id ?? null,
    contractId: input.contractId ?? input.contrato_id ?? null,
    competence: input.competence ?? input.competencia ?? "",
    measurementType: input.measurementType ?? input.tipo_medicao ?? "",
    status: input.status ?? "rascunho",
    grossValue: input.grossValue ?? input.valor_bruto ?? 0,
    glosaValue: input.glosaValue ?? input.valor_glosa ?? input.glosa ?? 0,
    netValue: input.netValue ?? input.valor_liquido ?? null,
    measurementDate: input.measurementDate ?? input.data_medicao ?? "",
    fiscal: input.fiscal ?? input.fiscal_responsavel ?? input.fiscalizacao ?? "",
    validatedBy: input.validatedBy ?? input.validado_por ?? "",
    validatedAt: input.validatedAt ?? input.validado_em ?? "",
    forwardedAt: input.forwardedAt ?? input.encaminhado_em ?? "",
    notes: input.notes ?? input.observacoes ?? input.obs ?? "",
    items: Array.isArray(input.items) ? input.items : []
  };
}

export function createContractMeasurementItem(input = {}) {
  return {
    id: input.id ?? null,
    measurementId: input.measurementId ?? input.medicao_id ?? null,
    contractId: input.contractId ?? input.contrato_id ?? null,
    itemId: input.itemId ?? input.item_id ?? null,
    description: input.description ?? input.descricao ?? "",
    unit: input.unit ?? input.unidade ?? "",
    executedQuantity: input.executedQuantity ?? input.quantidade_executada ?? 0,
    acceptedQuantity: input.acceptedQuantity ?? input.quantidade_aceita ?? null,
    refusedQuantity: input.refusedQuantity ?? input.quantidade_recusada ?? 0,
    unitValue: input.unitValue ?? input.valor_unitario ?? 0,
    totalValue: input.totalValue ?? input.valor_total ?? null,
    notes: input.notes ?? input.observacoes ?? ""
  };
}

export function createContractGlosa(input = {}) {
  return {
    id: input.id ?? null,
    measurementId: input.measurementId ?? input.medicao_id ?? null,
    contractId: input.contractId ?? input.contrato_id ?? null,
    itemId: input.itemId ?? input.item_id ?? null,
    reason: input.reason ?? input.motivo ?? "",
    affectedPeriod: input.affectedPeriod ?? input.periodo_afetado ?? "",
    affectedQuantity: input.affectedQuantity ?? input.quantidade_afetada ?? null,
    glosaValue: input.glosaValue ?? input.valor_glosa ?? 0,
    justification: input.justification ?? input.justificativa ?? "",
    status: input.status ?? "registrada",
    documentUrl: input.documentUrl ?? input.documento_url ?? ""
  };
}

export function createContractInvoice(input = {}) {
  return {
    id: input.id ?? null,
    contractId: input.contractId ?? input.contrato_id ?? null,
    measurementId: input.measurementId ?? input.medicao_id ?? null,
    invoiceNumber: input.invoiceNumber ?? input.numero ?? "",
    invoiceSeries: input.invoiceSeries ?? input.serie ?? "",
    accessKey: input.accessKey ?? input.chave_acesso ?? "",
    supplierName: input.supplierName ?? input.fornecedor ?? "",
    supplierId: input.supplierId ?? input.fornecedor_id ?? null,
    competence: input.competence ?? input.competencia ?? "",
    issueDate: input.issueDate ?? input.data_emissao ?? "",
    receivedDate: input.receivedDate ?? input.data_recebimento ?? "",
    grossValue: input.grossValue ?? input.valor_total ?? 0,
    glosaValue: input.glosaValue ?? input.valor_glosa ?? input.glosa ?? 0,
    approvedValue: input.approvedValue ?? input.valor_aprovado ?? null,
    status: input.status ?? "pendente",
    validatedBy: input.validatedBy ?? input.validado_por ?? "",
    validatedAt: input.validatedAt ?? input.validado_em ?? "",
    forwardedAt: input.forwardedAt ?? input.encaminhado_em ?? "",
    notes: input.notes ?? input.observacoes ?? ""
  };
}

export function createContractDocument(input = {}) {
  return {
    id: input.id ?? null,
    contractId: input.contractId ?? input.contrato_id ?? null,
    relatedEntityType: input.relatedEntityType ?? input.related_entity_type ?? "contract",
    relatedEntityId: input.relatedEntityId ?? input.related_entity_id ?? input.contractId ?? input.contrato_id ?? null,
    documentType: input.documentType ?? input.tipo_documento ?? "outro",
    title: input.title ?? input.titulo ?? "",
    documentNumber: input.documentNumber ?? input.numero_documento ?? "",
    documentDate: input.documentDate ?? input.data_documento ?? "",
    fileName: input.fileName ?? input.nome_arquivo ?? input.referencia ?? "",
    fileUrl: input.fileUrl ?? input.url_arquivo ?? "",
    reference: input.reference ?? input.referencia ?? "",
    notes: input.notes ?? input.observacoes ?? input.obs ?? "",
    createdBy: input.createdBy ?? input.criado_por ?? "",
    createdAt: input.createdAt ?? input.created_at ?? ""
  };
}

export function createContractHistoryEntry(input = {}) {
  return {
    id: input.id ?? null,
    contractId: input.contractId ?? input.contrato_id ?? null,
    date: input.date ?? input.created_at ?? new Date().toISOString(),
    actionType: input.actionType ?? input.action_type ?? input.tipo ?? "",
    title: input.title ?? input.titulo ?? "",
    description: input.description ?? input.obs ?? "",
    relatedEntityType: input.relatedEntityType ?? input.related_entity_type ?? "",
    relatedEntityId: input.relatedEntityId ?? input.related_entity_id ?? null,
    documentId: input.documentId ?? input.documento_id ?? null,
    userName: input.userName ?? input.usuario ?? ""
  };
}

export function findContractById(contracts, contractId) {
  return (contracts || []).find((contract) => String(contract.id) === String(contractId)) || null;
}

export function getContractBundle(store, contractId) {
  const contract = findContractById(store?.contratos || store?.contracts || [], contractId);
  return {
    contract,
    items: (store?.contractItems || []).filter((item) => String(item.contractId) === String(contractId)),
    events: (store?.contractEvents || []).filter((event) => String(event.contractId) === String(contractId)),
    measurements: (store?.contractMeasurements || []).filter((measurement) => String(measurement.contractId) === String(contractId)),
    invoices: (store?.contractInvoices || []).filter((invoice) => String(invoice.contractId) === String(contractId)),
    documents: (store?.contractDocuments || []).filter((document) => String(document.contractId) === String(contractId)),
    history: (store?.contractHistory || []).filter((entry) => String(entry.contractId) === String(contractId))
  };
}
