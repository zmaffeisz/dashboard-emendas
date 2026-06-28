# Arquitetura — dashboard-emendas

> Sistema de gestão de emendas parlamentares, licitações, contratos, atas de registro
> de preços, execução/entrega de itens e chamados da Secretaria Municipal da Saúde de Sorocaba (SUEQ).

## 1. Visão geral

O projeto é uma aplicação **web estática (sem framework, sem build, sem `npm`)**
servida como arquivos HTML/CSS/JS puros, com backend **100% Supabase (nuvem)**.
Toda a lógica de negócio do cliente vive em JavaScript *vanilla* embutido nas páginas
HTML; a persistência, autenticação, autorização (RLS) e regras de integridade ficam
no PostgreSQL gerenciado pelo Supabase.

```
┌──────────────────────────────────────────────────────────┐
│  Navegador (cliente)                                       │
│                                                            │
│  login.html ─┐                                             │
│  cadastro.html ─┼─▶ index.html (SPA principal, ~12k linhas) │
│  chamado.html ─┘     │                                     │
│        │             │  @supabase/supabase-js v2 (CDN)     │
│        │             │  xlsx / html2pdf / papaparse (CDN)  │
└────────┼─────────────┼─────────────────────────────────────┘
         │             │  HTTPS (REST/PostgREST + Auth + Storage + Realtime)
         ▼             ▼
┌──────────────────────────────────────────────────────────┐
│  Supabase (nuvem) — projeto djtwoesmgeetnrztyvzw           │
│  • PostgreSQL 17 (37 tabelas, 2 views, funções, RLS)      │
│  • Auth (e-mail/senha)                                     │
│  • Storage (buckets de termos/anexos)                     │
│  • PostgREST (API auto-gerada)                            │
└──────────────────────────────────────────────────────────┘
```

## 2. Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS + JavaScript ES (vanilla), sem framework e sem bundler |
| Cliente de dados | `@supabase/supabase-js@2` via CDN jsDelivr |
| Libs sob demanda | `xlsx` (export Excel), `html2pdf` (PDF), `papaparse` (CSV) — carregadas dinamicamente de CDN |
| Backend / DB | Supabase (PostgreSQL 17 na nuvem) |
| Autenticação | Supabase Auth (e-mail/senha) |
| Autorização | RLS no banco + verificação espelhada no cliente |
| Armazenamento de arquivos | Supabase Storage (buckets) |
| Servidor de desenvolvimento | `python -m http.server 8765` (ver `.claude/launch.json`) |

> Não há `package.json`, etapa de build, transpilação ou empacotamento. Os arquivos são
> entregues como estão. Ver [DEPLOYMENT.md](DEPLOYMENT.md).

## 3. Páginas (arquivos HTML)

| Arquivo | Papel |
|---|---|
| `login.html` | Tela de login (Supabase Auth). Redireciona para `index.html` se já houver sessão. |
| `cadastro.html` | Auto-cadastro de conta. Cria `profiles` com `papel = visualizador`. |
| `index.html` | **Aplicação principal (SPA)**: dashboard, abas/menu lateral, todos os módulos de gestão. ~818 KB. |
| `chamado.html` | Formulário **público** de abertura de chamado (não exige login). Usa RPC `abrir_chamado_publico`. |

### CSS

| Arquivo | Uso |
|---|---|
| `styles.css` | Estilos de login/cadastro e base. |
| `dashboard.css` | Estilos do `index.html` (layout, sidebar, tabelas, modais). |
| `chamado.css` | Estilos do formulário público de chamado. |

## 4. Organização interna do `index.html`

Como o sistema não usa framework, não há pastas de `components/`, `hooks/`, `services/`
ou `types/`. A organização é por **convenção dentro do arquivo**:

- **Marcação (HTML)**: cada módulo é um `<div id="panel-<nome>" class="panel">`. A barra
  lateral (`<aside class="sidebar">`) contém os itens `sidebar-<nome>` com `onclick="showTab('<nome>')"`.
- **Navegação**: `showTab(name)` ([index.html:2799](../index.html)) ativa o painel, aplica permissões,
  e dispara o carregamento sob demanda (`loadAtas`, `loadContratos`, `loadItens`, etc.).
- **Cliente Supabase**: instância única global `sb` ([index.html:2455](../index.html)).
- **Permissões (cliente)**: `userCanView`, `userCanEdit`, `podeEditar`, `_isAdmin`
  ([index.html:2464+](../index.html)) — espelham as regras de RLS do banco.
- **Funções de carregamento**: `loadXxx` / `carregarXxx` fazem `sb.from(...).select(...)`.
- **Modais**: `<div class="modal-overlay" id="panel-...">` abertos por funções `abrirModal...`.
- **Bibliotecas pesadas**: carregadas via `ensureLib('xlsx'|'html2pdf'|'papa')` apenas quando necessárias.

## 5. Princípios de design observados

- **Fonte única da verdade no banco.** As abas são *views* de leitura sobre as mesmas
  tabelas; alterações em uma aba refletem nas demais por recarregamento (ex.: a aba
  **Atas Rp** sempre recarrega via `loadAtas()` porque deriva de `contratos`).
  Ver [BUSINESS_RULES.md](BUSINESS_RULES.md) e [DATA_FLOW.md](DATA_FLOW.md).
- **Carregamento sob demanda** por aba (cada `loadXxx` só roda na primeira visita, exceto
  Atas que recarrega sempre).
- **Autorização em duas camadas**: RLS no banco (autoritativa) + espelho no cliente
  (UX/ocultação). Ver [SECURITY.md](SECURITY.md).
- **Modelagem para evitar duplicidade de valores monetários** (especialmente Notas Fiscais).
  Ver [BUSINESS_RULES.md](BUSINESS_RULES.md#notas-fiscais).

## 6. Ambientes de banco

> **Importante:** o app aponta para o **Supabase na NUVEM** (`djtwoesmgeetnrztyvzw`),
> *hardcoded* em `index.html`, `login.html` e `cadastro.html`. Existem arquivos
> `schema_local.sql` / `supabase/config.toml` para Supabase local, mas o app **não** usa
> o stack local. Análises e migrações devem mirar a nuvem. Ver [DATABASE.md](DATABASE.md).

## Documentos relacionados

- [SCHEMA.md](SCHEMA.md) — tabelas, colunas, relacionamentos
- [DATABASE.md](DATABASE.md) — migrations, views, funções, RLS
- [ROUTES.md](ROUTES.md) — páginas e abas
- [MODULES.md](MODULES.md) — módulos funcionais
- [DATA_FLOW.md](DATA_FLOW.md) — fluxo Emenda → Licitação → Contrato → Ata → Execução
- [BUSINESS_RULES.md](BUSINESS_RULES.md) — regras de negócio
- [API.md](API.md) — uso de PostgREST/RPC/Storage
- [SECURITY.md](SECURITY.md) — auth e autorização
- [DEPLOYMENT.md](DEPLOYMENT.md) — execução e deploy
