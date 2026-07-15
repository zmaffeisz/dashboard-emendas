import { FORMALIZED_EVENT_STATUSES } from "./contratos.data.js";

export function toContractNumber(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundMoney(value) {
  return Math.round((toContractNumber(value) + Number.EPSILON) * 100) / 100;
}

export function isFormalizedEvent(event) {
  return FORMALIZED_EVENT_STATUSES.includes(String(event?.status || "").toLowerCase());
}

export function calculateInitialValue(contract = {}, items = []) {
  const directValue = contract.initialValue ?? contract.valor_inicial_num ?? contract.valor_inicial;
  if (directValue != null && directValue !== "") return roundMoney(directValue);

  return roundMoney((items || []).reduce((total, item) => {
    const quantity = toContractNumber(item.originalQuantity ?? item.qtde_original ?? item.qtde);
    const unitValue = toContractNumber(item.originalUnitValue ?? item.valor_unitario_original ?? item.valor_unit ?? item.valor_contratado);
    return total + quantity * unitValue;
  }, 0));
}

export function calculateFormalizedEvents(events = []) {
  return (events || []).filter(isFormalizedEvent);
}

export function calculateInitialAdjustedValue(contract = {}, items = [], events = []) {
  let adjustedValue = calculateInitialValue(contract, items);

  calculateFormalizedEvents(events)
    .filter((event) => event.eventType === "reajuste" || event.tipo === "reajuste")
    .filter((event) => event.affectsInitialAdjustedValue !== false)
    .sort(compareEventsByDate)
    .forEach((event) => {
      if (event.adjustedValueAfter != null && event.adjustedValueAfter !== "") {
        adjustedValue = toContractNumber(event.adjustedValueAfter);
        return;
      }

      if (event.impactValue != null && event.impactValue !== "") {
        adjustedValue += toContractNumber(event.impactValue);
        return;
      }

      const percentage = toContractNumber(event.percentage ?? event.percentual);
      if (percentage) adjustedValue += adjustedValue * (percentage / 100);
    });

  return roundMoney(adjustedValue);
}

function compareEventsByDate(a = {}, b = {}) {
  const da = parseDate(a.effectiveDate ?? a.data_evento ?? a.date ?? a.createdAt ?? a.created_at);
  const db = parseDate(b.effectiveDate ?? b.data_evento ?? b.date ?? b.createdAt ?? b.created_at);
  const ta = da ? da.getTime() : 0;
  const tb = db ? db.getTime() : 0;
  if (ta !== tb) return ta - tb;
  return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

export function calculateFormalizedAdditions(events = []) {
  return roundMoney(calculateFormalizedEvents(events)
    .filter((event) => (event.eventType === "aditivo" || event.tipo === "aditivo") && event.affectsValue !== false)
    .reduce((total, event) => total + calculateEventImpactValue(event), 0));
}

export function calculateFormalizedSuppressions(events = []) {
  return roundMoney(calculateFormalizedEvents(events)
    .filter((event) => (event.eventType === "supressao" || event.tipo === "supressao") && event.affectsValue !== false)
    .reduce((total, event) => total + Math.abs(calculateEventImpactValue(event)), 0));
}

export function calculateCurrentContractValue(contract = {}, items = [], events = []) {
  return roundMoney(
    calculateInitialAdjustedValue(contract, items, events) +
    calculateFormalizedAdditions(events) -
    calculateFormalizedSuppressions(events)
  );
}

export function calculateAdditiveLimit(contract = {}, items = [], events = []) {
  return roundMoney(calculateInitialAdjustedValue(contract, items, events) * 0.25);
}

export function calculateAvailableAdditiveBalance(contract = {}, items = [], events = []) {
  return roundMoney(calculateAdditiveLimit(contract, items, events) - calculateFormalizedAdditions(events));
}

export function calculateRemainingMonths(contractEndDate, additiveStartDate) {
  const start = parseDate(additiveStartDate);
  const end = parseDate(contractEndDate);
  if (!start || !end || start > end) return 0;

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(months, 0);
}

export function calculateAdditiveImpact(contract = {}, item = {}, additiveData = {}) {
  const quantity = toContractNumber(additiveData.quantityChange ?? additiveData.quantityAdded ?? additiveData.quantidade);
  const unitValue = toContractNumber(additiveData.unitValue ?? item.currentUnitValue ?? item.valor_unitario_atual ?? item.valor_unit);
  const monthlyUnitValue = toContractNumber(additiveData.monthlyUnitValue ?? item.monthlyUnitValue ?? unitValue);
  const usesRemainingMonths = additiveData.usesRemainingMonths ?? contract.usesRemainingMonths ?? isMonthlyContract(contract);

  if (usesRemainingMonths) {
    const months = additiveData.monthsConsidered ?? calculateRemainingMonths(
      additiveData.contractEndDate ?? contract.endDate ?? contract.vencimento,
      additiveData.startDate ?? additiveData.effectiveDate
    );
    return roundMoney(quantity * monthlyUnitValue * toContractNumber(months));
  }

  return roundMoney(quantity * unitValue);
}

export function calculateSuppressionImpact(contract = {}, item = {}, suppressionData = {}) {
  return Math.abs(calculateAdditiveImpact(contract, item, suppressionData));
}

export function calculateCurrentItemQuantity(item = {}, events = []) {
  const originalQuantity = toContractNumber(item.originalQuantity ?? item.qtde_original ?? item.qtde);
  const delta = calculateFormalizedEvents(events).reduce((total, event) => {
    const type = event.eventType ?? event.tipo;
    if (type !== "aditivo" && type !== "supressao") return total;
    return total + (event.items || [])
      .filter((eventItem) => String(eventItem.itemId ?? eventItem.item_id) === String(item.id))
      .reduce((itemTotal, eventItem) => itemTotal + toContractNumber(eventItem.quantityChange ?? eventItem.quantidade_alterada), 0);
  }, 0);
  return roundMoney(originalQuantity + delta);
}

export function calculateCurrentItemUnitValue(item = {}, events = []) {
  let unitValue = toContractNumber(item.currentUnitValue ?? item.originalUnitValue ?? item.valor_unitario_atual ?? item.valor_unit);

  calculateFormalizedEvents(events)
    .filter((event) => event.eventType === "reajuste" || event.tipo === "reajuste")
    .forEach((event) => {
      const itemEvent = (event.items || []).find((eventItem) => String(eventItem.itemId ?? eventItem.item_id) === String(item.id));
      if (itemEvent?.unitValueAfter != null) {
        unitValue = toContractNumber(itemEvent.unitValueAfter);
        return;
      }
      const percentage = toContractNumber(itemEvent?.percentage ?? event.percentage ?? event.percentual);
      if (percentage) unitValue += unitValue * (percentage / 100);
    });

  return roundMoney(unitValue);
}

export function calculateMeasurementValue(contract = {}, measurementData = {}) {
  const itemsValue = (measurementData.items || []).reduce((total, item) => {
    const quantity = toContractNumber(item.acceptedQuantity ?? item.quantidade_aceita ?? item.executedQuantity ?? item.quantidade_executada ?? item.quantity);
    const unitValue = toContractNumber(item.unitValue ?? item.valor_unitario);
    const totalValue = item.totalValue ?? item.valor_total;
    return total + (totalValue != null ? toContractNumber(totalValue) : quantity * unitValue);
  }, 0);

  const grossValue = measurementData.grossValue ?? measurementData.valor_bruto ?? itemsValue;
  const glosaValue = measurementData.glosaValue ?? measurementData.valor_glosa ?? measurementData.glosa ?? 0;
  return roundMoney(toContractNumber(grossValue) - toContractNumber(glosaValue));
}

export function calculateMeasurementGrossValue(measurementData = {}) {
  if (measurementData.grossValue != null || measurementData.valor_bruto != null) {
    return roundMoney(measurementData.grossValue ?? measurementData.valor_bruto);
  }

  return roundMoney((measurementData.items || []).reduce((total, item) => {
    const quantity = toContractNumber(item.acceptedQuantity ?? item.quantidade_aceita ?? item.executedQuantity ?? item.quantidade_executada ?? item.quantity);
    const unitValue = toContractNumber(item.unitValue ?? item.valor_unitario);
    const totalValue = item.totalValue ?? item.valor_total;
    return total + (totalValue != null ? toContractNumber(totalValue) : quantity * unitValue);
  }, 0));
}

export function calculateMeasurementNetValue(measurementData = {}) {
  const grossValue = calculateMeasurementGrossValue(measurementData);
  const glosaValue = toContractNumber(measurementData.glosaValue ?? measurementData.valor_glosa ?? measurementData.glosa);
  return roundMoney(Math.max(grossValue - glosaValue, 0));
}

export function calculateExecutedValue(contract = {}, measurements = []) {
  const approvedStatuses = ["aprovada", "aprovada_pelo_fiscal", "aprovada_com_glosa", "validada", "encaminhada"];
  return roundMoney((measurements || [])
    .filter((measurement) => approvedStatuses.includes(String(measurement.status || "").toLowerCase()))
    .reduce((total, measurement) => total + calculateMeasurementValue(contract, measurement), 0));
}

export function calculateExecutedValueFromMeasurements(measurements = [], contract = {}) {
  return calculateExecutedValue(contract, measurements);
}

export function calculateApprovedInvoiceValue(invoices = []) {
  return roundMoney((invoices || [])
    .filter((invoice) => ["aprovada", "aprovada_com_glosa", "encaminhada_para_pagamento"].includes(String(invoice.status || "").toLowerCase()))
    .reduce((total, invoice) => total + toContractNumber(invoice.approvedValue ?? invoice.valor_aprovado ?? invoice.grossValue ?? invoice.valor_total), 0));
}

export function calculateContractBalance(contract = {}, items = [], events = [], measurements = []) {
  return roundMoney(calculateCurrentContractValue(contract, items, events) - calculateExecutedValue(contract, measurements));
}

export function calculateContractFinancialSummary(contract = {}, items = [], events = [], measurements = [], invoices = []) {
  const initialValue = calculateInitialValue(contract, items);
  const initialAdjustedValue = calculateInitialAdjustedValue(contract, items, events);
  const formalizedAdditions = calculateFormalizedAdditions(events);
  const formalizedSuppressions = calculateFormalizedSuppressions(events);
  const currentValue = calculateCurrentContractValue(contract, items, events);
  const additiveLimit = calculateAdditiveLimit(contract, items, events);
  const availableAdditiveBalance = calculateAvailableAdditiveBalance(contract, items, events);
  const additiveContractPercent = initialAdjustedValue > 0 ? roundMoney((formalizedAdditions / initialAdjustedValue) * 100) : 0;
  const additiveLimitUsagePercent = additiveLimit > 0 ? roundMoney((formalizedAdditions / additiveLimit) * 100) : 0;
  const executedValue = calculateExecutedValue(contract, measurements);
  const approvedInvoiceValue = calculateApprovedInvoiceValue(invoices);

  return {
    initialValue,
    initialAdjustedValue,
    formalizedAdditions,
    formalizedSuppressions,
    currentValue,
    additiveLimit,
    availableAdditiveBalance,
    executedValue,
    approvedInvoiceValue,
    contractBalance: roundMoney(currentValue - executedValue),
    additiveContractPercent,
    additiveLimitUsagePercent,
    additiveLimitUsedPercent: additiveLimitUsagePercent
  };
}

function calculateEventImpactValue(event = {}) {
  if (event.impactValue != null && event.impactValue !== "") return toContractNumber(event.impactValue);
  return (event.items || []).reduce((total, item) => total + toContractNumber(item.impactValue ?? item.valor_impacto), 0);
}

function isMonthlyContract(contract = {}) {
  const paymentModel = String(
    contract.executionPaymentModel ??
    contract.forma_execucao_pagamento ??
    contract.paymentModel ??
    contract.formaPagamento ??
    ""
  ).toLowerCase();
  return ["mensal", "mensal_fixo", "por_competencia", "continuo", "continua", "contínua"].includes(paymentModel);
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value);
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
