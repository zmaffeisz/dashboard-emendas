# TODO e Pontos a Confirmar — dashboard-emendas

> Itens levantados durante a documentação. Não representam mudanças aplicadas — são
> pendências, riscos e pontos a validar com o time. Relacionado a todos os docs em `/docs`.

## 1. A confirmar (no código / banco / com o time)

| # | Tema | Pendência | Doc |
|---|---|---|---|
| ~~C1~~ | Rateio multi-unidade | **Resolvido (2026-06-28)**: sem divisão igual. Nova emenda = valor global + itens inline; valor por unidade = unitário × qtde. | [BUSINESS_RULES.md](BUSINESS_RULES.md) |
| C2 | Status auto-trava | Quais status são `automatico` e a regra de bloqueio; conjunto canônico ("26 status oficiais"). | [DATABASE.md](DATABASE.md#status) |
| C3 | Empenho no gerar-contrato | Uso exato de fonte + emenda. | [BUSINESS_RULES.md](BUSINESS_RULES.md) |
| C4 | Sincronização de migrations | Arquivos em `supabase/migrations/` vs. histórico aplicado na nuvem (nomes divergem). | [DATABASE.md](DATABASE.md#migrations-aplicadas-em-produção) |
| C5 | Confirmação de e-mail | Política real na nuvem (`enable_confirmations`). | [SECURITY.md](SECURITY.md) |
| C6 | Buckets de Storage | Nomes e políticas (público vs. autenticado) dos buckets de termos/anexos. | [API.md](API.md) |
| C7 | Hospedagem do frontend | Onde o estático é publicado em produção. | [DEPLOYMENT.md](DEPLOYMENT.md) |
| C8 | Google Sheets | Mecanismo exato de leitura dos "Chamados Antigos". | [API.md](API.md) |
| C9 | DDL recebimento por unidade | Memória cita DDL de recebimento por unidade pendente — já aplicada (`recebimento_por_unidade`)? Validar UI. | [SCHEMA.md](SCHEMA.md) |

## 2. Pendências funcionais (memória do projeto)

> Registradas na auto-memória; podem já estar parcialmente feitas. Validar com login.

**Entregue em 2026-06-28 (aguardando teste com login):**
- "Emitir AF" de ATA no Controle de Entregas (modal dedicado, gera nº de AF; coluna
  `atas_execucao.af_numero`).
- Status dos modais de emenda/item unificados com a aba Licitações.
- Correção do dropdown de status cortado em Licitações em andamento.
- Redesign do modal **Nova emenda** com itens inline (valor unitário × qtde por unidade).

- Vários lotes de melhorias "implementados, aguardando teste com login".
- Redesign da aba **Emendas** (parcial — modal de cadastro feito), **Atas Rp**,
  reestruturação do **Controle de Entregas**.
- Inventário: "Ver tudo" e normalização (não normalizar `contrato_id` agora — decisão de
  escopo).
- Edital admin-only.
- Fila de revisão/dedup de cadastros-mestre criados inline.
- Deploy do `index.html` atualizado em produção.

## 3. Riscos e inconsistências técnicas observadas

| # | Risco | Detalhe |
|---|---|---|
| R1 | **Monólito de 818 KB** | `index.html` com ~12k linhas concentra HTML+CSS+JS. Difícil manutenção/teste; sem modularização. |
| R2 | **Sem testes/CI** | Toda validação é manual. Alto risco de regressão. Ver [TESTING.md](TESTING.md). |
| R3 | **Valores monetários duplicados em `contratos`** | Campos texto (`valor_*`) e numéricos (`valor_*_num`) coexistem; risco de divergência. Usar sempre os `_num`. |
| R4 | **Status em duplicidade** | `emenda_itens.status` (text) e `status_id` (FK) coexistem; `itens.status` e `status_lic_id` também. Garantir fonte única. |
| R5 | **Catálogo de status inflado** | `status_opcoes` tem muitos status com `contexto/orgao` variados e `ordem` repetida — risco de ambiguidade na UI. |
| R6 | **Credenciais hardcoded** | Aceitável para publishable key, mas dificulta troca de ambiente (sem env injetável por não haver build). |
| R7 | **`patrimonio/numero_serie` legado** | Mantidos como agregado por trigger; UI antiga depende disso. Migrar UI para `itens_entregas_unidades`. |
| R8 | **Backups em schema separado** | Migration moveu backups para schema `backup` — confirmar que não vazam pela API. |

## 4. Sugestões (não aplicadas nesta tarefa)

- Extrair JS do `index.html` para módulos (`.js`) e considerar um bundler simples.
- Adicionar `get_advisors` ao checklist de release.
- Smoke tests SQL + e2e mínimos.
- Centralizar configuração do Supabase em um único arquivo `config.js`.

> Esta documentação **não alterou código, banco, migrations ou regras de negócio**.
