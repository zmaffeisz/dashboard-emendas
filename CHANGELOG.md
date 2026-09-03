# Changelog

## 2026-09-03 — Destino e patrimônio por unidade física de ATA

- Restaurada e preservada a identificação `EMENDA ... - UNIDADE` no cabeçalho das
  execuções importadas; o destino real permanece no registro individual do patrimônio.
- Unidades físicas de execuções de ATA passam a guardar a própria unidade de destino e
  a data de entrega na unidade, sem obrigar todo o lote a ter a mesma destinação.
- O detalhe da execução e a ficha **Vida do item** mostram o destino e a entrega de cada
  patrimônio; o Inventário recebe a mesma origem quando ainda não houve movimentação.
- Importação auditável da planilha `execucao ata monitor.xlsx` reconcilia os monitores do
  CPL 017/2024 por item e empenho, rejeitando conflitos com patrimônios já cadastrados.
- Lacunas patrimoniais de alta confiança foram documentadas individualmente; dados sem
  evidência suficiente permanecem em branco em vez de serem inventados.

## 2026-09-02 — Editar itens sem vínculo no modal da emenda

- **Editar emenda** lista os itens e permite ao administrador ajustar descrição,
  quantidade e valor unitário planejado ou marcar exclusões, com opção de desfazer.
- Itens com processo, item de contrato, planejamento/execução de ata, empenho, NF,
  ocorrência ou evidência legada de execução ficam bloqueados com o motivo.
- Duas RPCs novas conferem vínculos no banco e salvam cabeçalho/itens atomicamente,
  com RLS, controle de versão e trava contra criação concorrente de vínculos.
- A exclusão deste fluxo nunca usa cascade. Valores executados não são criados ou
  sobrescritos. Falha na consulta bloqueia o salvamento por segurança.
- Migration `20260902204904_editar_emenda_itens_sem_vinculo.sql` aplicada no banco
  oficial com autorização do usuário; cache da API recarregado. Os testes de salvamento
  usaram dados sintéticos integralmente revertidos, e a consulta da emenda apresentada
  retornou 40 itens livres. Nenhum item real foi alterado ou excluído na implantação.

## 2026-09-02 — Seleção de unidade e status no modelo de emendas

- O modelo Excel agora inclui listas suspensas de **Unidade** e **Status inicial**,
  com validação de parada para opções fora do cadastro, nas linhas 2 a 1001.
- A aba **Listas** contém 53 unidades ativas e 20 status manuais de licitação,
  consultados somente para leitura no banco oficial em 02/09/2026. O modelo é
  estático: alterações futuras do catálogo exigem atualização do arquivo.
- Instruções e download atualizados; preservados o status opcional e a validação da colagem.

## 2026-09-02 — Modelo Excel e colagem no cadastro de emendas

- **Cadastrar nova emenda** passa a oferecer **Baixar planilha modelo**, com as colunas
  Item, Valor unitário, Status inicial, Unidade e Quantidade.
- Ao colar as cinco colunas no campo Item / Descrição, o formulário cria os itens e
  suas unidades, aceita moeda brasileira e recalcula os totais. Cabeçalho é opcional.
- Linhas com a mesma descrição, valor e status são agrupadas; quantidades da mesma
  unidade são somadas dentro da colagem. Itens já digitados são preservados.
- Unidades e status são conferidos com as opções do cadastro; valores e quantidades
  precisam ser positivos. Uma linha inválida bloqueia toda a colagem com explicação.
- A colagem não grava no banco. O salvamento continua usando **Salvar emenda**.
- Testes: `node tests/emenda-colagem-planilha.test.mjs` e
  `tests/emenda-colagem-planilha.html` (formulário e salvamento simulados).

## 2026-09-02 — Aguardando AF no topo do Controle de Entregas

- Itens de aquisição e ATA com status **aguardando AF** aparecem antes dos atrasados.
- Os demais grupos mantêm a ordem anterior; entre atrasados, os de maior atraso
  continuam primeiro. Filtros e regras de recebimento não foram alterados.

## 2026-09-02 — Andamento das aquisições em Licitações e Excel

- Licitações e ambas as exportações Excel passam a derivar a situação das aquisições
  de empenhos, AFs, recebimentos e confirmações, reutilizando os rótulos de Emendas.
- Itens contratados com situação licitatória vazia não aparecem mais como
  "Indefinido" quando o fluxo operacional informa a etapa; situações manuais antigas
  não sobrepõem recebimento/entrega. Nenhum status é regravado no banco.
- Datas refletem o marco operacional disponível, sem confundir recebimento interno
  com entrega na unidade ou deslocar datas sem horário para o dia anterior.
- Processos com etapas diferentes mostram "Vários"; a opção de incluir processos
  totalmente contratados permanece. Recebimentos parciais e cancelados são respeitados;
  consumo termina no almoxarifado. Serviços e ATAs mantêm seus fluxos próprios.
- Teste de regressão: `node tests/licitacoes-fluxo.test.mjs`.

## 2026-09-01 — Totais e visualização compacta nas Licitações

- Cada item em Licitações em andamento passa a mostrar quantidade, valor unitário,
  valor total e a unidade beneficiada/de destino quando houver essa informação.
- O total dos itens considerados aparece no cabeçalho e no rodapé do processo.
- Os valores usam apresentação discreta, sem negrito ou destaque colorido excessivo.
- No cabeçalho, o total aparece abaixo do número do processo com destaque moderado;
  as ações ficam agrupadas em um único menu e o identificador não recebe sublinhado.
- Adicionado o filtro **Somente com emenda vinculada**, considerando vínculos diretos
  dos itens e planejamentos de ATA; a exportação respeita o mesmo recorte.
- A exportação existente foi identificada como **Excel - Itens/Processos** e uma nova
  opção **Excel - Apenas Processos** gera uma linha por processo, reunindo título,
  número, todas as emendas vinculadas, secretaria, situação atual e data desde quando.
- Cada item da licitação exibe o número e o ano das emendas vinculadas diretamente ou
  por planejamento de ATA.
- Serviços mensais e trimestrais passam a exibir e somar o valor global da vigência;
  o detalhamento mantém visível o valor do período e o multiplicador de meses/ciclos.
- O cabeçalho e o rodapé dos serviços também mostram o valor mensal/trimestral do
  contrato inteiro, separado do total global da vigência.
- Itens podem ser ocultados visualmente do cálculo, com opção de revelá-los e
  reincluí-los; essa preferência permanece apenas na sessão do navegador.
- Secretaria, situação e data ficam em leitura compacta. Os controles individuais
  aparecem somente ao clicar em **Editar item**, mantendo **Aplicar a todos** como fluxo
  principal.

## 2026-09-01 — Filtro por múltiplas categorias

- Os filtros de categoria em Licitações, Atas RP e Inventário agora aceitam várias
  categorias simultaneamente, inclusive em combinação com **Sem categoria**.
- Limpar a seleção volta a exibir todas as categorias.

## 2026-09-01 — Categorias específicas da DMMHF

- Adicionadas as categorias Dieta (Rede, MJ e genérica), Fralda (Rede e MJ), Freestyle,
  Provox, I-Port, Impressos, Laboratório e Diversos.
- Reclassificados apenas os processos cuja destinação está expressa no objeto, nos itens
  ou nas Atas importadas; três processos conflitantes ou inespecíficos voltaram para
  **Sem categoria**, aguardando confirmação da área gestora.

## 2026-09-01 — Classificação inicial das contratações existentes

- Classificados os 99 processos existentes a partir do objeto e da composição dos itens.
- A classificação foi propagada para os 750 itens, 107 contratos e 233 itens de atas vinculados.
- Processos mistos foram classificados pela finalidade predominante, preservando a possibilidade de revisão humana posterior.

## Em desenvolvimento

- **Categorias de licitação:** novos processos passam a exigir uma categoria mestre. O
  sistema oferece 25 categorias iniciais, permite criar outra no próprio modal e inclui
  as categorias novas na fila de revisão da aba Cadastros. A categoria é propagada para
  itens, contratos e itens de ATA, aparece nas listagens e exportações e pode ser usada
  para filtrar Licitações, Atas Rp Vigentes e Inventário. O banco bloqueia duplicatas por
  diferenças apenas de caixa, acentuação ou espaços.

- **Recebimento de bem permanente:** a seleção de tipo de material passa a ser lida dentro
  do modal e registrada no momento do clique, evitando a mensagem indevida para itens já
  marcados como bem permanente ou material de consumo.

- **Excel das Licitações filtradas:** a aba Licitações em andamento agora exporta os
  processos que estão visíveis, com uma linha por item, valores, unidades, fonte, situação,
  ocorrências, número e ano da emenda, e planejamentos de ATA em aba complementar.

- **Triagem dos alertas de vigência nas Atas RP:** os cards com pelo menos um item
  **Não analisado** agora aparecem antes dos demais e ficam brancos, enquanto os cards com
  todos os itens definidos recebem fundo azul-claro, mantendo a ordenação por proximidade
  do vencimento dentro de cada grupo. Os alertas de contratos vencendo e vencidos ganharam
  o filtro **Mostrar apenas não analisados**: na tela resumida ele restringe os cards e os
  itens exibidos, mas o modal continua mostrando todos os itens do contrato para decisão.

- **Atalho das Atas RP na tabela:** itens vinculados a contratos vencidos ou vencendo em
  até 90 dias agora são clicáveis na tabela de itens e abrem o modal de decisões do contrato,
  com todos os seus itens. As demais linhas permanecem sem esse atalho.

- **Ordenação padrão das Atas RP:** a tabela de itens agora começa ordenada pelo vencimento,
  dos contratos vencidos e mais próximos dos contratos com vencimento mais distante. A ordenação
  manual pelos cabeçalhos continua disponível.

- **Edição operacional e fiscalizadores nas Atas RP:** o menu de cada item passa a
  separar a edição administrativa completa, exclusiva de admin, dos fluxos permitidos
  aos editores de Contratos. O novo editor operacional libera apenas e-mails, prefixo de
  chamado, contato, data-base antes do primeiro reajuste e inclusão de observação interna
  no histórico; empresa, objeto, seção, vigência, status e valores não ficam disponíveis.
  A nova opção **Fiscalizadores** permite adicionar ou remover responsáveis pelo fluxo
  próprio, mantendo o histórico do contrato e a lista de fiscais ativos sincronizada.

- **Decisão de vigência por item nas Atas RP:** os cards de contratos vencidos ou
  próximos do vencimento agora são clicáveis e permitem classificar cada item como
  **Em renovação**, **Encerrar ao vencer** ou **Não analisado**. As decisões são
  mutuamente exclusivas, persistem por item e aparecem também na grade. A prorrogação
  efetiva só é liberada depois do vencimento; o encerramento antecipado só é liberado
  quando o saldo do item está zerado. As ações de prorrogar e encerrar itens vencidos
  ficam no próprio card de vencidos. Antes da nova vigência, todos os itens ativos devem
  estar definidos para renovação e os destinados ao encerramento devem ser encerrados.

- **Alertas de vigência nas Atas RP:** contratos vencidos e contratos vencendo em até
  90 dias agora aparecem em resumos separados, recolhidos por padrão e expansíveis. A
  abertura mostra cada contrato em um cartão legível, com prazo, vencimento, empresa e
  itens agrupados; o indicador de 90 dias passa a contar contratos únicos e não inclui
  os já vencidos.

- **Recebimento de ATA com empenho histórico:** execuções importadas que já possuem
  número(s) de empenho, mas não têm um único vínculo relacional recuperável, deixam de
  pedir nova vinculação. A NF fica relacionada diretamente à execução, sem atribuir
  valores a um empenho arbitrário; as validações também passam a ocorrer antes da criação
  ou anexação da NF, evitando novos documentos órfãos em caso de erro.
- **Unidade de medida nas Atas Rp:** a lista de itens passa a exibir, pesquisar, ordenar
  e filtrar a unidade de medida. A nova solicitação mostra a unidade do item selecionado
  separadamente da unidade de destino, e novos itens de ATA preservam esse dado desde a
  licitação ou pelo cadastro manual.

- **Planilha modelo e colagem completa dos itens da licitação:** Aquisição e ATA de RP
  agora oferecem modelos Excel próprios, com listas suspensas para unidade de medida,
  unidade de destino e fonte de recurso. A colagem em Descrição cria várias linhas e
  preenche descrição, quantidade, unidade de medida, valor, prazo, Código SIAM e, nas
  aquisições, unidade de destino e fonte.

- **Unidade de medida nos itens da licitação:** o cadastro de aquisições, ATAs e serviços
  por demanda passa a exigir unidade de medida por item. O novo seletor pesquisável usa
  códigos, nomes, categorias e exemplos de uso, aceita aproximações e permite criar opções
  personalizadas, que reaparecem nas buscas após serem usadas.

- **Empréstimos e movimentações do Inventário:** corrigido o gatilho compartilhado de
  proteção para validar `documento_path` somente no histórico de movimentações. A atualização
  do estado atual do bem deixa de tentar acessar esse campo inexistente e o empréstimo pode
  ser concluído atomicamente após o envio do termo.

- **Inventário sem duplicação no recebimento em lote:** bens permanentes com patrimônio
  passam a preencher as unidades físicas já materializadas pelo banco, sem criar uma linha
  vazia adicional. As 24 unidades vazias geradas pelo conflito anterior foram removidas,
  preservando as 24 unidades identificadas e seus patrimônios.

- **Código SIAM por item:** itens de aquisição, ATA, material de consumo e serviços agora
  aceitam o código opcional do catálogo interno já na geração da licitação. O código é
  preservado na contratação, no espelhamento dos itens de ATA, nas buscas e nas exportações.

- **Empenhos de execuções de ATA:** o vínculo com empenho e nota fiscal deixa de existir
  apenas como texto e passa a registrar também a execução em `empenho_itens` e
  `nota_fiscal_itens`. A ficha completa volta a exibir item, AF/recebimento, NF e anexo;
  vínculos históricos inequívocos são recuperados automaticamente.

- **Vida do lote de consumo nas Atas:** clicar em uma execução classificada como material
  de consumo abre diretamente a ficha unificada “Vida do item”, com o lote agregado, dados
  da contratação, recebimento, NF e anexo. O comportamento expansível por unidade física
  dos bens permanentes foi preservado.

- **Anexo de NF mais resiliente:** a vinculação do PDF ou imagem à nota fiscal agora usa
  uma operação autenticada via `POST`, evitando falhas de navegador que bloqueavam a etapa
  `PATCH` depois de o arquivo já ter sido enviado. Em caso de erro, arquivo e cadastro
  provisórios continuam sendo removidos para não deixar dados incompletos.

- **Recebimento por tipo de material:** o recebimento administrativo agora exige escolher
  entre bem permanente e material de consumo. Somente permanentes perguntam sobre patrimônio,
  geram unidades físicas e seguem para entrega na unidade/Inventário; consumos permanecem
  aglutinados e são concluídos no almoxarifado.

- **Classificação antes do vínculo da NF em ATA:** o tipo de material e a informação de
  patrimônio são gravados antes da vinculação de empenho e nota fiscal, evitando que uma
  escolha já feita na tela seja recusada pela validação do recebimento.

- **AFs e recebimentos:** datas de AF, recebimento e emissão de NF deixam de ser preenchidas automaticamente; os campos obrigatórios precisam receber a data real antes de salvar.

- **Empenhos:** o ano não é mais preenchido automaticamente; o número aceita somente
  até cinco dígitos, sem barra ou ano embutido.
- **Atas — nova solicitação:** a origem do recurso deixa de vir marcada por padrão e
  passa a ser uma escolha obrigatória antes de salvar.
- **Contratos — fornecedor:** removida a exibição indevida do seletor técnico duplicado;
  permanece somente o campo pesquisável de empresa e o botão de cadastro.
- **Hierarquia organizacional por divisão e seção:** o sistema agora cadastra Divisões
  separadamente e vincula cada Seção a uma divisão. DAG reúne SAC, SACON, SECOMP, SMCP e
  SUEQ - EQUIP; DMMHF reúne MJ, SAMA, SEAP e SEMED. Chefias acessam e editam, conforme as
  caixinhas por aba, somente as seções da própria divisão e podem alternar entre a visão
  consolidada e cada seção pelo cabeçalho. Administradores continuam globais e podem
  alternar entre todas as divisões, uma divisão ou uma seção. Os IDs e vínculos históricos
  das seções foram preservados; Storage e a exclusão privilegiada de licitações também
  passaram a validar o escopo organizacional.
- **Localização física somente após a entrega:** a ficha “Vida do item” não usa mais a
  unidade planejada da Emenda como localização ou situação atuais. Esses dados aparecem
  somente depois da confirmação da entrega na unidade; a unidade planejada permanece no
  histórico de origem.
- **Colunas compactas no Controle de Entregas:** as colunas Processo/CPL e Contrato/SIM
  agora ocupam menos espaço, preservando o conteúdo completo ao passar o cursor.
- **Ficha completa na aba Empenhos:** cada linha agora é clicável e abre uma visão
  consolidada, somente leitura, com identificação e valores do empenho, fornecedor,
  contratos, processos, Emendas, itens e rateios, AFs, recebimentos, notas fiscais e
  documentos relacionados. As ações de editar e excluir continuam separadas.
- **Rótulos do rateio de empenho por item:** os campos de quantidade e valor no vínculo
  de empenho do contrato agora exibem descrições completas à esquerda dos controles, sem
  usar textos internos como rótulos.
- **Itens fracassados ou desertos em licitações:** a aba Licitações em andamento ganhou
  uma ação definitiva por item, com resultado, número do pregão, lote, data, observação e
  documento comprobatório obrigatório. O item fica bloqueado contra edição, exclusão,
  contrato ou reaproveitamento; na aba Emendas, o histórico planejado e licitado é
  preservado, o valor aparece negativamente na execução e volta ao saldo disponível, com
  destaque visual vermelho e acesso ao documento.
- **Troca de marca de item de ATA por apostilamento:** a ação **Trocar marca** registra
  referência, data e observações do apostilamento, altera a marca/modelo vigente do item e
  a propaga aos pedidos futuros e às solicitações ainda não recebidas selecionadas no
  modal, inclusive com AF já emitida. O modal mostra unidade, quantidade, AF, previsão e
  marca atual de cada pedido elegível. Itens encerrados continuam oferecendo a ação quando
  possuem entregas abertas; solicitações recebidas preservam a marca anterior como
  fotografia histórica.
- **Busca pelo número/ano da emenda:** o filtro da aba Emendas agora pesquisa também pelo
  identificador exibido completo, como `66/2026`, aceitando trechos como `66/2`, além de
  continuar localizando por parlamentar, objeto, item e demais campos.
- **Busca unificada e exportações nas Atas:** o filtro superior agora pesquisa ao mesmo
  tempo os itens das Atas e suas execuções/solicitações, incluindo empenho, unidade, NF,
  AF, item, marca, empresa, CPL e SIM. Cada card também passou a exibir apenas o seu botão
  de Excel: Atas no card superior e Execuções no card inferior, sempre respeitando os
  filtros ativos.
- **Recebimento e entrega na unidade separados:** a aba Emendas e seus relatórios agora
  exibem em colunas próprias a data em que a empresa entregou o item à Secretaria e a data
  posterior de entrega/confirmação na unidade. A data da AF e a data do recebimento não
  preenchem mais indevidamente a entrega na unidade; itens ainda em licitação ou aguardando
  recebimento permanecem com esses campos vazios.
- **Linha do tempo de observações no Controle de Entregas:** cada anotação agora cria um
  registro permanente com data, hora e autor, exibido em ordem cronológica no modal. Novas
  anotações não substituem as anteriores; somente administradores podem editar um registro
  já salvo, e a edição também identifica quem alterou e quando. As 35 observações legadas
  existentes foram preservadas como registros anteriores sem data original conhecida.
- **Histórico de prazos no Controle de Entregas:** a data limite vigente não apaga mais o
  prazo anterior. A tabela mostra quando houve prorrogação, o prazo original e cada novo
  prazo, com observação; alterações futuras são registradas automaticamente no banco. Os
  registros anteriores ainda identificáveis pela AF, prazo do item e observação de
  prorrogação também foram recuperados.
- **Caronas fora do Inventário:** recebimentos de ATA com origem Carona permanecem
  registrados nas execuções, NF e confirmação da unidade, mas não aparecem na aba
  Inventário, não criam estado em `inventario_unidades` e não podem receber movimentações
  patrimoniais da Saúde.
- **Aviso de retirada para Carona:** recebimentos de ATA originados por Carona exibem, na
  subaba **Confirmação de Entrega na Unidade**, um botão para preparar o e-mail ao
  solicitante cadastrado, com cópia para a SUEQ. O texto informa Ata, NF anexa, item,
  quantidade e os contatos do Almoxarifado para agendamento da retirada.
- **Aceite de Carona sem valor global da Ata:** o PDF mantém somente o valor unitário e o
  valor total autorizado da solicitação, sem exibir o valor global do instrumento.
- **Correção de PDF do aceite de Carona:** textos vindos do cadastro com quebras de linha
  são normalizados antes da geração. Isso evita o espaçamento inválido que interrompia a
  renderização do documento antes da tabela e das assinaturas.
- **Solicitante da Carona em cópia na AF:** o comando Preparar e-mail do Controle de
  Entregas inclui em Cc o e-mail cadastrado do solicitante quando a execução de ATA veio de
  Carona, tanto individualmente quanto em lote, sem duplicar destinatários.
- **Contato do solicitante em Caronas:** a nova solicitação de Ata com origem Carona agora
  exige um e-mail válido do solicitante, gravado no pedido e exibido nos detalhes e no PDF
  de aceite.
- **Aceite de adesão para Carona em Atas de RP:** solicitações com origem Carona ganharam
  uma ação para baixar o aceite em PDF no novo timbrado da Secretaria da Saúde. O documento
  reúne unidade solicitante, Código SIAM, CPL, Ata, item, quantidade, valores, fornecedor e
  demais dados disponíveis, com assinatura do usuário emissor como Fiscal de Contrato e do
  secretário vigente cadastrado no sistema.
- **Cadastro central do Secretário:** a aba Cadastros ganhou uma ficha institucional única
  para nome, cargo, secretaria/órgão, ato de nomeação, e-mail e telefone do secretário
  vigente. A ficha pode ser lida pelas telas autenticadas para geração de documentos e
  alterada somente por administrador, evitando nomes e cargos fixos espalhados pelo sistema.
- **Aviso e limite de renovação nas Atas de RP:** cada item de uma ata que já utilizou sua
  única renovação passa a exibir **JÁ RENOVADA · LIMITE ATINGIDO**. A ação de prorrogar é
  removida dessas linhas e o salvamento reconsulta as vigências e o histórico antes de
  aceitar a operação, evitando uma segunda renovação por tela desatualizada.
- **Pedidos de Carona em Atas de RP:** a nova origem de recurso **Carona** pode ser
  selecionada ao criar uma solicitação de item de ATA. O modal segue o fluxo de Recurso
  próprio, sem vínculo com Emenda, e troca o campo livre de unidade por uma seleção das
  Secretarias ativas do cadastro central, exibidas como **SIGLA — Nome**. O **Código SIAM**
  continua obrigatório e é preservado separadamente para regras e relatórios futuros.
- **Movimentações por unidade física no Inventário:** cada item agora possui estado atual e
  linha do tempo próprios para transferência, empréstimo, devolução e baixa, sempre com
  documento comprobatório privado. A ficha “Vida do item” foi reorganizada em Visão geral,
  Aquisição e origem e Histórico e movimentações. Na aba Emendas, a unidade beneficiada
  original permanece inalterada; um asterisco discreto apenas sinaliza que a unidade física
  possui movimentação registrada.
- **Inventário estritamente unitário:** toda quantidade recebida passa a ser materializada
  como uma linha por unidade física, independentemente de patrimônio ou número de série.
  As execuções históricas de ATA antes consolidadas são desmembradas, mantendo o pedido e
  sua quantidade agregada como histórico. Novos recebimentos de aquisição e ATA, inclusive
  em lote e sem patrimônio, também geram somente unidades de quantidade 1.

- **“Ver tudo” unificado entre Emendas e Inventário:** os dois pontos de entrada agora
  abrem a mesma ficha completa do item, combinando planejamento, execução, fornecedor,
  empenho, nota fiscal, AF, patrimônio, série, recebimento, entrega e anexos da unidade
  física selecionada. A ficha mostra somente os valores unitários relevantes — planejado
  da Emenda quando existir, licitado e executado — sem totais agregados do processo,
  empenho ou lote.
- **Chamados sem contrato:** chamados novos agora podem ser marcados como `SEM CONTRATO`
  e seguir para Fiscalização sem criar vínculo fictício. A Fiscalização ganhou um card
  compacto com o total desses chamados e quantos estão pendentes, mantendo os indicadores
  na mesma linha em telas de trabalho.
- **Documentações mensais por vários contratos:** o gerenciador do checklist agora cadastra
  cada documentação uma única vez e permite vinculá-la a vários contratos por seleção,
  mantendo também a opção de exibição em todos os contratos de manutenção. A ordem deixou
  de ser digitada pelo usuário e passa a ser calculada automaticamente; os vínculos e as
  marcações mensais já existentes são preservados.
- **Emenda planejada para futura Ata:** itens de Emenda podem ser vinculados a itens/lotes
  de uma Ata de Registro de Preços ainda em licitação sem criar reserva, requisição, AF ou
  consumo de saldo. Ao gerar a Ata, o usuário decide vínculo a vínculo se cria a
  requisição imediatamente e informa a quantidade efetiva; os demais ficam como
  **Ata vigente — aguardando requisição** e seguem disponíveis no fluxo normal de Atas.
- **Prorrogação bloqueada para aquisições:** contratos classificados como aquisição não
  permitem mais abrir nem salvar prorrogação de vigência em Contratos em execução. A tela
  orienta que eventual ampliação do prazo do objeto seja tratada como
  **Prorrogação/alteração do prazo de entrega** no Controle de Entregas.
- **Edição administrativa de emendas:** cada card da visão por emenda ganhou um pequeno
  botão de edição visível somente para administradores. A alteração atualiza o cadastro
  central da emenda; mudanças no valor cedido passam a recalcular saldo, indicadores e
  demais consultas derivadas após o recarregamento dos dados.
- **Total executado nas emendas:** itens que ainda estão somente em licitação deixam de
  exibir como executados valores legados copiados do planejamento. O valor estimado fica
  em **Vl. licit.** e o **Total exec.** passa a refletir o fluxo contratado/ATA.

- **Número normalizado das NFs:** a listagem unificada e os rótulos de seleção agora
  priorizam `notas_fiscais.numero_normalizado`, mantendo o valor original somente como
  fallback para registros legados sem normalização.
- **Nova NF por contrato no controle mensal:** o botão global foi substituído por uma ação
  compacta em cada card. O modal já abre com contrato, empresa, processo e competência do
  filtro preenchidos, sem permitir trocar o contrato, e o controle mensal inicia no mês
  anterior ao mês corrente.
- **Cadastro de NF simplificado:** removidos do modal os campos Série, Chave de acesso e
  Glosa/desconto. Agora somente número, datas de emissão e recebimento, valor, anexo e
  observações são editáveis; contrato, empresa, processo e competência ficam bloqueados,
  e o status `recebida` é aplicado internamente. As datas abrem preenchidas com a data
  local atual, e Observações respeita os temas claro e escuro.
- **Competência única entre NF e medição:** medições mensais e por demanda agora herdam
  obrigatoriamente a competência da nota fiscal selecionada. O modal mostra o dado apenas
  para conferência, e novas NFs exigem competência no cadastro; ciclos trimestrais mantêm
  sua competência contratual própria.
- **Correção da central de Notas Fiscais:** ajustada a leitura de fornecedores para o
  campo real `cnpj_normalizado`, restabelecendo os cards dos contratos de manutenção e a
  listagem das NFs existentes. Os filtros e a tabela também foram realinhados ao tema e à
  largura disponível.
- **Nova aba Notas Fiscais:** adicionada uma central com cadastro antecipado de NFs de
  serviço, consulta unificada de todas as NFs (serviços, aquisições e atas) e indicação
  explícita de vínculo com medição.
- **Controle mensal de documentos:** contratos de manutenção com prefixo ganham cards por
  empresa/processo e checklist configurável, global ou específico por contrato. As
  marcações são preservadas por competência; a cada novo mês os cards começam desmarcados,
  com pendências primeiro e concluídos ao final.
- **Medições com NF pré-cadastrada:** medições de contrato e medições geradas pela
  Fiscalização agora exigem a seleção de uma NF do mesmo contrato ainda sem medição. O
  valor bruto vem da NF escolhida e o vínculo é protegido como relação um-para-um.
- **Fiscalização de Contratos:** OS fiscalizadas como pendentes agora também podem gerar
  medição, NF e termo de ateste. A situação da OS continua editável depois da medição,
  sem perder os vínculos financeiros e documentais já registrados.
- **Fiscalização de Contratos:** a tabela agora exibe a empresa vinculada e o problema
  relatado no chamado; os dois campos também participam da busca, ordenação e filtros.
- **Gestão de contratos periódicos:** o resumo gerencial agora exibe o valor mensal ou
  trimestral vigente em um cartão próprio. O Contrato 100/2021 foi classificado como
  serviço contínuo mensal fixo com valor mensal de `R$ 16.012,98`, conforme a soma dos
  49 itens técnicos vinculados.
- **Regularização de legado — processo 309/2020:** os 49 itens técnicos cadastrados foram
  materializados e vinculados ao Contrato 100/2021 já vigente; o processo passou para
  `Contratado`, sem criar um novo contrato e preservando 9 itens com quantidade zero.
- **Serviço mensal/trimestral de valor fixo:** itens com quantidade `0` agora podem ser
  salvos e permanecem cadastrados para futura utilização, contribuindo com `R$ 0,00` para
  os valores estimados mensal/trimestral e global.
- **Criar/editar licitação:** os campos de item, quantidade e valor unitário agora aceitam
  colagem vertical a partir de colunas de uma planilha, criam automaticamente as linhas
  necessárias e também permitem colar as três colunas juntas a partir do primeiro item.
  A leitura contempla tanto texto tabulado quanto a tabela HTML enviada por Excel e outros
  editores, inclusive para quantidades e valores monetários.
- **Controle de Entregas / Prazos:** o cabeçalho agora permite selecionar de uma vez as
  pendências visíveis nos filtros atuais, preservando a regra existente que limita as
  ações em lote aos itens de um mesmo contrato.
- **Confirmação de Entrega na Unidade:** pendências agora podem ser selecionadas livremente
  e confirmadas em conjunto, inclusive misturando aquisições, ATAs, unidades e contratos.
  Data, responsável, cargo, observação e termo são aplicados individualmente a cada item;
  eventuais falhas são informadas sem desfazer as confirmações já concluídas.
- **Controle de Entregas:** a busca nas duas subabas agora aceita vários termos
  independentes, inclusive quando eles aparecem em colunas diferentes da mesma linha,
  ignorando acentos e diferenças entre letras maiúsculas e minúsculas.
- **Planilha de Emendas:** a coluna **Item** agora reserva 280 px, evitando que descrições
  sejam espremidas em várias linhas muito curtas; a tabela mantém a rolagem horizontal.
- **Detalhes dos itens:** os modais abertos por Emendas, Inventário, Contratos e execuções
  de ATA agora exibem marca e modelo. Itens de ATA preservam o campo combinado
  **Marca / Modelo**, e itens de contrato sem vínculo com emenda também passam a abrir
  o detalhe em vez de mostrar apenas um aviso.
- **Contratos mensais fixos:** o filtro de modelo agora reconhece contratos com
  periodicidade mensal ou modelo de execução mensal fixo como serviço contínuo de valor
  mensal fixo, em vez de exibi-los como não classificados.
- **Processos SEI com acesso público:** novos processos do tipo SEI agora exigem o link público no cadastro. O identificador abre esse endereço em uma nova aba quando clicado nas telas de Licitações em andamento e Emendas, sem acionar a expansão do card ou os detalhes da linha. Processos históricos sem link permanecem visíveis e informam a ausência do vínculo ao passar o mouse.
- **Recuperacao de senha:** os links solicitam retorno explicito ao dashboard publicado, em vez de depender de `localhost`.

- **Atas Rp Vigentes:** perfis somente visualizadores agora veem apenas a consulta das solicitações. Os controles para criar solicitação, prorrogar, reajustar, encerrar ou excluir ficam ocultos, e as funções também bloqueiam a abertura desses fluxos sem permissão de edição.
- **Fiscalização de Contratos:** corrigido o carregamento infinito causado pelo escopo da verificação de permissão ao montar a tabela.
- **Fiscalização de Contratos:** perfis somente visualizadores não veem mais os controles de seleção nem “Gerar medição”; as funções também recusam essa ação antes de abrir ou confirmar o modal. O banco continua exigindo permissão de edição para qualquer gravação.
- **Licitações em andamento:** contas com acesso somente de visualização, inclusive no perfil Divisão, agora leem a secretaria e a situação manual de cada item em vez de exibir “indefinido”.
- **Licitações em andamento:** os cards agora sempre exibem os textos em letras maiúsculas. No cadastro, Identificador e SC aceitam apenas números e os separadores `.`, `/` e `-`; o campo Identificador não exibe mais exemplo.
- **Licitações em andamento:** ao passar o mouse sobre um card de processo, a dica agora mostra o número da SC vinculada.
- Ajustadas as larguras iniciais das colunas de Inventário, Execuções de ATA e Empenhos para priorizar campos com conteúdo longo.

## 2026-07-30

- **Menu-vitrine no acesso público:** visitantes anônimos agora visualizam, com cadeado,
  as principais funcionalidades do sistema no menu lateral. O clique direciona ao login
  sem abrir painéis nem carregar dados internos; Usuários, Cadastros, Planilhas e o Portal
  de Unidades permanecem ocultos.
- **Emendas públicas com o fluxo completo:** visitantes anônimos voltaram a receber os
  dados derivados de licitação, contrato, empenho, nota fiscal, patrimônio/série e
  recebimento. A leitura pública foi limitada aos catálogos de secretarias e status
  efetivamente vinculados a itens de emendas; as demais abas e operações continuam
  protegidas.
- **Execuções de ATA:** ao expandir uma execução, a tela mostra somente as unidades
  físicas/patrimônios recebidos. Cada linha abre seus detalhes completos por clique, sem
  botão ou painel-resumo duplicado.
- **Data-base e reajustes de itens de ATA:** contratos de qualquer natureza agora podem
  registrar uma data-base de reajuste para consulta. Nos itens vigentes das ATAs, o novo
  fluxo preserva o preço original, registra versões de preço com vigência e mostra AFs,
  NFs posteriores e AFs ainda não recebidas como candidatas. Cada execução pode receber
  separadamente apenas a diferença do reajuste, por recurso próprio ou por uma nova linha
  rastreável na emenda selecionada. O pagamento exige um novo empenho e uma NF informados
  no ato; o empenho é criado, totalmente vinculado à diferença e mostrado no histórico
  discreto da execução e do “Ver tudo”.
- **Prorrogação separada de reajuste:** a prorrogação de ATA deixou de alterar diretamente
  o valor unitário. Mudanças de preço passam exclusivamente pelo fluxo de reajuste, com
  data, percentual informado e histórico.
- **Itens de contratos de aquisição:** a visualização expandida agora mostra patrimônio,
  número de série e empenho por item, além de oferecer **Ver tudo** para abrir os detalhes do contrato.
- **Situação manual nas Licitações:** o antigo status manual fixo foi substituído por uma
  secretaria escolhida no cadastro institucional e uma situação livre de até 55 caracteres.
  O campo **Desde** e os estados automáticos continuam preservados.
- **Cadastro de Secretarias:** a aba Cadastros passou a oferecer uma categoria própria para
  secretarias, já preenchida com as 32 siglas e nomes institucionais informados.
- **Tema inicial claro:** visitantes sem uma preferência previamente salva agora abrem o
  sistema, login e cadastro no tema claro. A escolha individual continua armazenada no navegador.
- **Busca geral de Emendas:** a busca da visualização por emenda agora também encontra o
  objeto da emenda, além dos demais dados do item e do fluxo.
- **Itens agrupados ao gerar contrato:** itens disponíveis com a mesma descrição agora
  aparecem em um único card, com quantidade total fixa e preenchimento compartilhado de
  marca, modelo e valor unitário. Cada origem continua sendo gravada separadamente e pode
  ser desvinculada do card para recuperar a edição individual e a divisão parcial.
- **Empenhos coletivos com seleção parcial:** nos cards agrupados de aquisição, é possível
  escolher somente algumas origens e aplicar o mesmo empenho a elas. Os vínculos continuam
  individuais em `empenho_itens`, respeitam o saldo de quantidade/valor de cada item e não
  são gravados para itens retirados da seleção do contrato.
- **Status da Emenda acompanha automaticamente o contrato:** enquanto o item ainda está
  em licitação, a aba Emendas exibe o status manual definido em **Licitações em
  andamento**. A partir do vínculo com um contrato, o status manual deixa de prevalecer
  e a tela passa a refletir empenho, AF, recebimento e confirmação na unidade a partir
  do Controle de Entregas.
- **AF parcial refletida no andamento:** quando apenas parte da quantidade contratada
  estiver autorizada, o item passa a indicar **AF parcial — saldo aguardando AF**, sem
  aparentar que toda a quantidade já avançou para entrega ou recebimento.
- **Licitação contratada sem edição residual:** itens que já viraram contrato continuam
  travados para alteração manual e também deixam de oferecer a edição da data
  **Desde** ou a barra de aplicação em massa quando não houver item licitatório
  editável no processo.

## 2026-07-29

- **Download de AFs em lote por contrato:** a seleção do Controle de Entregas agora oferece
  `Baixar AFs (N)` quando houver duas ou mais AFs já emitidas. Quando número e data da AF
  são iguais, o download gera uma autorização consolidada: dados do contrato, endereço,
  observações e assinatura aparecem uma única vez, enquanto itens e empenhos são reunidos
  em uma tabela com total geral. Lotes extensos podem continuar em páginas adicionais,
  mantendo uma única assinatura ao final. A seleção permanece travada pelo `contrato_id`,
  sem usar apenas a CPL como fallback.

- **Apresentação da AF consolidada:** a abertura deixou de usar saudação e texto de e-mail.
  Processo, contrato, fornecedor e empenhos passaram a compor um quadro de identificação,
  enquanto local, contatos e prazo aparecem em um bloco próprio de entrega e agendamento.
  O botão de download da AF em uma linha também passou a usar esse mesmo modelo visual.
  A entrega agora evidencia que o agendamento prévio é obrigatório, e as instruções de
  faturamento e pagamento passaram a aparecer em quadro destacado.

- **PDF da Autorização de Fornecimento:** o download individual da AF no Controle de
  Entregas agora inclui o texto de orientação ao fornecedor, CPL, contrato SIAM, empenho,
  prazo, endereço e contatos fixos do Almoxarifado de Bens (Patrimônio), observações para
  o documento fiscal e assinatura com o nome da pessoa logada, sem exibir cargo. A
  geração passou a usar instruções vetoriais do jsPDF, sem captura de tela, eliminando os
  PDFs em branco observados em alguns navegadores. Os assets receberam versionamento para
  impedir o reaproveitamento do gerador anterior em cache.

## 2026-07-27

- **Execuções pendentes de ATA encerrada permanecem em acompanhamento:** o encerramento
  administrativo da ATA ou de um de seus itens continua impedindo novas solicitações,
  mas não encerra automaticamente execuções já emitidas. Enquanto `dt_entrega` estiver
  vazia, a execução aparece nos filtros `VIGENTE` e `Todos` de Atas Rp e permanece no
  Controle de Entregas/Prazos, inclusive com indicação de atraso. Somente execuções
  efetivamente recebidas acompanham a ATA no filtro `ENCERRADO`.

## 2026-07-23

- **Serviço trimestral de valor fixo:** processos e contratos agora podem usar ciclos de
  três meses contados desde o início da vigência. O contrato mantém cobertura contínua
  para chamados corretivos, enquanto cada medição trimestral registra a
  preventiva/calibração e a referência do relatório de serviço antes da vinculação da
  nota fiscal. Reajustes, aditivos, supressões, saldo e valor global passam a considerar
  os ciclos trimestrais restantes, sem alterar o fluxo mensal já existente.

- **Controle de Entregas:** observações livres são temporárias e são apagadas automaticamente quando o recebimento do item é registrado.

- **Recebimento de ATA:** corrigido o bloqueio ao salvar o recebimento causado pela regra de limpeza da anotação temporária.

- **Observações no Controle de Entregas**: cada linha agora oferece o botão compacto `Obs` para registrar uma anotação livre de acompanhamento. O conteúdo é persistido no registro correspondente e fica visível ao passar o mouse sobre o botão.

- **SUEQ - EQUIP como gestora do Portal Unidades**: todos os perfis aprovados vinculados à SUEQ - EQUIP têm automaticamente a mesma visão global e as mesmas ações administrativas já concedidas à Chefia de Divisão no Portal Unidades, inclusive novos cadastros aprovados no futuro. Os perfis permanecem como usuários comuns no dashboard principal.

- **Importação histórica das Atas de Registro de Preços**: foram cadastrados 8 processos CPL, 18 atas (SIAM), 36 itens e 312 execuções da planilha de controle, preservando o estágio real de empenho, AF e recebimento. As 58 execuções de emendas municipais de 2026 foram vinculadas aos itens já existentes, incluindo 110 unidades físicas com patrimônio; atas vencidas permanecem em `VIGENTE` para encerramento pela própria aba de Atas.

## 2026-07-21

- Licitações: itens cadastrados em uma ATA de Registro de Preços passam a ser espelhados automaticamente na licitação, já vinculados ao respectivo contrato e item da ATA. Corrigidos os 36 espelhos ausentes de oito processos já contratados.

- **Renovação de ATA preserva histórico**: reiniciar o saldo não exclui mais solicitações, NFs, patrimônios ou termos anteriores. A renovação define um marco de ciclo para todos os itens do contrato, fazendo o executado do novo ciclo começar em zero.

- **Encerramento de ATA por item**: encerrar um item de ATA não altera mais o status do contrato inteiro. A ação passa a registrar o status, a data e o motivo no próprio item; os demais itens continuam vigentes para renovação ou execução.

- **Exclusão de solicitação de ATA com observação legada**: observações de prazo, inclusive as importadas de planilhas, não bloqueiam mais a exclusão de uma solicitação sem AF. Continuam bloqueando AF, NF, recebimento, patrimônio, entrega na unidade, termo, unidades físicas e sanção.

- **Downloads no “Ver tudo” dos itens**: o detalhe de cada unidade física agora oferece download da nota fiscal e do termo de entrega quando os respectivos anexos existem. Os links são temporários, inclusive para visitantes anônimos, e liberam somente arquivos vinculados ao fluxo público de Emendas; o clique também passa a abrir exatamente a unidade física selecionada.

- **Campos legíveis no recebimento em lote**: quantidade, patrimônio e número de série agora recebem explicitamente as cores do tema, evitando campos pretos no modo claro.

- **Recebimento em lote com uma única nota fiscal**: no Controle de Entregas, vários itens iguais do mesmo contrato, fornecedor e processo podem ser selecionados para registrar um único recebimento. O modal mantém quantidade, unidade, empenho e patrimônios separados por item, enquanto cadastra e anexa a NF somente uma vez.

- **Anexo obrigatório da nota fiscal no recebimento**: o recebimento agora exige PDF ou imagem da NF ao cadastrá-la. NF existente sem anexo também deve receber o arquivo antes de ser vinculada.

- **Número do contrato/SIM obrigatório**: a criação e a edição administrativa de contratos agora exigem o preenchimento do número do contrato/SIM antes de salvar.

- **Contrato/SIM das Bombas de Infusão**: o contrato da Samtronic vinculado aos 11 itens do processo `238/2025` foi corrigido para `174/2026`, mantendo a CPL `238/2025`.

- **Prazo de entrega obrigatório na licitação**: itens de aquisição e de ATA agora exigem prazo inteiro maior que zero antes de qualquer gravação do processo. Os 11 itens de Bomba de Infusão do processo `238/2025` foram regularizados com prazo de 60 dias para permitir a emissão da AF.

- **Número da emenda nos itens do contrato**: o modal de geração de contrato agora identifica cada fonte como `Emenda número/ano`, além da unidade beneficiada, facilitando distinguir itens iguais vindos de emendas diferentes.

- **Gerar licitação a partir de Emendas**: itens ainda não vinculados podem ser selecionados em conjunto nas visualizações Emendas e Planilha. A ação abre o modal de novo processo com natureza `AQUISIÇÃO` e os itens de origem já preenchidos, após revalidar vínculos existentes.

- **Datas distintas no status da licitação**: `DESDE` registra desde quando o item está no status/setor, enquanto `Atualizado em` mostra a última atualização feita no sistema, usando o histórico de status.

- **Data de início do status da licitação**: a aba Licitações agora permite informar a data `DESDE` ao aplicar um status a todos os itens ou individualmente, mantendo o tempo do item no local correto.

- **Exclusão segura de processos**: a aba Licitações agora exibe uma ação de excluir ao lado das ações do processo. A exclusão passa por uma pré-verificação e só é permitida enquanto não houver contrato/ATA ou registros operacionais; itens de emenda são preservados e desvinculados.

- **Divisão como gestora do Portal Unidades**: perfis aprovados definidos com escopo de Divisão passam a ter, somente no Portal Unidades, a mesma visão e as mesmas ações do administrador, sem receber o papel global de admin.

- **Atalho para o Portal Unidades**: o menu lateral agora exibe, como último item, um link que abre o Portal Unidades em uma nova aba.

- **Status detalhado preservado na aba Emendas**: o status por item vindo de
  Licitações (por exemplo, `SEAD – ANALISE DO NACP`) continua sendo exibido mesmo
  quando o status operacional derivado do fluxo estiver diferente.

- **Status detalhado da licitação refletido em Emendas**: alterações feitas por item em
  **Licitações em andamento** agora aparecem imediatamente nas linhas correspondentes da
  aba Emendas, preservando nomes como `SEAD – ANALISE DO NACP`. A categoria geral continua
  sendo usada nos filtros e métricas, sem substituir o status detalhado exibido.

- **Cadastro visível no modo público**: o banner da página inicial agora exibe `Criar conta` ao lado de `Fazer Login`, levando diretamente ao auto-cadastro. Para contas já autenticadas e aguardando aprovação, o banner continua exibindo somente a ação de sair.

- **Produção oficial no Supabase `contratos-dag`**: a documentação e os exemplos de
  configuração passam a tratar `qpvgpfwuurqcqprnpxua` como o único projeto autorizado
  para desenvolvimento, migrations e novas escritas. O projeto `djtwoesmgeetnrztyvzw`
  permanece congelado e somente para consulta.

- **Descrição dos chamados legível por padrão**: a tabela de Chamados Novos agora reserva uma largura adequada para a coluna Descrição e mantém rolagem horizontal nas telas que não comportam todas as colunas.

- **AF duplicada por envio concorrente**: a emissão de AF agora bloqueia o botão enquanto a gravação está em andamento. O banco também serializa emissões para o mesmo item, rejeita AF ativa repetida e impede que a soma autorizada ultrapasse a quantidade contratada, inclusive em duas abas ou requisições simultâneas.

- **Seção herdada ao gerar contrato**: ao gerar um contrato a partir de uma licitação, a seção já definida no processo é carregada automaticamente e fica bloqueada no modal, evitando uma segunda seleção e divergências entre licitação e contrato.

- **Modo Planilha com valores de licitação**: a planilha agora exibe e permite filtrar/ordenar o valor unitário e o valor total da licitação, além dos valores planejados e executados; a exportação Excel também foi atualizada.

- **Campos vazios no detalhamento de Emendas**: NF, empenho e patrimônio sem valor agora aparecem como `-`, evitando caracteres corrompidos de codificação.

- **Detalhamento financeiro por item de Emenda**: a expansão agora separa valor unitário planejado, valor unitário em licitação, valor unitário contratado e total executado; campos sem aplicação aparecem como `—` em vez de `R$ 0,00`.

- **Saldo de Emendas por estágio do processo**: o planejado continua vindo do cadastro da Emenda; durante a licitação o saldo passa a considerar o valor estimado dos itens e, após gerar o contrato, passa a considerar o valor contratado. O modal de novo processo agora exibe o saldo de cada Emenda após a vinculação em tempo real.

- **Itens de emenda no processo**: removido o seletor manual de emenda dentro do item; a vinculação passa a ocorrer pelo botão `Puxar de emenda`, usando o item específico da emenda.

- **Modais sem fechamento pelo fundo**: clicar fora de qualquer modal ou pressionar `Escape` não o fecha mais; o fechamento continua nos controles explícitos do modal.

- **Fontes de recurso simplificadas**: os itens agora permitem somente `Emenda`, `Recurso próprio` e `Outro`; valores antigos sem emenda ou municipais são tratados como `Outro` na edição.

- **SC com barra**: o campo Solicitação de Compra agora aceita números e `/`, permitindo referências como `63456/2025`.

- **Campos obrigatórios no cadastro de Emendas**: `Ano`, `Parlamentar` e `Objeto geral da emenda`
  agora são identificados como obrigatórios no modal e validados antes do salvamento.

- **Licitações já contratadas com status visual correto**: na aba Licitações, processos
  cujos itens já possuem contrato vinculado agora exibem o selo `CONTRATADO`, sem alterar
  o status de licitação armazenado nem a apresentação em outras abas.

## 2026-07-11

- **Exclusão segura de solicitações de ATA**: o botão Excluir agora aparece somente antes da emissão da AF. A interface revalida o estado no momento da ação e um trigger no banco bloqueia exclusão quando há AF, prazo, NF, recebimento, patrimônio, entrega, termo ou sanção. Solicitações ainda elegíveis são removidas por RPC transacional, com limpeza dos vínculos de empenho e recálculo dos saldos.
- **Execuções de ATA expansíveis**: cada linha em Atas Rp Vigentes > Execuções/Solicitações agora expande no próprio quadro para mostrar dados completos da execução e todas as unidades físicas, patrimônios, séries, NF e recebimento. Cada patrimônio possui a ação "Ver tudo", com ficha completa e vínculos de ATA, fornecedor, empenho e Emenda.
- **Solicitação de ATA com IDs UUID**: corrigido o gatilho de isolamento organizacional que tentava converter IDs UUID de Emendas, itens de ATA e outros pais para `bigint`. A resolução da seção agora aceita com segurança os dois tipos de chave e volta a permitir salvar novas solicitações/execuções.
- **Patrimônio opcional e explicitamente definido no recebimento**: o modal compartilhado por Aquisições e ATAs agora exige a escolha "Possui patrimônio? Sim/Não" antes de salvar. Os campos por unidade permanecem ocultos até a escolha; "Sim" exige um patrimônio por unidade e mantém a individualização, enquanto "Não" preserva o item consolidado sem criar linhas vazias nas tabelas de unidades físicas. A decisão persiste no banco e fica coerente nos recebimentos parciais seguintes.

Todas as mudanças relevantes deste projeto. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

> Nota: este projeto não usa versionamento semântico formal nem tags de release. As
> entradas abaixo reconstroem o histórico a partir das **migrations aplicadas** e da
> documentação existente. Datas em formato ISO (AAAA-MM-DD).

## [Não versionado]

### Removido
- **Limpeza do clone `contratos-dag`**: removido o schema desconectado
  `backup_20260701`, excluídos termos de entrega órfãos do Storage e consolidados os
  cadastros duplicados de `AFIP` e `CONNECT HEART`, preservando o registro mais antigo e
  seu CNPJ sem alteração.

### Alterado
- **Isolamento organizacional em todo o sistema**: perfis agora pertencem a uma seção ou à chefia da divisão; permissões por aba continuam definindo visualizar/editar, enquanto o RLS limita os registros à abrangência organizacional. Administradores escolhem no cabeçalho se trabalham em uma seção específica ou na visão da divisão. Emendas passam a exigir seção responsável, e processos/contratos preenchem a seção do usuário automaticamente.
- **Acesso público restrito ao necessário**: visitantes continuam consultando Emendas e abrindo chamados, mas deixaram de ter leitura direta de processos, contratos, ATAs, itens, entregas, empenhos, notas fiscais e fornecedores. Chamados e Fiscalização ficam sob a seção `SUEQ - EQUIP`.
- **Cadastro de processos com tipo simplificado e SC opcional**: o tipo agora fica ao lado esquerdo do identificador e oferece somente CPL, SEI e Outro; Outro abre um campo de texto livre, e o número da Solicitação de Compra pode ser informado separadamente sem ser obrigatório.
- **Contratos em execucao com visualizacao em cartoes**: a lista de contratos passou a
  seguir o mesmo padrao visual das licitacoes, com linha inteira clicavel para expandir,
  destaque para processo/CPL e objeto, e botoes de acao exibidos apenas no contrato aberto.
- **Servico por demanda/execucao como fluxo leve e separado do mensal fixo**: processos de
  servico por demanda agora exigem pelo menos um item, calculam o valor estimado pela soma
  dos itens e geram contratos sem valor mensal automatico. As medicoes manuais podem
  vincular item, descricao e quantidade medida, registrando `contratos_medicao_itens` para
  consumo de saldo por contrato e por item, sem reaproveitar a logica mensal fixa.
- **Vigencia propria para servico por demanda/execucao**: neste tipo de processo, o item
  nao exibe mais prazo em dias; a vigencia passa a ser informada uma vez no processo, em
  meses, e herdada pelo contrato para calcular vigencia/vencimento.
- **Medicao por demanda com multiplos itens**: a medicao manual de servico por demanda
  permite informar varios itens do contrato na mesma medicao. A descricao fica travada
  pelo nome do item selecionado, o valor bruto e calculado pela soma dos itens medidos e o
  fiscal responsavel passa a ser escolhido entre os fiscais cadastrados no contrato.
- **Refatoração estrutural incremental do frontend**: `index.html` foi reduzido para a
  estrutura da SPA e carregamento de arquivos externos. O JavaScript monolítico foi
  extraído e dividido em scripts clássicos menores em `js/legacy/`, preservando ordem de
  execução e handlers inline. Estilos de documentos de impressão foram extraídos para
  `css/print-*.css`. Criada a base de módulos nativos em `js/modules/`, `js/state/` e
  `js/components/` para as próximas extrações sem alterar regra de negócio.

### Corrigido
- **Preparação segura da migração de chamados para produção**: a abertura pública ganhou
  chave idempotente gerada no navegador e RPC v2 transacional, impedindo que uma repetição
  do mesmo envio consuma outro protocolo ou crie outro controle. O ID do chamado agora é
  devolvido pela RPC para o upload de fotos, sem depender de leitura pública da tabela.
  A fiscalização passou a atualizar a OS e seu histórico na mesma transação, e o banco
  voltou a impor um único controle por `chamado_id`.
- **Histórico completo no visualizador público de Emendas**: restaurada a consolidação pública de processo/CPL, contrato/ATA, AF, empenho, nota fiscal, patrimônio, série, recebimento e entrega. As novas policies liberam somente registros operacionais ligados a itens de Emendas, sem tornar públicos contratos e fluxos sem esse vínculo.
- **Upload de termos de entrega sem arquivos órfãos**: falhas após o upload agora removem
  o novo arquivo ainda não vinculado; substituições limpam o termo anterior e exclusões de
  execuções de ATA tentam remover os respectivos arquivos pela Storage API.
- **Bloqueio de medição acima do saldo contratado**: medições de serviço por demanda
  agora impedem salvar item com quantidade maior que o saldo disponível do contrato.
- **Formulário público de chamados no projeto de teste**: o botão "Abertura de Chamados"
  agora abre o `chamado.html` do próprio ambiente, em vez da URL antiga do GitHub. A RPC
  `abrir_chamado_publico` no Supabase de teste (`contratos-dag`) foi ajustada para gerar
  protocolo via `chamados_seq` com `SECURITY INVOKER`, `search_path` fixo e grants mínimos
  para `anon/authenticated`, permitindo abertura pública sem conceder leitura pública dos
  chamados.
- **Atualização de chamados novos no projeto de teste**: as políticas RLS de
  `chamados_controle` agora permitem que usuários autenticados com permissão de edição na
  aba `chamados-novos` atualizem/vinculem o chamado a contrato/CPL, enquanto a abertura
  pública continua limitada ao status inicial "Aguardando abertura".
- **Fiscalização gera medição contratual**: o fluxo da aba Fiscalização passou de
  "Gerar Termo de Ateste" para "Gerar Medição". OS fiscalizadas de um mesmo contrato
  agora podem gerar uma medição no contrato, vincular a NF informada, registrar o termo de
  ateste e exibir o botão "Baixar termo" na aba Medições do contrato. O Supabase de teste
  recebeu a estrutura de `contratos_medicoes`, vínculos com `notas_fiscais`,
  `termos_ateste` e rastreio das OS em `chamados_controle`.
- **Ajustes por item sem rascunho e com manutenção de eventos**: o modal de
  reajuste/aditivo/supressão não permite mais salvar como rascunho; salvar agora
  formaliza o ajuste. As abas de Aditivos e Supressões ganharam ações para editar ou
  excluir eventos registrados, com recálculo do valor atual do contrato e ajuste da
  quantidade do item quando o evento possui item/quantidade rastreável.
- **Aplicação de aditivos/supressões pendentes e quantidades visíveis**: eventos de
  aditivo/supressão que já tinham ficado como rascunho agora podem ser aplicados pela
  própria linha da aba, atualizando quantidade do item e valor atual do contrato. A lista
  de itens passou a mostrar `Qtde inicial` e `Qtde atual`, deixando claro o efeito de
  aditivos e supressões.
- **Percentual de aditivo consistente entre modal e painel**: o card `% aditivo` e a
  coluna da lista principal agora mostram o percentual de aditivo sobre o valor inicial
  reajustado do contrato. O consumo do limite de 25% fica no texto secundário do card,
  evitando confusão com o percentual do limite já utilizado.
- **Limite de 25% em ajustes por item com reajuste simultâneo**: o modal de
  reajuste/aditivo/supressão agora aplica o percentual de reajuste também ao valor
  unitário usado no impacto de aditivo/supressão da mesma linha. Assim, quando o valor
  inicial reajustado aumenta, o consumo do limite de 25% aumenta pela mesma base dos
  itens, evitando que um reajuste alto faça um aditivo acima do limite aparecer como OK.
  Reajustes formalizados também gravam a base reajustada para manter o cálculo correto
  após recarregar.
- **Gerar contrato para serviço mensal fixo não herdava/calculava corretamente os dados da
  licitação**: no modal "Gerar contrato", a vigência e o vencimento agora ficam
  somente leitura para serviço mensal valor fixo, usando os meses cadastrados na licitação
  e recalculando o vencimento pela data de início. Valor mensal e valor global também
  passam a ser calculados automaticamente pelos itens marcados no contrato.
- **Atas Rp Vigentes "perdia" atas encerradas e suas execuções**: `loadAtas` descartava
  contratos/itens/execuções com `status=ENCERRADO` já na busca dos dados (não só na
  exibição), e o filtro de Status do topo só listava valores presentes nesses dados — como
  encerrados nunca chegavam a existir em memória, "ENCERRADO" nunca aparecia como opção e a
  ata ficava inacessível pela UI (dado seguia intacto no banco, só inalcançável). Corrigido:
  `loadAtas` agora mantém tudo em memória (igual `loadContratos` já fazia), e a lógica de
  "esconder encerrado por padrão, mostrar ao selecionar o filtro" que já existia em
  `filtrarAtas` passa a funcionar de verdade. A tabela de Execuções/Solicitações (que não
  tinha filtro de status próprio) ganhou a mesma regra, para não misturar execuções de atas
  encerradas com as vigentes.
- **Item de ATA continuava mostrando "VIGENTE" mesmo com o contrato já ENCERRADO**: o status
  exibido priorizava `atas_itens.status_contrato`, um campo legado nunca sincronizado (sempre
  gravado como `'VIGENTE'` na criação do item e nunca atualizado ao encerrar/reabrir o
  contrato) sobre `contratos.status`, que é a fonte real da verdade e é corretamente
  atualizado pelo botão "Encerrar". Corrigido em `loadAtas` (index.html) e no cache de
  fallback usado por Controle de Entregas — `contratos.status` agora sempre prevalece.
- **Controle de Entregas / Prazos não mostrava itens de aquisição contratados aguardando
  AF**: o filtro comparava `itens.status` com a string `'aguardando'`, que nunca é gravada
  (o valor real após vincular item a contrato é `'contratado'`). Corrigido em
  `loadItensEntregas` — aquisições contratadas voltam a aparecer para emissão de AF.
- **Status do contrato de aquisição ficava travado em "Aguardando emissão da AF" para
  sempre**: nada atualizava `contratos.status` após a emissão da AF ou o recebimento dos
  itens, apesar do texto da UI prometer a transição automática. Agora `contratos.status`
  transiciona automaticamente: `Aguardando emissão da AF` → `VIGENTE` (assim que a 1ª AF é
  emitida, `_ctMarcarVigente`) → `CONCLUIDO` (quando todos os itens do contrato atingem
  100% da quantidade contratada recebida em Controle de Entregas/Prazos,
  `_ctVerificarConclusao`). Contratos `CONCLUIDO` ganham badge próprio e ficam ocultos por
  padrão em Contratos em Execução (igual `ENCERRADO`), com opção manual em "Editar
  contrato" para casos excepcionais.

### Adicionado
- **Tipo de serviço em Licitações/processos**: ao selecionar Natureza = `SERVIÇO`, o modal
  de processo exibe o campo obrigatório "Tipo do serviço" com as opções iniciais de
  contrato de serviço. O valor é salvo em `processos.tipo_servico` e aparece no resumo da
  licitação para preparar as próximas regras específicas por subtipo.
- **Serviço mensal valor fixo**: o subtipo ganhou uma lista obrigatória de itens no cadastro
  da licitação, permitindo vários itens por contrato. Cada item tem descrição, quantidade e
  valor unitário; a quantidade de meses fica no contrato, e os valores mensal/global são
  calculados automaticamente. O global alimenta `processos.valor_estimado`.
- **Itens de serviço mensal na licitação e geração de contrato**: a aba Licitações agora
  conta e exibe os itens salvos em `processos.servico_mensal_itens`. Ao gerar contrato, os
  itens mensais aparecem para marcação e viram registros em `itens` vinculados ao contrato.
- **Filtro "Mostrar municipais antigas"** na aba de Saldo de Emendas: emendas `MUNICIPAL`
  de exercícios anteriores a 2026 (histórico importado das atas encerradas) ficam **ocultas
  por padrão** e só aparecem ao marcar a caixinha, evitando confusão com as municipais
  atuais (`_saldoRowsVisiveis`, `panel-saldo-emendas`).

### Migração de dados (2026-07-02) — correção de processos + cadastro de atas
- **Licitações:** corrigido o `objeto` (nome) de 12 processos SEI 2026 que estavam poluídos
  com a lista de itens; criados 5 processos novos que faltavam (planilha "processos dados
  atualizados"). Números (identificador) já estavam corretos — sem cascata para Emendas.
- **Atas encerradas:** importadas da planilha "CONTROLE DE ATAS ENCERRADAS" (95 blocos de
  item, ~800 execuções). Contratos correspondentes convertidos para `tipo_instrumento=ATA`
  / `status=ENCERRADO` (ou criados quando inexistentes); populadas `atas_itens` e
  `atas_execucao` com todo o histórico e vínculo de emenda. AC (contrato 272) e CPL 445/2023
  preservados (este último sobrepõe atas vigentes — revisar manualmente).
- **Emendas:** criadas 59 emendas MUNICIPAIS históricas (ano deduzido pelo empenho) + itens.
  Federais/estaduais foram **casadas às existentes por código normalizado e apenas
  complementadas** (nunca duplicadas/sobrescritas). Entregas históricas marcadas como
  confirmadas na unidade → refletem no **Inventário** e saem das filas de Controle/Confirmação
  de entrega. Backup completo em schema `bkp_20260702`.

### Adicionado (anterior)
- Documentação técnica e funcional completa em `/docs` (ARCHITECTURE, SCHEMA, DATABASE,
  ROUTES, MODULES, DATA_FLOW, BUSINESS_RULES, API, SECURITY, DEPLOYMENT, TESTING, TODO).
- `README.md`, `CHANGELOG.md`, `.env.example` e `CLAUDE.md` na raiz.
- **Emitir AF para itens de ATA** (Controle de Entregas): modal dedicado `#modal-ata-af`
  (`abrirModalAtaAF`/`salvarAtaAF`) que gera nº de AF + data + previsão de entrega,
  espelhando o fluxo de AF da aquisição. Requer a coluna `atas_execucao.af_numero`
  (migration `20260628141120_atas_execucao_af_numero`).
- **Nova emenda com itens inline**: o modal "Nova emenda" passou a cadastrar a emenda e
  seus itens no mesmo modal (item + valor unitário + status + unidades/qtde por item),
  com cálculo do valor por unidade = unitário × qtde e resumo de comprometido/saldo
  (`neInitItens`, `neAddItem`, `neAddUnidade`, `neRecalc`).

### Corrigido
- **Puxar itens de emenda em licitacoes/aquisicoes**: itens de emenda ja vinculados a
  `atas_execucao` agora ficam bloqueados como "ja vinculado", evitando selecionar de novo
  a parte ja executada por ATA; apenas o saldo dividido/restante continua disponivel.
- **Patrimonio/serie por unidade fisica**: recebimentos de aquisicoes e ATAs agora sao
  refletidos na aba **Emendas** e no **Inventario** como uma linha por patrimonio quando
  patrimonio/serie forem preenchidos. Enquanto nao houver patrimonio/serie, o item continua
  consolidado. Criada `atas_execucao_unidades`, alinhada `itens_entregas_unidades` com
  `unidade_seq`/recebimento e migrado o recebimento ja lancado da ATA para 25 linhas
  individuais.
- **Marca/modelo no recebimento de ATA**: o modal de recebimento passa a puxar
  `atas_itens.marca_modelo`, evitando campo vazio/bugado ao receber item gerado por ATA.
- **Solicitacao parcial de ATA com origem em Emenda**: o salvamento agora usa RPC
  transacional que divide `emenda_itens` quando a quantidade solicitada e menor que o saldo,
  mantendo a parte restante livre para nova solicitacao. Reparado o caso da emenda 2616
  (`AR CONDICIONADO`, ANGELICA): 25 unidades seguem vinculadas a solicitacao e 25 voltaram
  como saldo disponivel.
- **Solicitacao/execucao de ATA no banco de teste**: alinhado o schema de
  `atas_execucao` no `contratos-dag`, incluindo `origem_recurso` e campos de confirmacao
  de entrega, evitando erro de schema cache ao salvar nova solicitacao.
- **Numero da ATA/contrato**: a validacao passou a bloquear apenas letras e espacos,
  permitindo separadores como barra, ponto e hifen.
- **RLS da aba Emendas no banco de teste**: adicionadas as politicas de escrita para
  `emendas` e `emenda_itens`, usando `can_access_tab('dashboard','edit')`, para permitir
  que usuarios admin/aprovados salvem novas emendas sem erro de row-level security.
- **AF de ATA com prazo herdado**: o modal de emissão agora busca o vínculo `ata_item_id`,
  herda o prazo da ATA/licitação, calcula `prev_entrega` automaticamente e bloqueia a
  emissão quando a origem não possui prazo cadastrado. Ao salvar, o avanço também é refletido
  na aba **Emendas** via `atas_execucao`/`emenda_itens`.
- **Fluxo de AF no Controle de Entregas/Prazos**: o botão **Emitir AF** não remove mais
  o item da subaba; o item permanece com os botões **Receber** e **Prazo** até que o
  recebimento interno seja confirmado. O item só aparece em **Confirmação de Entrega na
  Unidade** após o recebimento (`qtde_recebida > 0` ou `data_recebimento` preenchida).
- **Nomenclatura padronizada**: todos os botões, mensagens e textos da interface agora
  usam **Emitir AF** (antes havia mistura com "Emitir Ordem de Entrega").
- **Filtro de visibilidade robusto**: o filtro de itens em Controle de Entregas/Prazos
  agora verifica explicitamente `recebido === true` antes de ocultar o item, evitando
  que itens recém-emitidos desapareçam por inconsistência no `saldo_af`.
- **Confirmação pós-recebimento**: `salvarRecebimento` agora recarrega a subaba de
  Confirmação de Entrega automaticamente após o recebimento interno.
- **Salvaguarda anti-desaparecimento**: adicionado quarto caminho em `loadItensEntregas`
  que captura registros de `itens_entregas` com AF emitida que não foram incluídos por
  nenhum dos três caminhos principais (ex.: falha de join no select aninhado do
  Supabase). Item com `af_numero` preenchido nunca mais fica invisível.

### Alterado
- **Gerar contrato a partir de licitacao**: o campo **Processo / CPL** agora vem travado
  com o processo clicado, em vez de abrir um select para escolher novamente.
- **Aba Emendas como painel consolidado do ciclo do item**: agora o dashboard deriva status,
  AF, empenho, NF, patrimônio e data de entrega a partir de `itens`, `itens_entregas`,
  `itens_entregas_unidades`, `empenho_itens` e `nota_fiscal_itens`, em vez de depender
  somente dos campos manuais de `emenda_itens`.
- **Planilha de Emendas**: adicionada a coluna **Vl. unit. exec.** e renomeada a coluna
  total executada para **Vl. total exec.**, separando melhor planejado vs. executado.
- **Fluxo AF de aquisição no Controle de Entregas**: item com AF emitida deixa
  **Controle de Entregas / Prazos** e passa para **Confirmação de Entrega na Unidade**;
  itens sem AF continuam como "aguardando AF".
- **Status dos modais de emenda/item** agora vêm da mesma fonte da aba *Licitações em
  andamento* (`status_opcoes` com `contexto='licitacao'`, opções manuais) via
  `popularStatusLicitacao()`, em vez de lista fixa no HTML.
- **Modelo de cadastro de nova emenda**: passou a criar **1 linha em `emendas`**
  (valor cedido global) em vez de 1 linha por unidade com o valor dividido igualmente.
  A distribuição por unidade vive nos `emenda_itens`. Emendas antigas (multi-linha)
  permanecem válidas.

### Corrigido
- **Emendas não refletia avanço real do item**: itens com AF/confirmacão na unidade podiam
  continuar mostrando status antigo de licitação ("Em andamento") e campos vazios. O status
  derivado do fluxo agora prevalece quando há AF, recebimento ou confirmação.
- **Empenho vazio em confirmação/Emendas**: quando `itens_entregas.empenho` estava vazio,
  o sistema passa a herdar o empenho vinculado via `empenho_itens`/`empenhos`.
- **"Emitir AF" da ATA não abria** no Controle de Entregas: o modal `#modal-edit-exec`
  estava aninhado em `#panel-atas` (invisível em outras abas) e dependia do array
  `atasExec` não carregado fora da aba Atas. Agora o modal é reparentado ao `body` ao
  abrir e a execução é buscada do banco quando necessário.
- **Lista de status cortada em Licitações em andamento**: o dropdown do select com busca
  (`enhanceSelect`) era `position:absolute` e era recortado pelo `overflow:hidden` do
  bloco da licitação. Passou a usar `position:fixed`, escapando de qualquer ancestral
  com `overflow`.

## Histórico de banco (migrations) — 2026-06

> Reconstruído de `list_migrations` (produção). Ver
> [docs/DATABASE.md](docs/DATABASE.md#migrations-aplicadas-em-produção).

### 2026-06-26
- `recebimento_por_unidade` / `recebimento_por_unidade_search_path`: tabela
  `itens_entregas_unidades` (recebimento por unidade física; NF referenciada sem valor,
  evitando duplicidade) + trigger de agregação `_sync_entrega_agregado`.
- `fase5_drop_inventario_ac_contrato_morto`: limpeza de coluna morta no inventário.
- `fase4_data_entrega_date_e_contratos_valores_num`: datas como `date` e valores de
  contrato numéricos (`valor_*_num`).
- `fase2_emenda_itens_status_id`: `emenda_itens.status_id` (FK para `status_opcoes`).
- `fase1_parlamentar_id_e_unidade_chamados`: normalização de parlamentar e unidade.
- `fase0_mover_backups_para_schema_backup`: backups movidos para schema `backup`.
- `fase8_numero_despesa`, `prod_revisao_cadastros`,
  `prod_hardening_revoke_anon_ciclo_itens` (hardening RLS/anon).
- `prod_fase7_bucket_termos_entrega` (Storage de termos), `prod_fase7_12_atas_execucao_cols`,
  `prod_fase5_6_9_itens_entregas_cols`, `prod_fase9_itens_marca_modelo`,
  `prod_fase6_empenhos_notas_fiscais` (empenhos + notas fiscais).

### 2026-06-25
- `fase3_gera_mais_contratos`: geração de contratos a partir de processos/itens.

### 2026-06-24
- `fase0_itens_e_itens_entregas`: tabelas `itens` e `itens_entregas` (ciclo de vida do item).
- `add_natureza_e_status_processo` + `recreate_vw_processos_resumo_com_natureza`:
  `natureza`/`status` em processos e recriação da view `vw_processos_resumo`.

---

> Mantenha este arquivo atualizado a cada migration ou mudança funcional relevante.
