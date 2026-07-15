# AGENTS.md — orientações para agentes/IA

> **Ambiente atual:** este código está em produção no Supabase
> `qpvgpfwuurqcqprnpxua` (`contratos-dag`). O projeto
> `djtwoesmgeetnrztyvzw` é legado, está congelado e permanece estritamente somente leitura.

Guia para assistentes de IA (Codex e afins) que trabalham neste repositório.
Documentação humana completa em [`/docs`](docs/) e [README.md](README.md).

## O que é o projeto

`dashboard-emendas`: app **web estático** (HTML/CSS/JS *vanilla*, **sem framework, sem
build, sem `package.json`**) + **Supabase** (PostgreSQL na nuvem, Auth, Storage, RLS).
Gestão de emendas parlamentares → licitações → contratos → atas → execução/entrega →
chamados, da Secretaria da Saúde de Sorocaba.

## Mapa rápido

- `index.html` — **casca da SPA principal** (~2,5k linhas após refatoração estrutural).
  Mantém o HTML das abas/modais, carrega CSS/JS externos e segue usando abas via
  `showTab('<name>')` e painéis `#panel-<name>`.
- `js/legacy/` — JavaScript legado extraído do antigo monólito, dividido por domínio e
  carregado em ordem por scripts clássicos. O cliente Supabase global `sb` ainda nasce em
  `js/legacy/00-core.js`; muitos handlers inline ainda dependem de funções globais.
- `js/theme.js` — alternância de tema.
- `js/app.js` — entrada `type="module"` sem regra de negócio; importa a base de estado e
  serve como ponto de partida para migração gradual para módulos nativos.
- `js/modules/` — destino dos módulos funcionais futuros (`*.render.js`, `*.events.js`,
  `*.service.js`). Por enquanto contém stubs/estrutura; a lógica real ainda está em
  `js/legacy/`.
- `js/state/` — base inicial de `store`, seletores e validadores compartilhados.
- `js/components/` — destino de componentes vanilla reutilizáveis.
- `styles.css`, `dashboard.css`, `chamado.css` — estilos da aplicação. `css/print-*.css`
  concentra estilos de documentos/impressão extraídos das strings JS.
- `login.html`, `cadastro.html` — auth. `chamado.html` — formulário público (RPC).
- `supabase/migrations/` — migrations. `schema*.sql` — dumps.
- Banco nuvem de produção: projeto **`qpvgpfwuurqcqprnpxua`** (`contratos-dag`). O projeto legado **`djtwoesmgeetnrztyvzw`** (`zmaffeisz's Project`) não deve receber novas escritas.

## Trava obrigatória de ambiente Supabase

Este checkout usa o Supabase de produção **`qpvgpfwuurqcqprnpxua`** (`contratos-dag`).
Qualquer operação executável no Supabase deve mirar somente esse projeto:

- **produção oficial, permitido para execução/escrita:** `qpvgpfwuurqcqprnpxua` (`contratos-dag`);
- **legado congelado, proibido executar/escrever:** `djtwoesmgeetnrztyvzw` (`zmaffeisz's Project`).

Antes de rodar SQL, migrations, seeds, RPCs, Edge Functions, Storage, Auth Admin,
alterações de RLS, DDL ou DML, confirme que o `project_id`/URL é
`qpvgpfwuurqcqprnpxua` / `https://qpvgpfwuurqcqprnpxua.supabase.co`.

Não use dumps, comentários antigos, `.supabase/config.toml`, histórico de migrations ou
valores hardcoded antigos para trocar o alvo para o projeto legado. Se for necessário
comparar/copiar algo do banco legado, faça somente leitura e apenas quando o usuário pedir
explicitamente; qualquer escrita continua restrita ao `contratos-dag`.

## Convenções e fatos que orientam mudanças

- **Fonte única da verdade no banco.** Abas são views; alterações refletem por
  recarregamento e espelhamento. A aba **Atas Rp** é item próprio do menu (seção
  "Contratos"), **derivada da matriz `contratos`** — **não** é subaba de Contratos. Ela
  recarrega sempre (`loadAtas`).
- **Contratos** (`contratos`) é a **matriz** de todo instrumento (`tipo_instrumento` =
  `CONTRATO`|`ATA`).
- **Valores monetários:** usar os campos numéricos `valor_*_num` em `contratos` (os `valor_*`
  texto são legado).
- **Notas Fiscais (anti-duplicidade):** valor total em `notas_fiscais.valor_total` (1x);
  rateio em `nota_fiscal_itens`; `itens_entregas_unidades` referencia a NF **sem** valor.
  Nunca modele de forma que o valor da NF seja somado por unidade.
- **Solicitação parcial de ATA com origem em Emenda:** nunca reduzir a linha inteira da
  emenda para a quantidade solicitada. Dividir `emenda_itens`: a fração solicitada fica
  vinculada à `atas_execucao` e o saldo restante vira nova linha livre para solicitação.
- **Patrimônio/série por unidade física:** enquanto não houver patrimônio/série
  preenchido, Emendas e Inventário podem mostrar o item consolidado. Depois do
  recebimento com patrimônio/série, mostrar uma linha por unidade física. Aquisições usam
  `itens_entregas_unidades`; ATAs usam `atas_execucao_unidades`.
- **Permissões:** `admin` (total) vs. usuário comum (caixinhas em `user_tab_permissions`).
  RLS no banco é autoritativa (`can_access_tab`); o cliente apenas espelha
  (`userCanView/userCanEdit`). `usuarios`/`cadastros` são admin-only.
- **Chamados:** "Chamados Antigos" (Google Sheets) é **somente leitura**; chamado órfão sem
  controle = "não aberto" (não criar controle automático).
- **Contratos mensais fixos/manutencao sao um fluxo separado:** as regras ja criadas para
  contratos de manutencao de equipamentos com pagamento mensal fixo (fiscalizacao, medicao
  gerada pela fiscalizacao, termo de ateste, NF vinculada, aditivo, supressao e reajuste
  por item) **nao devem ser reaproveitadas automaticamente** para outros modelos. Ao
  trabalhar em **Servico por demanda/execucao** ou qualquer outro tipo de contrato, nao
  puxar a logica do mensal fixo sem pedido explicito do usuario; primeiro confirmar a
  forma de execucao/pagamento e desenhar um fluxo proprio.

## Como rodar

```bash
python -m http.server 8765   # na raiz; abrir http://localhost:8765/login.html
```

## Regras de trabalho

- **Não** introduzir build/framework sem pedido explícito; manter o padrão estático.
- **Não recolocar lógica nova em `index.html`**. Depois da refatoração, ele deve continuar
  como casca estrutural: HTML das telas + carregamento de assets. Mudanças em JS legado
  devem ir para o arquivo correspondente em `js/legacy/`; novas extrações devem migrar
  gradualmente para `js/modules/`, `js/state/` ou `js/components/`.
- **Preservar a ordem dos scripts em `index.html`**. Os arquivos em `js/legacy/` são scripts
  clássicos, não módulos ES, porque ainda compartilham escopo global e sustentam handlers
  inline (`onclick`, `onchange`, etc.). Não converter para `type="module"` sem adaptar as
  dependências globais.
- **Editar o domínio correto**: Atas em `js/legacy/20-atas.js`; Licitações/Usuários em
  `js/legacy/30-usuarios-licitacoes.js`; Controle de Entregas/Empenhos em
  `js/legacy/40-itens-entregas.js`; Emendas/dashboard em
  `js/legacy/60-emendas-dashboard.js`; Fiscalização/Sanções/Contratos em
  `js/legacy/70-fiscalizacao-sancoes-contratos.js`.
- **Ao criar código novo**, prefira módulos nativos (`js/modules/<domínio>`,
  `js/state`, `js/components`) e exponha wrappers globais apenas quando necessário para
  compatibilidade com handlers inline existentes.
- **Editar `index.html` com cuidado**: localize por `id`/painel/modal antes de alterar.
  A lógica de funções como `showTab`, `loadAtas` e `abrirModalNovoContrato` agora está nos
  arquivos externos, não no HTML.
- **Banco:** seguir a trava obrigatória de ambiente Supabase acima. Nenhuma escrita/execução
  no projeto legado; migrations devem ser idempotentes e fixar `search_path` em funções.
- Rodar `get_advisors` (segurança/performance) após mudanças de schema.
- Atualizar [CHANGELOG.md](CHANGELOG.md) e os docs relevantes ao mudar comportamento.
- Confirmar itens marcados como **"A confirmar"** em [docs/TODO.md](docs/TODO.md) antes de
  tratá-los como regra fixa.
- Após mudanças estruturais de frontend, validar no mínimo:
  `node --check` em todos os `.js`, `git diff --check`, e `python -m http.server 8765`
  com verificação HTTP/console do carregamento dos assets.

## Documentação de referência

Arquitetura, schema, fluxo, regras, segurança e deploy: ver índice em
[README.md](README.md#documentação-docs).
