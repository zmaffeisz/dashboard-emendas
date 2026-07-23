import assert from "node:assert/strict";
import {
  buildContractPeriods,
  calculateRemainingPeriods,
  calculateNextPeriodStart,
  calculateAdditiveImpact
} from "../js/modules/contratos/contratos.calculations.js";

const ciclos24Meses = buildContractPeriods("2026-02-15", "2028-02-14", 3);
assert.equal(ciclos24Meses.length, 8);
assert.deepEqual(ciclos24Meses[0], {
  number: 1,
  startDate: "2026-02-15",
  endDate: "2026-05-14"
});
assert.deepEqual(ciclos24Meses[7], {
  number: 8,
  startDate: "2027-11-15",
  endDate: "2028-02-14"
});

assert.equal(calculateNextPeriodStart("2026-02-15", "2028-02-14", "2026-04-10", 3), "2026-05-15");
assert.equal(calculateRemainingPeriods("2026-02-15", "2028-02-14", "2026-05-15", 3), 7);
assert.equal(calculateRemainingPeriods("2026-02-15", "2028-02-14", "2026-05-16", 3), 6);

assert.equal(calculateAdditiveImpact(
  {
    paymentFrequency: "TRIMESTRAL",
    startDate: "2026-02-15",
    endDate: "2028-02-14"
  },
  { currentUnitValue: 1000 },
  { quantityAdded: 1, effectiveDate: "2026-05-15" }
), 7000);

assert.equal(calculateAdditiveImpact(
  { paymentFrequency: "MENSAL", endDate: "2026-12-31" },
  { currentUnitValue: 1000 },
  { quantityAdded: 1, effectiveDate: "2026-01-01" }
), 12000);

console.log("contratos-periodicidade: ok");
