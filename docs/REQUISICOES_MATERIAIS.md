# Requisição de materiais em reserva

Em **Controle de Entregas → Confirmação de Entrega na Unidade**, a coluna
**Requisição** permite gerar um termo, baixar o PDF guardado e escrever e-mail.

As ações aparecem conforme a etapa:

- Sem termo: **Gerar termo**.
- PDF pronto, e-mail pendente: **Baixar PDF** e **Escrever e-mail**. A seta junto
  ao download abre **Refazer termo** e as consultas do histórico.
- E-mail registrado: somente **Requisição ▾**, reunindo download, refazer,
  reescrever e consulta de **E-mails enviados** e termos anteriores.
- Termo refeito depois de um envio: voltam download e **Reescrever e-mail**, com
  status **Termo refeito · e-mail pendente**. O envio passado não vale para a nova
  versão; após o novo clique, as ações voltam ao botão único.

**Refazer termo** preserva a seleção dos bens e todos os recebimentos de um termo
em lote, além das observações. A unidade é conferida usando seu cadastro atual.
Cada geração cria nova versão: PDFs e e-mails anteriores permanecem disponíveis.
Quando há destinos ou seleções distintas no mesmo pedido, as opções indicam os
termos atuais correspondentes; envios parciais continuam sinalizados.

Selecione pendências e use **Gerar requisição dos selecionados** para reunir bens
da mesma unidade. Pedidos com vários destinos mostram os bens físicos: patrimônios
de outra unidade ficam bloqueados, e somente os escolhidos entram na quantidade.

A prévia usa unidades ativas já cadastradas. Se o destino não for identificado,
cadastre-o em **Cadastros → Unidades**, incluindo coordenador, endereço e telefone.
O termo só é gerado depois da conferência desses contatos. Registros com destino
não identificado precisam ser tratados individualmente antes de reunir um lote.
Material de consumo e carona não usam este fluxo; carona mantém o aviso de retirada.

O cabeçalho, aviso, títulos da tabela e assinatura vêm do PDF fornecido pelo usuário,
preparado em `assets/templates/requisicao-materiais.pdf` sem os dados do exemplo.
O solicitante é o nome do perfil autenticado; telefone, endereço e e-mail da SUEQ
permanecem os do modelo. Campos variáveis usam fontes PDF padrão e quebras de
linha; vários itens/patrimônios e observações longas podem criar páginas adicionais.

## Persistência e proteção

- `requisicoes_materiais`: UUID, referências aos recebimentos/bens físicos,
  `dados_itens`, `unidade_snapshot`, solicitante, data de geração, observação,
  conferência do coordenador, caminho e estado do PDF.
- `requisicoes_materiais_emails`: requisição, título, corpo, data do clique e autor.
- Storage privado `requisicoes-materiais`: `<UUID>/termo.pdf`, PDF de até 10 MB.
  O arquivo não tem política de atualização e não pode ser substituído. Remoção
  só é permitida ao autor antes de finalizar a geração.

`preparar_requisicao_materiais` consulta recebimentos e bens sob RLS. Seleção
`{tipo,id,unidades_ids?}` tem até 100 recebimentos, sem repetição. Quantidade de uma
seleção parcial é a contagem dos bens físicos; patrimônios/documentos vêm do banco.
`ficha_unidade_requisicao` obtém a ficha corrente da unidade ativa.

O trigger de inserção confere a mesma unidade, dados da prévia ainda atuais,
coordenador/endereço/telefone e identidade do solicitante. Informações congeladas
não podem ser editadas. A única atualização é `pdf_pronto: false → true`, após
existir o arquivo no Storage. Se o upload falhar, **Opções da requisição → Retomar
geração incompleta** usa o registro reservado e seus dados originais, sem criar outra versão.
O download posterior sempre obtém o PDF armazenado, sem gerar novamente.

RLS usa o domínio e a seção de cada item: aquisições exigem acesso a `itens`; ATAs
usam `atas`/`itens` conforme as permissões existentes. Leitura de histórico e PDF
segue o mesmo escopo. Geração e registro de e-mail exigem edição. Sem acesso
anônimo; solicitante e datas são carimbados no banco. A migration foi aplicada
somente em `qpvgpfwuurqcqprnpxua` (`contratos-dag`).

## E-mail e histórico

**Escrever e-mail** primeiro guarda o evento e então abre `mailto:` sem destinatário.
O título segue `Termo de Requisição - <unidade> - Patrimônios <lista>`, com limite de
180 caracteres. Patrimônios são acrescentados inteiros; se não couberem, o título
termina em `etc.`. O corpo contém todos os patrimônios, material, quantidade,
empenho, processo/CPL, contrato/ata, NF, AF, contatos e observações disponíveis.

Por regra solicitada pelo usuário, clicar no botão marca **Enviado ao almoxarifado**.
O histórico esclarece que a marca corresponde ao clique, registra cada abertura
com título/data/autor e permite copiar título e corpo. O PDF deve ser anexado no
cliente de e-mail. Gerar ou baixar PDF não marca envio nem confirma entrega física.

## Validação realizada

Testes puros do assunto/corpo, interface com dados simulados e PDF real, seleção
parcial/mista, retomada de upload e download idêntico após mudança cadastral.
Teste SQL com `ROLLBACK` verificou autoria, destinos, quantidades, corrida de
cadastro, conferência obrigatória, finalização com PDF, imutabilidade e isolamento
por RLS. Consultas reais de aquisições e ATAs também validadas. Advisors sem novos
alertas de segurança; índices novos aparecem como ainda não usados, esperado antes
da primeira geração. Ver [TESTING.md](TESTING.md).
