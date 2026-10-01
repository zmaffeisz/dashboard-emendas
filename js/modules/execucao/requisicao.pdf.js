import { dataLocal } from './requisicao.model.js?v=20260930-1';

function linhas(texto, fonte, tamanho, largura) {
  const resultado = [];
  for (const paragrafo of String(texto || '').split(/\r?\n/)) {
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/)) {
      const candidato = atual ? atual + ' ' + palavra : palavra;
      if (fonte.widthOfTextAtSize(candidato, tamanho) <= largura) atual = candidato;
      else {
        if (atual) resultado.push(atual);
        atual = '';
        for (const letra of palavra) {
          if (fonte.widthOfTextAtSize(atual + letra, tamanho) > largura) { resultado.push(atual); atual = ''; }
          atual += letra;
        }
      }
    }
    resultado.push(atual);
  }
  return resultado;
}
// O cabeçalho vem do PDF fornecido. Dados variáveis são desenhados nas mesmas posições.
export async function gerarPdfRequisicao(doc, PDFLib, modelo) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.create();
  const [template, avisoModelo, cabecalhoTabela, assinaturaModelo] = await pdf.embedPdf(modelo, [0, 1, 2, 3]);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const patrimonioFonte = await pdf.embedFont(StandardFonts.TimesRoman);
  const limpar = s => String(s || '').replace(/[\u2010-\u2015]/g, '-').replace(/→/g, '>').replace(/[^\x20-\x7e\xa0-\xff\n\r]/g, '');
  const u = doc.unidade_snapshot;
  let pagina, topo;
  const texto = (s, x, y, size = 11.04, font = fonte) => pagina.drawText(limpar(s), { x, y: 841.92 - y - size, size, font, color: rgb(0, 0, 0) });
  const linha = (x1, y1, x2, y2, esp = .6) => pagina.drawLine({ start: { x: x1, y: 841.92 - y1 }, end: { x: x2, y: 841.92 - y2 }, thickness: esp, color: rgb(0, 0, 0) });
  const novaPagina = () => {
    pagina = pdf.addPage([595.32, 841.92]);
    pagina.drawPage(template, { x: 0, y: 841.92 - 253, width: 595.32, height: 253 });
    let tam = 12;
    while (fonte.widthOfTextAtSize(limpar(doc.solicitante_nome), tam) > 367 && tam > 8) tam -= .25;
    texto(doc.solicitante_nome, 179.9, 154.58 - tam * .207, tam);
    linha(174.74, 167.06, 557.01, 167.06, .48);
    linha(115.5, 247.5, 494.4, 247.5);
    let y = 258;
    for (const [rotulo, valor] of [['Local', u.nome], ['Responsável', u.coordenador?.nome], ['Endereço', u.endereco], ['Telefone', u.telefone]]) {
      const ls = linhas(limpar(`${rotulo}: ${valor || ''}`), fonte, 11.04, 456);
      linha(79, y + 7, 88, y + 7, .8);
      linha(83, y + 2, 88, y + 7, .8);
      linha(83, y + 12, 88, y + 7, .8);
      ls.forEach((s, n) => texto(s, 92, y - 1.1 + n * 14.64));
      y += Math.max(1, ls.length) * 14.64;
    }
    linha(101, y + 1.5, 500, y + 1.5);
    pagina.drawPage(avisoModelo, { x: 0, y: 841.92 - (y + 15) - 31.5, width: 595.32, height: 31.5 });
    topo = Math.max(388.8, y + 72);
    pagina.drawPage(cabecalhoTabela, { x: 0, y: 841.92 - topo - 36, width: 595.32, height: 36 });
    linha(70.58, topo, 554.74, topo);
    linha(70.58, topo + 18, 554.74, topo + 18);
    linha(70.58, topo, 70.58, topo + 36);
    linha(554.74, topo, 554.74, topo + 36);
    linha(110.4, topo + 18, 110.4, topo + 36);
    linha(425.47, topo + 18, 425.47, topo + 36);
    topo += 36;
  };
  const rodape = (continuacao = false) => {
    let y = topo + 14.2;
    if (continuacao) { texto('Continua na próxima página.', 78, y, 10); return; }
    const observacoes = linhas(limpar('Obs.: ' + (doc.observacao || '')), fonte, 11.04, 460);
    for (const s of observacoes) {
      if (y + 175 > 788) { texto('Observações continuam na próxima página.', 78, y, 9); novaPagina(); y = topo + 15; }
      texto(s, 78, y); y += 14;
    }
    y += 30;
    texto('DATA: ' + dataLocal(doc.gerado_em).replace(/\d{2}(\d{2})$/, '$1'), 78, y);
    const assinatura = Math.max(620, y + 103);
    pagina.drawPage(assinaturaModelo, { x: 0, y: 841.92 - assinatura - 33, width: 595.32, height: 33 });
  };
  novaPagina();
  for (const item of doc.dados_itens) {
    const nomes = linhas(limpar(item.item), fonte, 9, 300);
    const pats = linhas(limpar((item.patrimonios || []).map(p => p || 'Não informado').join('; ') || 'Não informado'), patrimonioFonte, 9.96, 117);
    // Divide inclusive um único item com muitos patrimônios, sem cortar números.
    let offset = 0;
    const total = Math.max(nomes.length, pats.length);
    while (offset < total) {
      let capacidade = Math.floor((660 - topo - 16) / 13);
      if (capacidade < 1) { rodape(true); novaPagina(); capacidade = Math.floor((660 - topo - 16) / 13); }
      const count = Math.min(Math.max(capacidade, 1), total - offset);
      const altura = Math.max(36, count * 13 + 16);
      linha(70.58, topo, 554.74, topo);
      [70.58, 110.4, 425.47, 554.74].forEach(x => linha(x, topo, x, topo + altura));
      const qtd = offset ? '(cont.)' : String(item.qtde).padStart(2, '0');
      texto(qtd, 90.49 - fonte.widthOfTextAtSize(qtd, offset ? 8 : 11.04) / 2, topo + 7, offset ? 8 : 11.04);
      nomes.slice(offset, offset + count).forEach((s, n) => texto(s, 115.82, topo + 12 + n * 13, 9));
      pats.slice(offset, offset + count).forEach((s, n) => texto(s, 490.1 - patrimonioFonte.widthOfTextAtSize(s, 9.96) / 2, topo + 10.84 + n * 13, 9.96, patrimonioFonte));
      topo += altura;
      linha(70.58, topo, 554.74, topo);
      offset += count;
    }
  }
  rodape();
  pdf.setTitle('Requisição de materiais em reserva - ' + u.nome);
  pdf.setAuthor(doc.solicitante_nome);
  pdf.setSubject(doc.id);
  return pdf.save();
}
