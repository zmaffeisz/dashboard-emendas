# dashboard-emendas

Sistema web estático da Secretaria Municipal da Saúde de Sorocaba para gestão de
emendas parlamentares, licitações, contratos, atas, execução, entregas e chamados.

## Arquitetura

- Frontend: HTML, CSS e JavaScript vanilla, sem build ou framework.
- Backend: Supabase Cloud (PostgreSQL, Auth, Storage e RLS).
- Hospedagem: GitHub Pages.
- Aplicação principal: `index.html`.
- Formulário público: `chamado.html`.
- Lógica atual: `js/legacy/`, carregada como scripts clássicos em ordem.

## Produção

- Repositório: `zmaffeisz/dashboard-emendas`.
- Site: `https://zmaffeisz.github.io/dashboard-emendas/`.
- Chamados: `https://zmaffeisz.github.io/dashboard-emendas/chamado.html`.
- Supabase de produção: `qpvgpfwuurqcqprnpxua` (`contratos-dag`).
- Supabase legado, somente leitura: `djtwoesmgeetnrztyvzw`.

O projeto legado permanece congelado e somente para consulta. O desenvolvimento,
as migrações e as novas escritas devem ser direcionados exclusivamente ao
`contratos-dag`.

## Como executar localmente

```bash
python -m http.server 8765
```

Abra `http://localhost:8765/login.html`.

## Estrutura principal

| Caminho | Conteúdo |
|---|---|
| `index.html` | Estrutura da SPA e modais. |
| `chamado.html` | Abertura pública de chamados. |
| `js/legacy/` | Regras de negócio separadas por domínio. |
| `js/modules/`, `js/state/`, `js/components/` | Base da modularização gradual. |
| `supabase/migrations/` | Evolução versionada do banco. |
| `docs/` | Arquitetura, regras, segurança, deploy e design system. |

## Regras essenciais

- O banco é a fonte única da verdade.
- `contratos` é a matriz de contratos e atas.
- Atas Rp é uma área própria do menu, não uma subaba de Contratos.
- Notas fiscais não podem ter o valor total duplicado por unidade.
- Chamados e Fiscalização devem preservar protocolo, controle, histórico e vínculos.
- Toda alteração de banco deve respeitar RLS e o isolamento por seção.

Consulte [AGENTS.md](AGENTS.md), [CHANGELOG.md](CHANGELOG.md) e a pasta
[docs](docs/) antes de mudanças estruturais.
