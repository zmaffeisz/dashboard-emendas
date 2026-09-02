# Testes — dashboard-emendas

> Estado atual: **não há suíte de testes automatizados** (sem framework, sem
> `package.json`, sem CI). A validação é **manual**. Este documento descreve o que existe
> e propõe um roteiro de testes manuais.

## 1. Situação atual

- ❌ Sem testes unitários / e2e / integração automatizados.
- ❌ Sem pipeline de CI.
- ✅ Validação manual por tela (memória do projeto registra "teste final pendente" e
  vários lotes de melhorias "aguardando teste com login").

## 2. Roteiro de teste manual (smoke)

### Regressão — edição de itens livres na emenda

- `node tests/emenda-edicao-livre.test.mjs`: valida alterações, exclusões e bloqueios.
- Abrir `tests/emenda-edicao-livre.html` e `tests/emenda-edicao-modal.html` via HTTP:
  devem mostrar **TODOS OS TESTES PASSARAM**, sem gravar no banco.
- `tests/emenda-edicao-livre.sql`: somente em transação com ROLLBACK, carregando a
  migration na mesma transação. Usa dados sintéticos e verifica RLS como authenticated,
  vínculo indireto e criado após abrir, edição planejada sem execução fictícia, versão
  desatualizada, exclusão e reversão integral quando um dos itens estiver bloqueado.
- No modal, ajustar quantidade/valor e conferir total; marcar exclusão, desfazer e
  cancelar. Itens vinculados devem mostrar o motivo e controles desabilitados.
- Depois da publicação autorizada, confirmar recarga de Emendas e Saldo após salvar.

### Regressão — modelo e colagem de itens em Nova emenda

- Rodar `python tests/emenda-modelo-listas.test.py`: confere as duas validações de lista,
  seus intervalos/fontes, bloqueio de valores inválidos e integridade do Excel.
- No Excel, clicar em C2 e D2: conferir as setas e as opções de status/unidade. Digitar
  um valor fora da lista deve gerar erro de parada. Repetir em C1001 e D1001.
- Rodar `node tests/emenda-colagem-planilha.test.mjs`: valida colunas, cabeçalho opcional,
  valores brasileiros, agrupamento por item/unidade e rejeição integral de dados inválidos.
- Abrir `tests/emenda-colagem-planilha.html` no servidor local: usa o formulário real,
  testa colagem de texto/tabela HTML, preservação de itens, totais e salvamento simulado,
  sem acessar o banco. Deve mostrar **TODOS OS TESTES PASSARAM**.
- Com login, baixar o modelo em **Nova emenda**, preencher as cinco colunas com nomes
  cadastrados e colar em Item/Descrição. Conferir status vazio, múltiplas unidades,
  resumo e mensagens de linha inválida antes de salvar um cadastro de teste autorizado.

### Regressão — situação operacional em Licitações

- Rodar `node tests/licitacoes-fluxo.test.mjs`: cobre rótulos compartilhados com Emendas,
  recebimento/entrega parcial, cancelamento, consumo, paginação, filtros e as duas exportações.
- Abrir `tests/licitacoes-fluxo-ui.html` no servidor local: simula o carregamento e a
  apresentação sem acessar o banco; deve mostrar **PASSOU** e quatro etapas distintas.
- Com login, comparar uma aquisição nas abas Emendas e Licitações e nos dois Excel.
  Conferir recebimento interno, confirmação na unidade e suas datas. Para processos
  totalmente contratados, marcar **Incluir já contratadas**.

Pré-requisito: servir via `python -m http.server 8765` e ter usuários de teste
(admin + comum) no Supabase. Ver [DEPLOYMENT.md](DEPLOYMENT.md).

### Autenticação e permissões
- [ ] Login com credenciais válidas/ inválidas (`login.html`).
- [ ] Auto-cadastro cria `profiles` com `papel=visualizador` (`cadastro.html`).
- [ ] Conta nova só vê a aba **Emendas**.
- [ ] Admin enxerga todas as abas; libera caixinhas em **Usuários** e o usuário comum
      passa a ver/editar conforme `user_tab_permissions`.
- [ ] `usuarios` e `cadastros` invisíveis para não-admin.

### Fluxo principal (Emenda → … → Entrega)
- [ ] Criar emenda + itens (aba Emendas); conferir **Saldo das Emendas**.
- [ ] Vincular item a processo (Licitações); status viaja por item.
- [ ] Criar processo escolhendo uma categoria padrão; repetir criando uma categoria nova
      e confirmar que ela aparece em Cadastros para revisão e que um nome equivalente não duplica.
- [ ] Criar contrato (matriz **Contratos**); para `tipo=ATA`, itens **espelhados** em
      `atas_itens`.
- [ ] Confirmar a mesma categoria no item, contrato e item da ATA; filtrar por ela em
      Licitações, Atas Rp e Inventário e validar também as exportações Excel.
- [ ] Abrir aba **Atas Rp** e confirmar que reflete alterações de Contratos (encerrar/
      prorrogar/editar) — reload automático.
- [ ] Em um item de ATA com pedidos sem AF, com AF aguardando recebimento e já recebidos,
      registrar **Trocar marca**, selecionar apenas parte dos pedidos abertos e confirmar:
      a nova marca deve aparecer nos selecionados e em novos pedidos, enquanto os pedidos
      não selecionados e recebidos conservam a marca anterior. Repetir em um item encerrado
      com entrega aberta e conferir referência, data e quantidade no histórico.
- [ ] Vincular empenho antes da AF e emitir AF (aba **Controle de Entregas**).
- [ ] Após emitir AF de aquisição, confirmar que o item sai de **Controle de Entregas /
      Prazos** e aparece em **Confirmação de Entrega na Unidade** com AF e empenho
      herdado.
- [ ] Confirmar entrega na unidade (data, responsável, termo) e voltar para **Emendas**:
      o item deve mostrar status derivado do fluxo, data de entrega, empenho/NF/patrimônio
      quando existirem; item sem AF deve aparecer como "aguardando AF".
- [ ] Em um recebimento de ATA originado por **Carona**, conferir na subaba **Confirmação de
      Entrega na Unidade** o botão de e-mail; o destinatário deve ser o solicitante cadastrado,
      com cópia para `sueq.equipamentos@sorocaba.sp.gov.br`, e o corpo deve trazer Ata, NF
      marcada como anexa, item, quantidade e os contatos do Almoxarifado.
- [ ] Após receber e confirmar uma execução de ATA com origem **Carona**, conferir que ela
      continua visível nas execuções e na confirmação, mas não aparece na aba **Inventário**
      e não possui linha em `inventario_unidades`.
- [ ] Registrar recebimento/NF quando aplicável (aba **Controle de Entregas**).
- [ ] Recebimento de **bem permanente**: perguntar se possui patrimônio e gerar uma linha
      física por unidade em `itens_entregas_unidades`/`atas_execucao_unidades`, sempre com
      quantidade 1, mesmo quando patrimônio/série estiverem vazios.
- [ ] Recebimento de **material de consumo**: ocultar patrimônio, não criar unidades físicas,
      não listar em **Confirmação de Entrega na Unidade** nem no Inventário e manter a
      quantidade aglutinada no registro pai.
- [ ] Inventário legado: nenhuma linha pode representar quantidade maior que 1; conferir
      que execuções históricas foram expandidas pela quantidade recebida.
- [ ] Transferir uma unidade física com termo: o Inventário deve mostrar a nova localização,
      a ficha deve acrescentar o evento e a aba Emendas deve manter a unidade beneficiada
      original, exibindo somente o asterisco de movimentação.
- [ ] Emprestar e devolver uma unidade: bloquear nova transferência/baixa enquanto estiver
      emprestada; após a devolução, manter os dois eventos e voltar para `ATIVO`.
- [ ] Dar baixa: manter o item consultável como `BAIXADO`, com motivo/documento, e bloquear
      qualquer movimentação posterior.

### Notas Fiscais (anti-duplicidade)
- [ ] Cadastrar NF uma vez (`notas_fiscais.valor_total`).
- [ ] Ratear em `nota_fiscal_itens`.
- [ ] Distribuir entre unidades **sem** o saldo somar o valor da NF mais de uma vez.

### Chamados
- [ ] Abrir chamado público em `chamado.html` (sem login) → RPC `abrir_chamado_publico`.
- [ ] Chamado órfão sem controle aparece como "não aberto" (não cria controle automático).
- [ ] Chamados Antigos: somente leitura.

### Sanções / Fiscalização / Inventário
- [ ] Solicitar e aplicar sanção vinculada a contrato.
- [ ] Fiscalização: termos de ateste e glosa.
- [ ] Inventário lista equipamentos por unidade.

## 3. Verificações de banco (sanidade)

- [ ] `vw_emendas_saldo`: `saldo_remanescente = valor_cedido − comprometido`.
- [ ] FKs sem órfãos (ver lista em [DATABASE.md](DATABASE.md#chaves-estrangeiras)).
- [ ] `get_advisors` (segurança/performance) sem alertas críticos.
- [ ] Trigger `trg_ieu_sync` mantém agregados em `itens_entregas`.

## 4. Recomendações futuras

- Introduzir testes e2e leves (Playwright) cobrindo login + fluxo principal.
- Smoke test SQL (script que valida views e integridade) executável via CI.
- Checklist de regressão por release (este roteiro pode virar base).
