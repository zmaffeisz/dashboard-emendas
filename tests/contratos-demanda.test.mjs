import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createContractRecord} from '../js/modules/contratos/contratos.data.js';
import {calculateContractFinancialSummary} from '../js/modules/contratos/contratos.calculations.js';
const source=readFileSync(new URL('../js/legacy/70-fiscalizacao-sancoes-contratos.js',import.meta.url),'utf8');
const names=['_ctModeloKey','_ctFormaKey','_ctEhServicoDemandaContrato','_ctEventStatus','_ctEventType','_ctHistoricoToEvents'];
const context={normalizar:s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),_ctItensAtual:[]};
vm.createContext(context);
for(const name of names){
  const fn=source.match(new RegExp(`function ${name}\\([^]*?^}`,'m'));
  assert.ok(fn,`Função ${name} encontrada`);
  vm.runInContext(fn[0],context);
}
const demanda={modelo_execucao:'por_demanda',status:'VENCIDO',valor_inicial_num:1000,valor_atual_num:1710};
assert.equal(context._ctModeloKey(demanda),'servico_continuo_demanda');
assert.equal(context._ctFormaKey(demanda),'por_demanda');
assert.equal(context._ctEhServicoDemandaContrato(demanda),true);
assert.equal(context._ctModeloKey({periodicidade_pagamento:'MENSAL'}),'servico_continuo_mensal_fixo');
assert.equal(context._ctFormaKey({periodicidade_pagamento:'TRIMESTRAL'}),'trimestral_fixo');
assert.equal(context._ctModeloKey({recebimento_escopo:'parcial'}),'servico_escopo_fechado');
const hist=[
  {tipo:'Memória documental',titulo:'Aditivo de vigência anterior',status_evento:'formalizado',valor_impacto:100},
  {tipo:'Reajuste',status_evento:'formalizado',valor_reajustado:1100,data_evento:'2024-01-01'},
  {tipo:'Aditivo',status_evento:'formalizado',valor_impacto:110},
  {tipo:'Aditivo',status_evento:'formalizado',valor_impacto:200},
  {tipo:'Aditivo',status_evento:'formalizado',valor_impacto:300},
  {tipo:'Prorrogacao',status_evento:'rascunho',valor_impacto:99999}
];
const summary=calculateContractFinancialSummary(createContractRecord(demanda),[],context._ctHistoricoToEvents(hist),[],[]);
assert.equal(summary.currentValue,1710,'Memória anterior e renovação não formalizada não duplicam o valor atual');
assert.equal(summary.executedValue,0,'Cadastro documental não cria execução');
console.log('PASSOU: demanda reconhecida sem abrir itens, vencido preservado, fluxos próprios e memória de vigência sem duplicidade financeira.');
