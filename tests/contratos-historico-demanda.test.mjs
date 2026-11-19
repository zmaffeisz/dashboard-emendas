import assert from 'node:assert/strict';
import {normalizeHistoricoDemanda,historicalInvoiceAllocations,historicoDemandaResumoHtml} from '../js/modules/contratos/historico-demanda.js';
import {calculateExecutedValue,calculateApprovedInvoiceValue} from '../js/modules/contratos/contratos.calculations.js';
import {filterFinanceiroRows,summarizeFinanceiroRows} from '../js/modules/contratos/financeiro.workspace.js';
const config={contrato_id:1,vigencia_atual_id:'nova',compensar_quantidades:true,observacoes:'<script>'};
const history=[
 {id:'m1',contrato_id:1,vigencia_id:'antiga',nota_fiscal_id:'nf1',valor_liquido:30,quantidades_informadas:false,vigencia:{numero:1,valor_total:50}},
 {id:'m2',contrato_id:1,vigencia_id:'nova',nota_fiscal_id:'nf1',valor_liquido:70,vigencia:{numero:2,valor_total:200},contratos_medicoes_historicas_itens:[{item_id:'i',categoria_operacional:'Doppler',quantidade:12,valor_unitario_referencia:100}]}
];
const meds=normalizeHistoricoDemanda(history,[config]);
assert.equal(calculateExecutedValue({},meds),70,'Vigência anterior não abate atual');
assert.equal(meds[1].valor_bruto,null,'Não transformar quantidade x preço em bruto');
assert.equal(meds[1].contratos_medicao_itens[0].valor_unitario,null);
assert.equal(meds[0].contratos_medicao_itens.length,0,'Quantidade desconhecida não vira zero');
const nf=[{id:'nf1',origem_sistema:'historico_liquido',valor_liquido:100,status:'historico_importado'}];
assert.equal(calculateApprovedInvoiceValue(nf),0,'Histórico não é aprovação');
assert.equal(historicalInvoiceAllocations(nf,meds)[0].historico_liquido_rateado,100,'NF única, dois rateios');
assert.equal(historicalInvoiceAllocations(nf,meds,'nova')[0].historico_liquido_rateado,70);
assert.equal(historicalInvoiceAllocations(nf,meds,'antiga')[0].historico_liquido_rateado,30);
assert.equal(historicalInvoiceAllocations(nf,meds,'outra')[0].historico_medicoes.length,0);
const filters={vigencia:'nova',search:'',sort:'recentes'};
assert.equal(filterFinanceiroRows(meds.map(m=>({...m,contract:{id:1},sortDate:'2024-11',search:''})),filters).length,1);
assert.equal(summarizeFinanceiroRows([{status:'historico_importado',net:70,linked:true,gross:null}],'notas').valid,0);
assert.equal(summarizeFinanceiroRows([{status:'historico_importado',net:70,linked:true,gross:null}],'medicoes').valid,70);
const html=historicoDemandaResumoHtml(history,config);
assert.ok(html.includes('&lt;script&gt;'));
assert.ok(html.includes('Saldos quantitativos negativos permitidos'));
assert.equal(calculateExecutedValue({},[{status:'rascunho',valor_bruto:100},{status:'aprovada_pelo_fiscal',valor_bruto:80,valor_glosa:5}]),75,'Fluxo normal preservado');
console.log('PASSOU: líquido sem bruto fictício, NF única rateada, vigências isoladas e histórico sem aprovação.');
