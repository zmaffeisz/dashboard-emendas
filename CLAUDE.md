# CLAUDE.md — orientações para agentes/IA

Guia para assistentes de IA (Claude Code e afins) que trabalham neste repositório.
Documentação humana completa em [`/docs`](docs/) e [README.md](README.md).

## O que é o projeto

`dashboard-emendas`: app **web estático** (HTML/CSS/JS *vanilla*, **sem framework, sem
build, sem `package.json`**) + **Supabase** (PostgreSQL na nuvem, Auth, Storage, RLS).
Gestão de emendas parlamentares → licitações → contratos → atas → execução/entrega →
chamados, da Secretaria da Saúde de Sorocaba.

## Mapa rápido

- `index.html` — **SPA principal** (~818 KB, ~12k linhas; HTML+CSS+JS no mesmo arquivo).
  Abas via `showTab('<name>')`; painéis `#panel-<name>`; cliente Supabase global `sb`.
- `login.html`, `cadastro.html` — auth. `chamado.html` — formulário público (RPC).
- `supabase/migrations/` — migrations. `schema*.sql` — dumps.
- Banco nuvem: projeto **`djtwoesmgeetnrztyvzw`** (o stack local em `config.toml` NÃO é o alvo de runtime).

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
- **Permissões:** `admin` (total) vs. usuário comum (caixinhas em `user_tab_permissions`).
  RLS no banco é autoritativa (`can_access_tab`); o cliente apenas espelha
  (`userCanView/userCanEdit`). `usuarios`/`cadastros` são admin-only.
- **Chamados:** "Chamados Antigos" (Google Sheets) é **somente leitura**; chamado órfão sem
  controle = "não aberto" (não criar controle automático).

## Como rodar

```bash
python -m http.server 8765   # na raiz; abrir http://localhost:8765/login.html
```

## Regras de trabalho

- **Não** introduzir build/framework sem pedido explícito; manter o padrão estático.
- **Editar `index.html` com cuidado** (arquivo gigante): localize por `id`/nome de função
  (ex.: `showTab`, `loadAtas`, `abrirModalNovoContrato`) antes de alterar.
- **Banco:** não aplicar DDL sem backup/branch; migrations devem ser idempotentes e fixar
  `search_path` em funções. Mirar a **nuvem** `djtwoesmgeetnrztyvzw`.
- Rodar `get_advisors` (segurança/performance) após mudanças de schema.
- Atualizar [CHANGELOG.md](CHANGELOG.md) e os docs relevantes ao mudar comportamento.
- Confirmar itens marcados como **"A confirmar"** em [docs/TODO.md](docs/TODO.md) antes de
  tratá-los como regra fixa.

## Documentação de referência

Arquitetura, schema, fluxo, regras, segurança e deploy: ver índice em
[README.md](README.md#documentação-docs).
