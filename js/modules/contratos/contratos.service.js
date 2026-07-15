export function getContratosServiceStatus() {
  return "legacy-compatible";
}

export {
  CONTRACT_COLLECTION_KEYS,
  CONTRACT_MODELS,
  PROCUREMENT_ORIGINS,
  EXECUTION_PAYMENT_MODELS,
  INSTRUMENT_TYPES,
  CONTRACT_EVENT_TYPES,
  CONTRACT_EVENT_STATUSES,
  FORMALIZED_EVENT_STATUSES,
  MEASUREMENT_STATUSES,
  INVOICE_STATUSES,
  DOCUMENT_TYPES,
  createContractRecord,
  createContractItem,
  createContractEvent,
  createContractMeasurement,
  createContractMeasurementItem,
  createContractGlosa,
  createContractInvoice,
  createContractDocument,
  createContractHistoryEntry,
  findContractById,
  getContractBundle
} from "./contratos.data.js";

export {
  toContractNumber,
  roundMoney,
  isFormalizedEvent,
  calculateInitialValue,
  calculateFormalizedEvents,
  calculateInitialAdjustedValue,
  calculateFormalizedAdditions,
  calculateFormalizedSuppressions,
  calculateCurrentContractValue,
  calculateAdditiveLimit,
  calculateAvailableAdditiveBalance,
  calculateRemainingMonths,
  calculateAdditiveImpact,
  calculateSuppressionImpact,
  calculateCurrentItemQuantity,
  calculateCurrentItemUnitValue,
  calculateMeasurementValue,
  calculateMeasurementGrossValue,
  calculateMeasurementNetValue,
  calculateExecutedValue,
  calculateExecutedValueFromMeasurements,
  calculateApprovedInvoiceValue,
  calculateContractBalance,
  calculateContractFinancialSummary
} from "./contratos.calculations.js";
