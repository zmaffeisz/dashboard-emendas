export function getContratosPorEmenda(store, emendaId) {
  return store.contratos.filter((contrato) => contrato.emenda_id === emendaId);
}

export function getContratoPorId(store, contratoId) {
  return (store.contratos || []).find((contrato) => String(contrato.id) === String(contratoId)) || null;
}

export function getAtasPorContrato(store, contratoId) {
  return store.atas.filter((ata) => ata.contrato_id === contratoId);
}

export function getExecucoesPorContrato(store, contratoId) {
  return store.execucoes.filter((execucao) => execucao.contrato_id === contratoId);
}

export function getContratoItens(store, contratoId) {
  return (store.contractItems || []).filter((item) => String(item.contractId) === String(contratoId));
}

export function getContratoEventos(store, contratoId) {
  return (store.contractEvents || []).filter((event) => String(event.contractId) === String(contratoId));
}

export function getContratoMedicoes(store, contratoId) {
  return (store.contractMeasurements || []).filter((measurement) => String(measurement.contractId) === String(contratoId));
}

export function getContratoNotasFiscais(store, contratoId) {
  return (store.contractInvoices || []).filter((invoice) => String(invoice.contractId) === String(contratoId));
}

export function getContratoDocumentos(store, contratoId) {
  return (store.contractDocuments || []).filter((document) => String(document.contractId) === String(contratoId));
}

export function getContratoHistorico(store, contratoId) {
  return (store.contractHistory || []).filter((entry) => String(entry.contractId) === String(contratoId));
}
