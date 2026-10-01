export const chaveRecebimento = r => `${r.tipo}::${r.id}`;
const idsDoTermo = (doc, row) => {
  const key = chaveRecebimento(row);
  const ref = doc.referencias.find(r => chaveRecebimento(r) === key);
  if (!ref) return [];
  return ref.unidades_ids || doc.dados_itens.find(i => chaveRecebimento(i) === key)?.unidades_fisicas?.map(f => f.id) || [];
};
export function estadoRequisicao(docs, row) {
  const historico = [...docs].sort((a, b) => Date.parse(b.gerado_em) - Date.parse(a.gerado_em) || b.gerado_em.localeCompare(a.gerado_em));
  const prontos = historico.filter(d => d.pdf_pronto), incompletos = historico.filter(d => !d.pdf_pronto);
  const cobertos = new Set(), atuais = [];
  let registroCompleto = false;
  // O termo mais novo prevalece para cada bem. Envios de versões anteriores
  // continuam no histórico, mas não valem como envio do PDF que as substituiu.
  for (const doc of prontos) {
    if (registroCompleto) break;
    const ids = idsDoTermo(doc, row), novos = ids.filter(id => !cobertos.has(id));
    if (ids.length && !novos.length) continue;
    const qtde = ids.length ? novos.length : Math.max(0, Number(row.qtde) - cobertos.size);
    if (!qtde) continue;
    atuais.push({ doc, qtde });
    novos.forEach(id => cobertos.add(id));
    if (!ids.length) registroCompleto = true;
  }
  const enviados = atuais.filter(({ doc }) => doc.requisicoes_materiais_emails?.length);
  const qtdeGerada = atuais.reduce((n, a) => n + a.qtde, 0);
  const qtdeEnviada = enviados.reduce((n, a) => n + a.qtde, 0);
  const enviado = atuais.length > 0 && enviados.length === atuais.length;
  const parcial = qtdeEnviada > 0 && qtdeEnviada < Number(row.qtde);
  const anteriorEnviado = historico.some(d => d.requisicoes_materiais_emails?.length);
  const refeitoPendente = atuais.some(({ doc }) => !doc.requisicoes_materiais_emails?.length && emailJaEscrito(doc, historico));
  const status = refeitoPendente ? 'Termo refeito · e-mail pendente' : qtdeEnviada ? parcial ? `Enviado parcialmente (${qtdeEnviada}/${row.qtde})` : 'Enviado ao almoxarifado' : qtdeGerada ? qtdeGerada < Number(row.qtde) ? `Termo parcial (${qtdeGerada}/${row.qtde})` : 'Termo gerado' : incompletos.length ? 'Geração incompleta' : 'Não gerado';
  return { historico, prontos, incompletos, atuais: atuais.map(a => a.doc), enviado, anteriorEnviado, status };
}
export function emailJaEscrito(doc, historico) {
  return historico.some(d => d.requisicoes_materiais_emails?.length && d.referencias.some(a => doc.referencias.some(b =>
    chaveRecebimento(a) === chaveRecebimento(b) && (!a.unidades_ids || !b.unidades_ids || a.unidades_ids.some(id => b.unidades_ids.includes(id)))
  )));
}
export const patrimonios = itens => itens.flatMap(i => i.patrimonios || []).map(p => String(p || '').trim()).filter(Boolean);
export const dataLocal = valor => new Date(valor).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
export function assuntoRequisicao(doc, limite = 180) {
  const nome = String(doc.unidade_snapshot.nome || '').trim();
  const inicio = 'Termo de Requisição - ';
  const lista = [...new Set(patrimonios(doc.dados_itens))];
  const sufixo = lista.length ? ' - Patrimônios ' : ' - Sem patrimônio informado';
  // Reserva espaço para um patrimônio inteiro e o indicador de continuação.
  const maxNome = Math.max(10, limite - inicio.length - sufixo.length - (lista.length ? Math.min(lista[0].length, 40) + 7 : 0));
  const base = inicio + (nome.length > maxNome ? nome.slice(0, maxNome - 1) + '…' : nome) + sufixo;
  if (!lista.length) return base;
  let texto = base;
  for (let n = 0; n < lista.length; n++) {
    const candidato = texto + (n ? ', ' : '') + lista[n];
    const reserva = n < lista.length - 1 ? ', etc.'.length : 0;
    if (candidato.length + reserva > limite) return texto + (n ? ', etc.' : 'etc.');
    texto = candidato;
  }
  return texto;
}
export function emailRequisicao(doc) {
  const u = doc.unidade_snapshot;
  const corpo = [
    'Prezados(as),', '', 'Encaminho o termo de requisição de materiais em reserva para entrega na unidade abaixo.', '',
    `Unidade: ${u.nome}`, `Coordenador(a): ${u.coordenador?.nome || '—'}`,
    `Endereço: ${u.endereco || '—'}`, `Telefone: ${u.telefone || '—'}`,
    ...[u.email && `E-mail da unidade: ${u.email}`, u.coordenador?.email && `E-mail do coordenador: ${u.coordenador.email}`].filter(Boolean), '',
    ...doc.dados_itens.flatMap((i, n) => [
      `${n + 1}. ${i.item || 'Material'}`, `Quantidade: ${i.qtde}`,
      `Patrimônios: ${(i.patrimonios || []).map(p => p || 'Não informado').join(', ') || 'Não informado'}`,
      ...[['Empenho', i.empenho], ['Processo de aquisição/CPL', i.processo], ['Contrato/Ata', i.contrato],
        ['Nota fiscal', i.nota_fiscal], ['AF', i.af]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), ''
    ]),
    ...(doc.observacao ? [`Observações: ${doc.observacao}`, ''] : []),
    `Termo gerado em: ${dataLocal(doc.gerado_em)}`, `Referência: ${doc.id}`, '',
    'Atenciosamente,', doc.solicitante_nome, 'Secretaria da Saúde - Prefeitura de Sorocaba',
    'Telefone: (15) 3238-2421', 'E-mail: Sueq.equipamentos@sorocaba.sp.gov.br'
  ].join('\r\n');
  return { titulo: assuntoRequisicao(doc), corpo };
}
export function referenciasDoDestino(itens, unidadeId, escolhidos) {
  return itens.map(i => {
    const fisicas = i.unidades_fisicas || [];
    if (!fisicas.length) {
      if (i.unidade_id && String(i.unidade_id) !== String(unidadeId)) throw new Error('Selecione somente itens da mesma unidade.');
      return { tipo: i.tipo, id: i.id };
    }
    const ids = fisicas.filter(f => escolhidos.has(f.id));
    if (!ids.length) throw new Error(`Selecione ao menos um bem de ${i.item}.`);
    if (ids.some(f => f.unidade_id && String(f.unidade_id) !== String(unidadeId))) throw new Error('Os bens selecionados pertencem a outra unidade.');
    return { tipo: i.tipo, id: i.id, unidades_ids: ids.map(f => f.id) };
  });
}
