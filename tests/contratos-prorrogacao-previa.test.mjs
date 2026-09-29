import assert from 'node:assert/strict';
import { calculateExtensionPreview as preview } from '../js/modules/contratos/contratos.service.js';

assert.deepEqual(preview('16/09/2026','2027-09-16',13502.10), {
  startDate:'2026-09-17',endDate:'2027-09-16',completePeriods:12,extraDays:0,total:162025.20
});
assert.equal(preview('16/09/2026','2028-09-16',13502.10).total,324050.40);
assert.equal(preview('16/09/2026','2026-09-16',13502.10),null);
assert.equal(preview(null,'2027-09-16',13502.10),null);
assert.equal(preview('16/09/2026','2026-09-01',13502.10),null);
assert.equal(preview('16/09/2026','2026-10-01',3000).total,1500);
assert.equal(preview('30/01/2024','2024-02-28',100).total,100);
assert.equal(preview('28/02/2024','2024-03-28',100).total,100);
assert.equal(preview('16/09/2026','2027-09-16',3000,3).total,12000);
assert.equal(preview('16/09/2026','2027-09-16',0).total,0);
console.log('Prévia de prorrogação: períodos completos, parciais e limites de datas verificados.');
