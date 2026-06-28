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
- [ ] Criar contrato (matriz **Contratos**); para `tipo=ATA`, itens **espelhados** em
      `atas_itens`.
- [ ] Abrir aba **Atas Rp** e confirmar que reflete alterações de Contratos (encerrar/
      prorrogar/editar) — reload automático.
- [ ] Vincular empenho antes da AF e emitir AF (aba **Controle de Entregas**).
- [ ] Após emitir AF de aquisição, confirmar que o item sai de **Controle de Entregas /
      Prazos** e aparece em **Confirmação de Entrega na Unidade** com AF e empenho
      herdado.
- [ ] Confirmar entrega na unidade (data, responsável, termo) e voltar para **Emendas**:
      o item deve mostrar status derivado do fluxo, data de entrega, empenho/NF/patrimônio
      quando existirem; item sem AF deve aparecer como "aguardando AF".
- [ ] Registrar recebimento/NF quando aplicável (aba **Controle de Entregas**).
- [ ] Recebimento por unidade física (`itens_entregas_unidades`): patrimônio/série por
      unidade.

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
