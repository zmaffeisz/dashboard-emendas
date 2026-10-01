import assert from 'node:assert/strict';
import { assuntoRequisicao, emailRequisicao, referenciasDoDestino, estadoRequisicao, emailJaEscrito } from '../js/modules/execucao/requisicao.model.js';

const doc = { id: 'teste', gerado_em: '2026-09-30T02:00:00Z', solicitante_nome: 'Patrick Santos Maffei',
  unidade_snapshot: { nome: 'PA Laranjeiras', endereco: 'Rua Sônia Bernuncio, 24', telefone: '3226-9190', coordenador: { nome: 'Erica Juliana Leonor' } },
  dados_itens: [{ item: 'Microondas', qtde: 1, patrimonios: ['399392'], empenho: '23208/2025', processo: 'CPL 055/2024', nota_fiscal: '1695' },
    { item: 'Frigobar', qtde: 1, patrimonios: ['399354'] }] };
assert.equal(assuntoRequisicao(doc), 'Termo de Requisição - PA Laranjeiras - Patrimônios 399392, 399354');
const email = emailRequisicao(doc);
for (const valor of ['399392', '399354', 'Microondas', 'Frigobar', '23208/2025', 'CPL 055/2024', 'Erica Juliana Leonor', '29/09/2026']) assert.ok(email.corpo.includes(valor));
const lote = { ...doc, dados_itens: [{ item: 'Bens', qtde: 100, patrimonios: Array.from({ length: 100 }, (_, n) => '399' + String(n).padStart(3, '0')) }] };
const titulo = assuntoRequisicao(lote);
assert.ok(titulo.length <= 180);
assert.ok(titulo.endsWith(', etc.'));
const mencionados = titulo.split('Patrimônios ')[1].replace(/, etc\.$/, '').split(', ');
assert.ok(mencionados.every(p => lote.dados_itens[0].patrimonios.includes(p)), 'Nenhum patrimônio pode ser cortado.');
assert.ok(emailRequisicao(lote).corpo.includes('399099'), 'O corpo precisa conter inclusive os patrimônios omitidos do título.');
assert.ok(assuntoRequisicao({ ...lote, unidade_snapshot: { nome: 'Nome comprido '.repeat(100) } }).length <= 180);
const itens = [{ tipo: 'ATA', id: 'recebimento', unidade_id: null, unidades_fisicas: [
  { id: 'a', unidade_id: 38 }, { id: 'b', unidade_id: 27 }, { id: 'c', unidade_id: null }
] }];
assert.deepEqual(referenciasDoDestino(itens, 38, new Set(['a'])), [{ tipo: 'ATA', id: 'recebimento', unidades_ids: ['a'] }]);
assert.throws(() => referenciasDoDestino(itens, 38, new Set(['a', 'b'])), /outra unidade/);
assert.throws(() => referenciasDoDestino(itens, 38, new Set()), /ao menos um bem/);
assert.throws(() => referenciasDoDestino([{ tipo: 'Aquisição', id: 'legado', unidade_id: 27 }], 38, new Set()), /mesma unidade/);
console.log('PASSOU: assunto limitado sem cortar patrimônios, corpo completo, data local e seleção de bens do mesmo destino.');

const row = { tipo: 'ATA', id: 'recebimento', qtde: 1 };
const antigo = { ...structuredClone(doc), id: 'v1', gerado_em: '2026-10-01T13:00:00Z', pdf_pronto: true,
  referencias: [{ ...row, unidades_ids: ['bem-a'] }], requisicoes_materiais_emails: [] };
assert.equal(estadoRequisicao([], row).status, 'Não gerado');
assert.equal(estadoRequisicao([antigo], row).enviado, false);
assert.equal(estadoRequisicao([antigo], row).status, 'Termo gerado');
antigo.requisicoes_materiais_emails.push({ id: 'email1', titulo: 'Título antigo', corpo: 'Texto original' });
assert.equal(estadoRequisicao([antigo], row).enviado, true);
const original = JSON.stringify(antigo);
const novo = { ...structuredClone(antigo), id: 'v2', gerado_em: '2026-10-01T14:00:00Z', requisicoes_materiais_emails: [] };
const refeito = estadoRequisicao([antigo, novo], row);
assert.deepEqual(refeito.atuais.map(d => d.id), ['v2']);
assert.equal(refeito.enviado, false, 'Envio da versão anterior não pode marcar a nova como enviada.');
assert.equal(refeito.status, 'Termo refeito · e-mail pendente');
assert.ok(emailJaEscrito(novo, [antigo, novo]));
assert.equal(JSON.stringify(antigo), original, 'Consultar o estado não pode modificar o termo nem e-mails anteriores.');
novo.requisicoes_materiais_emails.push({ id: 'email2' });
assert.equal(estadoRequisicao([antigo, novo], row).enviado, true);
const draft = { ...structuredClone(novo), id: 'v3', gerado_em: '2026-10-01T15:00:00Z', pdf_pronto: false, requisicoes_materiais_emails: [] };
assert.equal(estadoRequisicao([draft, antigo, novo], row).atuais[0].id, 'v2', 'Falha na nova geração não invalida o PDF concluído.');
const outroBem = { ...structuredClone(novo), id: 'outro', referencias: [{ ...row, unidades_ids: ['bem-b'] }], requisicoes_materiais_emails: [] };
assert.equal(emailJaEscrito(outroBem, [antigo]), false, 'O e-mail de outro bem do pedido não significa reescrita deste.');
const parcial = estadoRequisicao([antigo, outroBem], { ...row, qtde: 2 });
assert.equal(parcial.status, 'Enviado parcialmente (1/2)');
assert.equal(parcial.enviado, false);
console.log('PASSOU: etapas da requisição, nova versão com e-mail pendente, preservação do histórico e cobertura parcial dos bens.');
