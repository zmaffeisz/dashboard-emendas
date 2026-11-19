# Serviços por escopo fechado

O contrato gerado de uma licitação com `tipo_servico = 'Serviço por escopo fechado'`
recebe o modo **Integral, ao concluir** ou **Parcial, por medições**. Seus itens
(`origem = 'servico'`) aparecem no **Controle de Entregas / Prazos**. O vínculo com
o item de emenda, a unidade beneficiada e as fontes de recurso é preservado.

## Operação

1. Abra **Execução / medições** no item. Confira a forma de recebimento e registre,
   se disponíveis, ordem de serviço, início da execução e prazo de conclusão.
2. Cadastre o empenho na aba Empenhos, associado ao contrato, e use **Vincular empenho**.
3. Use **Cadastrar NF** para registrar/anexar a nota no cadastro central. A execução
   é reaberta após salvar a NF; **Atualizar notas e histórico** também recarrega a lista.
4. Selecione a NF e o empenho, informe período executado, fiscal, data e descrição
   do serviço atestado. O bruto vem da NF; uma glosa exige justificativa.
5. **Registrar medição e ateste** confirma o aceite fiscal do líquido; não registra
   pagamento. O termo fica disponível para baixar em PDF e assinar.

O modo integral exige uma única medição pelo valor total contratado do item e
marca a conclusão. No modo parcial, a execução permanece aberta até marcar
**Serviço concluído (recebimento final)**, mesmo que o valor já tenha sido todo
medido. Concluir com saldo não executado exige justificativa; esse saldo continua
visível e não é convertido em execução. A forma de recebimento vale para todo o
contrato e fica bloqueada após qualquer medição ativa.

Cada lançamento vincula **uma NF inteira a um item**. Notas já rateadas/vinculadas
não podem ser usadas novamente. O rateio proporcional das fontes ativas do item
fica em `nota_fiscal_itens`; o valor integral permanece uma única vez em
`notas_fiscais.valor_total`. Bruto medido consome saldo; líquido atestado desconta
glosas e alimenta o financeiro do contrato.

## Correções e histórico

**Cancelar medição** exige motivo, mantém a medição e o termo no histórico e
libera o vínculo da NF e o saldo do serviço. A mesma NF pode ser corrigida e
utilizada novamente. Uma NF encaminhada para pagamento exige regularização desse
encaminhamento antes de cancelar. Termos cancelados são identificados no PDF.
Os campos financeiros de NFs atestadas e medições de escopo não podem ser
alterados pelos formulários genéricos de medição/NF.

Serviços concluídos podem ser consultados no filtro **Recebido** do Controle de
Entregas e na ficha do contrato. Não passam pela confirmação física da unidade.
Não há tipo de material, patrimônio, série, unidades físicas ou inventário.

## Implementação e validação

- Tela: `js/modules/execucao/servicos-escopo.js`, integrada por wrappers no legado.
- Contrato: `recebimento_escopo`; item: `escopo_execucao` (ordem, início e prazo).
- Fonte financeira: `contratos_medicoes`, com `escopo_item_id`, conclusão e
  fotografia dos dados atestados em `escopo_dados`; child em `contratos_medicao_itens`.
- NF e termo: cadastros centrais `notas_fiscais` e `termos_ateste`.
- RPC `servico_escopo_operar` delega ao schema privado, valida autenticação,
  domínio/seção, tipo de serviço e saldos. Bloqueia contrato/item/NF, confirma todos
  os vínculos numa transação e aceita reenvio do mesmo identificador sem duplicar.
- Policies adicionais de leitura são limitadas às medições/termos de escopo para
  usuários autorizados no Controle de Entregas. Mutações passam pela RPC protegida.
- Produção exclusiva: `qpvgpfwuurqcqprnpxua`. Schema anterior salvo fora do repositório.
- `node --test tests/servicos-escopo.test.mjs`: resumo, conclusão, interface sem
  dados de bens, permissões, clique simultâneo e repetição após falha de rede.
- `tests/servicos-escopo.sql`: executado em transação com **rollback**; verifica
  limites, integral/parcial, NF/ateste únicos, cancelamento, bloqueio de edição,
  autenticação e ausência de unidades físicas.

Fluxos de mensal/trimestral fixo, demanda, aquisição e ATA mantêm regras próprias.
