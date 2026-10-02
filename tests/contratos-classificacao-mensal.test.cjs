const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/legacy/70-fiscalizacao-sancoes-contratos.js','utf8');
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,{value:'',style:{}});return elements.get(id)};
const updates=[];const messages=[];let admin=true,refreshes=0;
const ctx=vm.createContext({
  document:{getElementById:el},window:{ContratosFinanceiro:{refresh:async()=>refreshes++}},
  _isAdmin:()=>admin,_ctEhTrimestral:c=>c?.periodicidade_pagamento==='TRIMESTRAL',
  contratosRows:[{id:312,numero_contrato:'118/2026'}],_secoesOrganizacionais:[],
  showMsg:(...args)=>messages.push(args),sb:{from:()=>({update:row=>({eq:async(_,id)=>{updates.push({row,id});return {error:null}}})})},
  contratosCarregado:true,loadContratos:async()=>{},atasContratos:[],setTimeout:()=>{}
});
vm.runInContext(source.slice(source.indexOf('let _ctEdicaoId=null;'),source.indexOf('let _ctEmailId=null;')),ctx);
vm.runInContext('_ctEdicaoId=312;',ctx);
el('ec-fiscalizacao').selectedOptions=[{value:'Patrick Santos Maffei'},{value:'Maria Silva'}];
el('ec-numero').value='118/2026';el('ec-tipo').value='CONTRATO';el('ec-classificacao').value='mensal_fixo';
(async()=>{
  await ctx.salvarEdicaoContrato();
  assert.equal(updates.length,1);assert.equal(updates[0].id,312);assert.equal(updates[0].row.fiscalizacao,'Patrick Santos Maffei, Maria Silva');
  assert.equal(updates[0].row.periodicidade_pagamento,'MENSAL');
  assert.equal(updates[0].row.modelo_execucao,'continuo_mensal_fixo');assert.equal(refreshes,1);
  el('ec-classificacao').value='';await ctx.salvarEdicaoContrato();
  assert(!('periodicidade_pagamento' in updates[1].row));assert(!('modelo_execucao' in updates[1].row));
  el('ec-classificacao').value='mensal_fixo';admin=false;await ctx.salvarEdicaoContrato();assert.equal(updates.length,2);
  admin=true;ctx.contratosRows[0].periodicidade_pagamento='TRIMESTRAL';await ctx.salvarEdicaoContrato();assert.equal(updates.length,2);
  ctx.contratosRows[0].periodicidade_pagamento=null;el('ec-tipo').value='ATA';await ctx.salvarEdicaoContrato();assert.equal(updates.length,2);
  assert(messages.some(m=>String(m[1]).includes('exclusiva')));
  console.log('Classificação mensal: gravação de ambos os campos, preservação, atualização financeira e bloqueios admin/ATA/trimestral validados.');
})().catch(e=>{console.error(e);process.exitCode=1});
