# dashboard-emendas

Sistema de gestão de **emendas parlamentares, licitações, contratos, atas de registro de
preços, execução/entrega de itens e chamados** da Secretaria Municipal da Saúde de
Sorocaba (SUEQ).

É uma aplicação **web estática** (HTML/CSS/JS *vanilla*, sem framework e sem build) com
backend **Supabase** (PostgreSQL na nuvem, Auth, Storage e RLS).

## Fluxo principal

```
Emenda → Licitação → Contrato → Ata → Execução/Entrega
```

O sistema é um **ecossistema integrado** com **fonte única da verdade** no banco:
alterações em uma aba refletem nas demais (a aba **Atas Rp** deriva da matriz de
**Contratos**, por exemplo). Detalhes em [docs/DATA_FLOW.md](docs/DATA_FLOW.md).

## Estrutura do repositório

| Caminho | Descrição |
|---|---|
| `login.html` / `cadastro.html` | Login e auto-cadastro (Supabase Auth). |
| `index.html` | Aplicação principal (SPA com abas por `showTab`). |
| `chamado.html` | Formulário **público** de abertura de chamado. |
| `styles.css` / `dashboard.css` / `chamado.css` | Estilos. |
| `schema*.sql`, `migracao_*.sql`, `supabase-unificar-*.sql` | Dumps e scripts de migração. |
| `supabase/` | `config.toml` (stack local) e `migrations/`. |
| `docs/` | Documentação técnica e funcional. |

> Não há `package.json`, build ou `node_modules`. As bibliotecas (supabase-js, xlsx,
> html2pdf, papaparse) são carregadas por **CDN**.

## Como rodar localmente

```bash
# Na raiz do repositório (servir por HTTP — necessário para o Auth):
python -m http.server 8765
# Abrir: http://localhost:8765/login.html
```

Mais detalhes (incluindo Supabase local opcional) em
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Backend (Supabase)

- Projeto nuvem: `djtwoesmgeetnrztyvzw` (credenciais publishable hardcoded no HTML).
- PostgreSQL 17: 37 tabelas, 2 views, funções e RLS.
- Variáveis e boas práticas: [.env.example](.env.example).

## Documentação (`/docs`)

| Documento | Conteúdo |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Visão geral, stack, organização do código. |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Tabelas, colunas, relacionamentos, campos monetários e de status. |
| [docs/DATABASE.md](docs/DATABASE.md) | Migrations, views, funções, triggers, RLS, FKs. |
| [docs/ROUTES.md](docs/ROUTES.md) | Páginas e abas/menu. |
| [docs/MODULES.md](docs/MODULES.md) | Módulos funcionais e interdependências. |
| [docs/DATA_FLOW.md](docs/DATA_FLOW.md) | Fluxo Emenda → Licitação → Contrato → Ata → Execução. |
| [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | Regras de negócio (inclui modelo anti-duplicidade de NF). |
| [docs/API.md](docs/API.md) | Uso de PostgREST, RPC, Auth e Storage. |
| [docs/SECURITY.md](docs/SECURITY.md) | Autenticação e modelo de permissões. |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Execução e deploy. |
| [docs/TESTING.md](docs/TESTING.md) | Estado dos testes e roteiro manual. |
| [docs/TODO.md](docs/TODO.md) | Pendências, pontos a confirmar e riscos. |

Histórico de mudanças: [CHANGELOG.md](CHANGELOG.md).
Orientações para agentes/IA: [CLAUDE.md](CLAUDE.md).

## Permissões (resumo)

- **admin**: acesso total.
- **usuário comum**: acesso por caixinhas (`user_tab_permissions`, ver/editar por aba).
- Conta nova / sem login: vê apenas a aba **Emendas**.

Detalhes em [docs/SECURITY.md](docs/SECURITY.md).
