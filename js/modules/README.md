# Modules

Destino dos modulos funcionais extraidos de `js/legacy`.

Cada modulo deve separar:

- `*.render.js`: montagem de tela.
- `*.events.js`: eventos do usuario.
- `*.service.js`: dados, Supabase e regras do dominio.

As extracoes devem preservar o fluxo Emenda -> Licitacao -> Contrato -> Ata -> Execucao / Entrega.
