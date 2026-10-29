# Cobertura de QA — roteador de tickets (IA)

Registro vivo da rodada de testes exploratórios do roteador determinístico
(`agent/tickets-routing.js`) + tools MCP (`src/server.js`). Atualizado a
cada lote. Protocolo completo (formato de pergunta, gatilhos de comando,
regras de não-repetição) descrito em
`~/.claude/plans/o-prompt-a-seguir-witty-melody.md`.

## Inventário do sistema

*(atualizar só quando o código mudar estas capacidades, não a cada lote)*

### Tools MCP (27, em `src/server.js`)

**Catálogos (sem parâmetro):** `listar_areas_tickets`,
`listar_prioridades_tickets`, `listar_canais_tickets`,
`listar_status_tickets`, `listar_departamentos_tickets`,
`listar_usuarios_tickets`.

**Busca pontual:** `buscar_usuarios_por_nome` (`nome`),
`buscar_ticket_por_numero` (`numero`), `buscar_tickets_por_texto` (`texto`
+ filtros comuns).

**Listagem (filtros comuns: status/area/departamento/operador/cliente/
prioridade, a maioria também dataInicio/dataFim, limite, pagina):**
`listar_tickets`, `listar_tickets_sem_operador`,
`listar_tickets_abertos_mais_antigos`, `listar_tickets_vencidos`,
`listar_tickets_mais_recentes`, `listar_tickets_mais_antigos`,
`listar_tickets_congelados`, `listar_tickets_abertos`,
`listar_tickets_fechados`.

**Resumo/contagem (filtros comuns + `situacao` aberto/fechado + `ordem`
asc/desc + `limite`):** `resumo_tickets_por_status`,
`resumo_tickets_por_prioridade`, `resumo_tickets_por_area`,
`resumo_tickets_por_operador`, `resumo_tickets_por_cliente` (limite padrão
20), `resumo_tickets_por_departamento` (só status/area/operador/limite/
ordem — sem prioridade/situacao/período).

**Visão ampla / pessoa específica:** `resumo_operacional_tickets` (area/
departamento + período), `analisar_carga_operador` (`operador`
obrigatório), `analisar_atividade_cliente` (`cliente` obrigatório +
período).

### Intenções (ticket-decision, chamam 1 tool)

`resumo_operacional`, `resumo_por_status`, `resumo_por_prioridade`,
`resumo_por_area`, `resumo_por_operador`, `resumo_por_departamento`,
`resumo_por_cliente`, `buscar_por_numero`, `listar_congelados`,
`buscar_usuario_por_nome`, `buscar_por_texto`, `listar_abertos_mais_antigos`,
`listar_vencidos`, `analisar_carga_operador`, `analisar_atividade_cliente`,
`listar_mais_antigos`, `listar_mais_recentes`, `listar_abertos`,
`listar_fechados`, `listar_sem_operador`, `listar` (fallback), + 6 intents
de catálogo (mesmo nome da tool). Comparações (`compare`) reusam essas
mesmas tools 2x.

### Intenções de esclarecimento (sem tool, só mensagem)

`esclarecimento_numero_invalido`, `esclarecimento_limite_invalido`,
`esclarecimento_uniao_status`, `esclarecimento_comparacao_relativa_status`,
`esclarecimento_negacao` (valor único e lista 2+), `esclarecimento_data_invalida`,
`esclarecimento_comparacao_3_ou_mais`, `esclarecimento_comparacao_dimensoes_diferentes`,
`esclarecimento_comparacao_sem_nome`, `esclarecimento_comparacao_dimensao_nao_suportada`,
`esclarecimento_uniao_operador_cliente`, `esclarecimento_uniao_valor`,
`esclarecimento_pergunta_conceitual`, `esclarecimento_metrica_nao_suportada`,
`esclarecimento_proporcao_nao_suportada`, `esclarecimento_soma_duas_pessoas`,
`esclarecimento_comparacao_relativa_prioridade`, `esclarecimento_uniao_prioridades`,
`esclarecimento_contradicao`, `esclarecimento_termo_ambiguo` (2 variantes),
`esclarecimento_canal_nao_suportado`, `esclarecimento_comentario_anexo_nao_suportado`,
`esclarecimento_analise_sem_filtro_de_dimensao` (2 variantes), `fora_do_dominio`.

### Entidades (`entities`)

`status`, `area`, `departamento`, `operador`, `cliente`, `prioridade`,
`situacao` (aberto|fechado), `dataInicio`, `dataFim`, `limite`, `pagina`,
`numero`, `texto`, `ordem` (asc|desc), `nome`. **Não existem** `canal` nem
`comentarios`/`anexos` como filtro real — só geram esclarecimento.

### Datas/períodos suportados

Relativos: hoje/ontem/amanhã, semana passada/essa semana, último dia do
mês, mês passado/retrasado/esse mês, semestre (esse/passado/último),
trimestre nomeado ou numérico (1º–4º, "passado"/"último", com/sem ano),
quinzena, ano (esse/passado), "entre mês e mês [de ano]", "desde/a partir
de mês ou dia", "no mês de X", intervalo de dias dentro de um mês,
intervalo de dias cruzando mês, "últimos N dias úteis" (pula fds),
"últimos N dias/semanas/meses/anos", "há/faz mais de N ..." (aberto).
Absolutos: ISO, extenso, BR (DD/MM/AAAA), intervalo "de D de mês a D de
mês de ano" (ano comum), "entre/de ... e/até/a ...", "desde"/"até"
abertos, dia único.

### Formato (tabela/gráfico)

Detecção pega o que ocorre **depois** no texto se os 2 baterem. Tabela:
mostra/exibe/apresenta/coloca/visualiza/transforma/gera + tabela/planilha;
"excel" bare. Gráfico: faz/cria/gera/monta/visualiza/transforma + gráfico;
"graficamente"; "de forma gráfica/visual". Só aplicado quando exatamente 1
tool foi escolhida e não é comparação. 9 tools aceitam gráfico de verdade
(`TOOLS_COM_GRAFICO`: os 6 `resumo_tickets_por_*` + `resumo_operacional_tickets`
+ `analisar_carga_operador` + `analisar_atividade_cliente`); as outras 18
(catálogos, buscas, listagens paginadas) pedem gráfico e caem pra tabela
em silêncio (by design, não é bug).

### Continuação conversacional

Marcadores (início da frase, texto normalizado): "e desses", "desses",
"e os"/"e as", "só os"/"só as", "apenas os"/"apenas as", "e quanto a(os)",
"e por", "agora", "quant[ao]s são/é". Mais `isBareFormatoRequest` (pedido
de formato sozinho, sem nenhuma palavra do domínio). Merge = concatenação
simples + reroteamento do zero.

### Verbosidade

`detalhado` ("detalhado(s)", "com detalhes", "na íntegra") / `resumido`
("resumido(s)", "de forma breve/resumida", "só o essencial") — só nos
branches de listagem (não em resumo por dimensão nem em catálogo).

### Suíte de testes

18 arquivos, 680 `test()` — `tickets-routing.test.js` concentra 437.

## Cobertura retrospectiva (antes deste protocolo, melhor esforço)

Nas ~20 rodadas ad-hoc anteriores a este protocolo (dentro desta mesma
conversa), ficaram **bem cobertos**: sinônimos de operador/cliente/área/
departamento (técnico, responsável, atendente, solicitante, categoria,
equipe, setor), combinações de filtro (área+departamento+prioridade+data),
datas relativas e absolutas (incluindo trimestre/semestre/dias úteis),
ambiguidade de nome de cliente (substring batendo em 2+ pessoas reais) e
de departamento (match exato vence substring), extração de parâmetros
(limite negativo, número de ticket inválido), ranking melhor/pior nas 4
dimensões (operador/cliente/área/departamento).

Ficaram **testados só pontualmente** (1-2 casos, não a fundo):
continuação conversacional (só 1 caso ao vivo nesta sessão), formato
tabela/gráfico (focado em verbos faltantes, não em todas as combinações
E/F do prompt), intenções semelhantes (resumo vs listagem).

**Não encontrei evidência de teste dedicado** (pode ter acontecido em
rodadas anteriores a esta conversa, sem registro recuperável — tratar como
não coberto até confirmar o contrário): robustez a erros de digitação/
pontuação/frases incompletas (L), tentativas de induzir a IA a ignorar
regras ou inventar filtro (O), contradições explícitas dentro de 1 só
pergunta (I) além dos poucos casos já fixados, e a maior parte da matriz
de "pedido de gráfico/tabela complementar ou mudando o formato de uma
resposta anterior" (E, via continuação).

## Lotes

### Lote 12 — gerado, aguardando execução — ângulos: F (o fix do Lote 11, bug T08, só cobriu operador — nunca testado se o mesmo bug de "continuação repete a palavra-chave com um nome novo" também afeta cliente/área/departamento), B (negação com "nunca" — só testada pra operador/situação no Lote 11, nunca pras outras 4 dimensões do loop de `detectaNegacaoNaoSuportada`), J (comparação de prioridade/status via os OUTROS padrões de `extractOperatorComparisonNames` que não ganharam o guard do Lote 11 — só o padrão BARE "tickets de X" foi corrigido; autocomparação da mesma pessoa, nunca testada), M (integridade cruzada com cliente, dados novos), H (limite decimal/notação científica, nunca testados), C (hora do dia informal — "essa madrugada"/"ontem à noite"), G (grafia extrema combinada: maiúscula + sem acento + espaço triplo ao mesmo tempo), N (comparação entre 2 NÚMEROS de ticket, um deles inválido — nunca tentada), L (emoji e code-mixing de idioma, nunca testados)

Motivo da escolha: o fix do Lote 11 (bug T08, `extractLastKeywordMatch`) foi
aplicado só ao 1º padrão de `extractOperatorName` — nunca confirmamos se
`extractClientName`/`extractAreaName`/`extractDepartmentName` sofrem do
MESMO bug (continuação que repete a palavra-chave de dimensão com um nome
novo ficando com o nome antigo). O vocabulário "nunca" (Lote 11, bug T04)
só foi testado pra operador (dimensão N-valorada) e pra situação aberto/
fechado (binária) — nunca pras outras 4 dimensões que também usam o mesmo
loop (`área`, `departamento`, `status`, `prioridade`, `cliente`). O guard
de prioridade/status do Lote 11 (bug T13) só foi aplicado ao padrão BARE
"compare os tickets de X" de `extractOperatorComparisonNames` — os outros
~6 padrões da mesma função (e os espelhos de cliente/área/departamento)
nunca foram checados contra o mesmo problema. Autocomparação (mesmo nome
nos 2 lados) nunca foi tentada em nenhum lote. Limite decimal/notação
científica nunca foram tentados (só inteiro negativo/zero/muito grande já
foram). Hora do dia informal (madrugada/noite, sem hora numérica) nunca
foi tentada — só "pela manhã/tarde/noite" (Lote 6) tocou esse vocabulário,
de um jeito diferente. Grafia com 3 problemas SIMULTÂNEOS (maiúscula+sem
acento+espaço triplo) só foi testada 1 problema por vez até agora.
Comparação entre 2 NÚMEROS de ticket (um deles inválido) nunca foi
tentada — só comparação entre pessoas/áreas/departamentos/status/
prioridade. Emoji e mistura de idioma (code-switching) nunca foram
tentados em nenhuma das 11 rodadas anteriores.

- Perguntas: L12-T01 .. L12-T20 (ver mensagem do lote)
- Dados reais usados (puxados agora via API do OcoMon): clientes reais
  novos "Luiz Henrique Coura" (18 tickets abertos), "João Messias Alves da
  Silva" (3 tickets abertos), "Marina Machado Cunha e Mello" (1 ticket
  aberto) — ranking de clientes por tickets abertos confirmado agora;
  operador "Fabio Gali"; áreas "Suporte"/"Governança"; departamentos
  "SYSADMIN"/"COIDS"; status "Cancelado"/"Encerrada"; prioridades "Alta"/
  "Baixa"/"Urgente"; ticket real 4830
- Resultado: **executado por mim** (`routeTicketQuestion` em lote pra
  checagem de intenção/entidade + 1 chamada por vez na API do OcoMon pros
  casos que precisavam de confirmação ao vivo, incluindo 3 encadeamentos
  de 2 turnos)
- Bugs encontrados (5, por ordem de severidade):
  1. T15 — "Quantos tickets foram abertos essa madrugada?": "madrugada"
     não é reconhecida por nenhum vocabulário de hora do dia nem data, e a
     pergunta cai em `listar_tickets` SEM FILTRO NENHUM — confirmado ao
     vivo devolvendo os 5270 tickets do sistema inteiro (pior que o
     esperado: nem o dia de hoje ficou como filtro, a palavra inteira foi
     descartada sem deixar rastro nenhum).
  2. T01 — continuação "E quanto ao cliente João Messias Alves da Silva?"
     depois de "Quantos tickets o cliente Luiz Henrique Coura tem?": o
     fix do Lote 11 (`extractLastKeywordMatch`) só foi aplicado a
     `extractOperatorName`, nunca a `extractClientName` — o cliente fica
     com o valor ANTIGO ("Luiz Henrique Coura") E, pior, o último nome
     ("Silva") também é capturado por um padrão totalmente diferente como
     se fosse um nome de OPERADOR solto no fim da frase — confirmado ao
     vivo com a mensagem `operador "Silva" é ambíguo (pode ser: Rogerio Da
     Silva E Souza, Pietra Silva)` (e duplicada 2x na mesma resposta),
     completamente fora de contexto pra uma pergunta que nunca mencionou
     operador.
  3. T02/T03 — mesmo bug do Lote 11 (T08), nunca corrigido pra ÁREA/
     DEPARTAMENTO: "Tickets da área Suporte." → "E quanto à área
     Governança?" e "Quantos tickets o departamento SYSADMIN tem?" → "E
     quanto ao departamento COIDS?" ficam com o valor ANTIGO (Suporte/
     SYSADMIN) nos 2 casos — confirmado ao vivo, mesma contagem do turno
     1 repetida (4472 e 2541), ignorando por completo o 2º turno.
  4. T09 — "Quem tem mais tickets, prioridade Alta ou prioridade Baixa?"
     cai em `esclarecimento_uniao_prioridades` (categoria errada — trata
     como se o usuário quisesse as 2 prioridades AO MESMO TEMPO) em vez de
     `esclarecimento_comparacao_dimensao_nao_suportada` (a categoria
     certa pra uma pergunta de comparação) — confirmado ao vivo. Seguro
     (não inventa dado, recusa honesto), só com a mensagem um pouco
     desalinhada do que foi perguntado.
  5. T13 — "Liste os 2.5 tickets mais antigos.": o limite decimal é
     truncado em silêncio pra 2 (`Math.trunc`/`parseInt` implícito), sem
     nenhum aviso — inconsistente com todo o resto da família de
     validação de limite (negativo/zero/grande demais já pedem
     esclarecimento) — confirmado ao vivo devolvendo exatamente 2
     tickets sem menção ao "2.5" original.
- Confirmados corretos/por design: T04/T05/T06/T07 ("nunca" generalizado
  no Lote 11 pra operador/situação funciona igual pras outras 4 dimensões
  do loop — cliente/área/status/prioridade —, todos `esclarecimento_
  negacao`), T08 (autocomparação do mesmo operador 2x devolve os 2 lados
  iguais, sem erro nem mensagem confusa), T10/T11 (comparação de
  status/prioridade via os OUTROS padrões de `extractOperatorComparisonNames`
  — "compare a carga do X" e a forma BARE com "status" — também recusam
  honesto: o guard do Lote 11 está no bloco COMPARTILHADO de pós-match,
  não só no padrão BARE original, cobrindo todos os padrões da função de
  uma vez), T12 (integridade: 18 tickets abertos do cliente Luiz Henrique
  Coura bate exatamente com o resumo isolado), T14 (notação científica
  "1e3" não é reconhecida como número, cai no limite padrão com
  segurança), T16 ("ontem à noite" preserva o filtro do DIA certo,
  só não filtra a parte da noite — mesma limitação já aceita desde o
  Lote 6 pra "pela manhã/tarde/noite"), T17 (grafia com 3 problemas
  simultâneos — maiúscula + sem acento + espaço triplo — resolve certo
  pra área Governança, 40 tickets), T18 (comparação com número de ticket
  inválido cai em `esclarecimento_numero_invalido`, não inventa
  comparação), T19 (emoji no fim da frase não quebra nada), T20
  (code-mixing inglês/português reconhece a parte em português
  normalmente).
- Correções aplicadas: todos os 5 corrigidos e verificados (763 testes
  passando, ao vivo na API do OcoMon e smoke test). Bug 1 (T15): novo
  caso em `extractRelativeDateRange` pra "essa/esse madrugada/manhã/
  tarde/noite" (sem a palavra "hoje"), mapeado pro mesmo valor de HOJE já
  calculado pelo caso "hoje" bare. Bug 2 (T01): mesma técnica do Lote 11
  (`extractLastKeywordMatch`) aplicada ao padrão ancorado em "cliente" de
  `extractClientName` — corrigir a extração do cliente em si também fez o
  resíduo que vazava pra operador desaparecer (não precisou de nenhuma
  mudança em `isOperadorContidoNoCliente`). Bugs 3/4 (T02/T03): mesma
  técnica aplicada aos padrões ancorados de `extractAreaName` (mantendo o
  padrão secundário "o pessoal da/do X" como fallback) e
  `extractDepartmentName` (único padrão da função). Bug 5 (T09):
  `mencionaComparacaoPrioridadeOuStatus` ganhou uma 2ª forma de gatilho —
  "quem tem mais tickets: X ou Y" (já aceita pros 4 extratores reais) além
  do "comparar" literal — sem isso, essa variante nunca alcançava o guard
  dedicado, caindo em `detectaUniaoDePrioridades` (categoria errada). Bug
  6 (T13): novo `DECIMAL_LIMIT_PATTERN` (mesma família de
  `NEGATIVE_LIMIT_PATTERN`/`ZERO_LIMIT_PATTERN`), mensagem do esclarecimento
  de limite ajustada pra mencionar "número inteiro" (cobre as 3 formas
  agora).
- Regressão pendente: nenhuma — testes já criados (`test/tickets-
  routing.test.js`)

### Lote 11 — gerado, aguardando execução — ângulos: K+D (comparação departamento x departamento SEM nenhuma área envolvida — gap conhecido desde o Lote 7, nunca corrigido), I (autocontradição em status/prioridade — o loop generalizado no Lote 9 só cobre operador/área/departamento), B (negação com "nunca" em vez de "não"; negação tripla "nem X nem Y nem Z"; negação de status multi-palavra colidente), O (pergunta de CAPACIDADE negada, em continuação de 2 turnos, e controle de capacidade de LEITURA — isCapabilityQuestion só tem unit test isolado até agora), F (continuação "e quanto AO" no singular; troca de dimensão real via "E como cliente `<nome>`?" COM nome explícito), C (data de calendário inválida 31/02; ano futuro extremo 2099), J (comparação entre 2 pessoas colidentes operador+cliente; comparação de PRIORIDADE, nunca tentada), L (frase truncada no meio do nome, 2 variações), M (integridade cruzada: soma de 2 cargas individuais vs. resumo_por_operador), G (grafia sem nenhum acento em valor multi-palavra real)

Motivo da escolha: comparação DEPARTAMENTO x DEPARTAMENTO sem nenhuma área
envolvida ficou marcada como gap aberto desde o Lote 7 (só a forma mista
área+departamento foi testada) e nunca foi corrigida nem exercitada depois
disso. A generalização de `detectaContradicao` pra área/departamento no
Lote 9 só cobriu essas 2 dimensões + operador — nunca status nem
prioridade, que usam vocabulário de valor diferente (ex.: "sejam Urgente")
e podem não cair no mesmo loop. Negação com "nunca" (em vez de "não") e
negação tripla "nem X nem Y nem Z" (só dupla testada no Lote 10) nunca
foram tentadas. `isCapabilityQuestion` (Lote 10) só tem cobertura em teste
unitário isolado de `write-policy.js` — nunca através do roteador completo
em continuação, nunca na forma NEGADA ("você NÃO consegue..."), e o
controle de capacidade de LEITURA (que não deveria bloquear) nunca rodou
contra o servidor ao vivo. O marcador de continuação "e quanto a(os)" nunca
foi confirmado na forma singular contraída "ao" isoladamente. O fix do
Lote 9 (bug T17, "E como cliente?") só tratou o caso SEM nome — nunca
confirmamos se "E como cliente `<nome>`?" (com o nome repetido) troca a
dimensão de verdade. Data de calendário inválida (31 de fevereiro) e ano
futuro extremo (2099) nunca foram tentados. Comparação entre 2 pessoas que
são operador E cliente ao mesmo tempo (ambas colidentes) nunca foi feita, e
comparação de PRIORIDADE como dimensão nunca foi tentada (só status já foi,
e recusou). Frase truncada no meio do próprio nome (não só abreviação
proposital) é um caso de robustez (L) ainda não exercitado. Integridade
cruzada (M) comparando o resultado de uma comparação de carga contra o
resumo_por_operador independente nunca foi verificada formalmente. Grafia
100% sem acento num valor de catálogo multi-palavra real ("GOVERNANCA" sem
cedilha/til) nunca foi confirmada ao vivo.

- Perguntas: L11-T01 .. L11-T20 (ver mensagem do lote)
- Dados reais usados (puxados agora via API do OcoMon): departamentos
  "SYSADMIN"/"COIDS" (sem colisão de área — confirmado agora que as 8
  áreas reais são DEFAULT/USUÁRIOS/Redes e Segurança/WEB/Suporte/
  Governança/Infraestrutura Científica/Gestão, nenhuma delas é SYSADMIN
  nem COIDS), status real multi-palavra "AGENDADO COM O USUÁRIO" e
  "RESERVADO PARA OPERADOR", prioridades "Alta"/"Baixa"/"Urgente"/"Média",
  operadores reais "Fabio Gali" (1106 tickets) e "Cesar Augusto de Mello"
  (1080 tickets, soma confirmada agora via `resumo_tickets_por_operador`),
  pessoas colidentes (operador E cliente) "Wanilene Cassiano" e "Darío
  Gerardo Fantini" (ambas confirmadas em lotes anteriores), área
  "Governança" (pra teste de grafia sem acento)
- Resultado: **executado por mim** (`routeTicketQuestion` em lote pra
  checagem de intenção/entidade + 1 chamada por vez na API do OcoMon pros
  casos que precisavam de confirmação ao vivo, incluindo 2 encadeamentos
  de 2 turnos e 1 de 3 turnos)
- Bugs encontrados (6, por ordem de severidade):
  1. T04 — "Tickets que nunca foram do operador Fabio Gali.": a negação
     com "nunca" (em vez de "não"/"nem") não é reconhecida por nenhum
     vocabulário de negação, e a frase é tratada como filtro AFIRMATIVO —
     confirmado ao vivo devolvendo exatamente os 1106 tickets QUE SÃO do
     Fabio Gali, o oposto exato do que foi pedido. Pior bug desta rodada:
     não é um despejo sem filtro nem uma falha honesta, é uma resposta
     confiante e INVERTIDA.
  2. T08 — continuação "E quanto ao operador Diego Mota?" depois de
     "Quantos tickets o operador Fabio Gali tem?": como o turno anterior
     também citava a palavra-chave "operador" + nome, o texto mesclado
     (concatenação pura, re-roteado do zero) tem 2 ocorrências de
     "operador `<nome>`" — a extração pega a 1ª (Fabio Gali, do turno
     ANTIGO) e descarta a 2ª (Diego Mota, o que o usuário está pedindo
     agora) por completo — confirmado ao vivo devolvendo a MESMA resposta
     do turno 1 (1106 tickets de Fabio Gali) como se fosse a resposta
     sobre Diego Mota. A forma isolada ("E quanto ao operador Diego
     Mota?", sem o turno anterior) resolve Diego Mota corretamente (19
     tickets) — o bug só aparece quando a MESMA palavra-chave de dimensão
     se repete nos 2 turnos.
  3. T15 — "Quantos tickets o Cesar Augusto de Mello t" (frase cortada no
     meio da última palavra, "tem" → "t"): a âncora de verbo completo não
     bate, o nome inteiro é perdido e a pergunta cai em `listar_tickets`
     SEM FILTRO NENHUM — confirmado ao vivo devolvendo os 5270 tickets do
     sistema inteiro.
  4. T02 — "Tickets que sejam Urgente e que também não sejam Urgente.":
     autocontradição não detectada pra PRIORIDADE (o loop generalizado no
     Lote 9 só cobre operador/área/departamento) — aplica só o lado
     afirmativo em silêncio, confirmado ao vivo devolvendo 24 tickets
     Urgentes como se a pergunta nonsense tivesse uma resposta válida.
  5. T03 — mesma autocontradição não detectada, agora pra STATUS
     multi-palavra ("Reservado para operador") — além de não detectar a
     contradição, a cláusula residual "e que também não estejam" vaza
     pros 2 lados (status E operador) simultaneamente, confirmado ao vivo
     com a mensagem dupla confusa `status "Reservado para operador e que
     também não estejam" não encontrado; operador "e que também não
     estejam" não encontrado`.
  6. T13 — "Compare os tickets de prioridade Alta com os tickets de
     prioridade Baixa.": comparação de PRIORIDADE nunca foi tentada —
     `extractOperatorComparisonNames` captura "prioridade Alta"/"prioridade
     Baixa" inteiros como se fossem NOMES de operador, confirmado ao vivo
     com a mensagem enganosa `operador "prioridade Alta" não encontrado`
     em vez de uma recusa honesta sobre dimensão de comparação não
     suportada (mesmo padrão já usado pra status).
- Confirmados corretos/por design: T01 (comparação departamento x
  departamento sem área recusa honesto via `esclarecimento_comparacao_
  sem_nome` — gap de suporte conhecido desde o Lote 7, mas falha com
  segurança, não inventa nem escolhe um lado), T05/T06/T07 (`isCapability
  Question` dispara certo através de continuação de 2 turnos, na forma
  NEGADA, e corretamente NÃO dispara pro controle de capacidade de
  leitura — confirmado ao vivo nos 3), T09 ("E como cliente Wanilene
  Cassiano?" com o nome repetido troca a dimensão de verdade pra cliente,
  20 tickets, diferente dos 10 como operadora — confirmado ao vivo,
  melhor que o esperado já que o Lote 9 só garantiu não perder o filtro,
  não trocar a dimensão), T10 (31/02 cai em `esclarecimento_data_
  invalida`), T11 (ano futuro 2099 aplica o filtro e devolve 0 tickets com
  segurança, sem erro), T12 (comparação entre 2 pessoas AMBAS colidentes,
  cada uma com a dimensão oposta explícita, recusa honesto via
  `esclarecimento_comparacao_dimensoes_diferentes`, mesmo com a dupla
  colisão), T14 ("Fabio Gal" truncado resolve por substring pra "Fabio
  Gali", 1106 tickets, mesmo comportamento já estabelecido), T16 (ação
  externa persiste nos 3 turnos — turnos 1 e 2 bloqueados pelo guard, e o
  3º, "Confirma que já foi enviado?", não bate em nenhum marcador de
  continuação e cai honesto em `fora_do_dominio` SEM confirmar falsamente
  que algo foi enviado), T17 (integridade: carga de Fabio Gali=1106 e
  Cesar Augusto de Mello=1080 na comparação batem exatamente com
  `resumo_tickets_por_operador` isolado), T18 (negação do status
  multi-palavra colidente "Agendado com o usuário" reconhecida por
  completo, sem truncar), T19 (grafia 100% sem acento "area GOVERNANCA"
  resolve pra área Governança, 40 tickets, mesmo total já confirmado em
  lotes anteriores), T20 (negação tripla "nem X, nem Y, nem Z" cai em
  `esclarecimento_negacao`, mesmo padrão já usado pra negação dupla/de
  lista).
- Correções aplicadas: todos os 6 corrigidos e verificados (758 testes
  passando, ao vivo na API do OcoMon e smoke test). Bug 1 (T04): "nunca"
  somado ao vocabulário de `NEGATION_MARKER_SOURCE` (dimensões N-valoradas)
  e de `NEGATION_PREFIX_SOURCE` (binário aberto/fechado), as 2 listas
  paralelas que já tinham saído dessincronizadas antes. Bug 2 (T08): nova
  `extractLastKeywordMatch` (genérica, scaneia TODAS as ocorrências de um
  padrão ancorado em palavra-chave e usa a MAIS À DIREITA, não a 1ª que
  `.match()`/`extractByPatterns` sempre prefeririam) aplicada ao 1º padrão
  de `extractOperatorName` (o ancorado em "operador"/sinônimos) — corrige
  tanto a continuação mesclada quanto o caso de 1 mensagem só com a mesma
  palavra-chave repetida 2x. Bug 3 (T15): novo "|t" como alternativa ao
  verbo completo "tem" no padrão "quantos tickets `<nome>` tem" de
  `extractOperatorWorkloadName`, só quando é a ÚLTIMA coisa da string (nada
  depois). Bugs 4/5 (T02/T03): generalizado o loop de autocontradição em
  `detectaContradicao` (já cobria operador/área/departamento desde o Lote
  9) pra também cobrir prioridade/status, com "esteja"/"estejam" somado ao
  vocabulário verbal (status combina com "estar", não "ser"); e
  `TRAILING_SELF_NEGATION_CLAUSE_PATTERN` (poda a cláusula de autonegação
  do VALOR capturado, usada por `cleanFreeText` — usada por TODAS as
  dimensões, não só operador) ganhou o mesmo vocabulário ampliado
  ("também" opcional + "seja/sejam/esteja/estejam"), que só existia dentro
  de `detectaContradicao` desde o Lote 9 — mais uma vez as 2 listas
  paralelas (extração vs. detecção) tinham saído dessincronizadas, mesma
  classe de bug já vista antes (negação com "nunca" acima, e o aviso
  explícito já registrado no comentário de `NEGATION_PREFIX_SOURCE`
  sobre esse exato risco). Bug 6 (T13): novo guard
  `mencionaPrioridadeOuStatusNoMatch` (ancorado no INÍCIO do trecho
  capturado, não em qualquer lugar — evita falso positivo quando
  prioridade/status aparece só como qualificador de passagem no fim da
  frase) no padrão BARE "compare os tickets de X com os tickets de Y" de
  `extractOperatorComparisonNames`, mesma família dos guards já existentes
  pra cliente/área/departamento — sem ele, o guard dedicado
  `esclarecimento_comparacao_dimensao_nao_suportada` (que já existia) nunca
  era alcançado, porque o extrator de operador roubava o match antes.
- Regressão pendente: nenhuma — testes já criados (`test/tickets-
  routing.test.js`) — gerado, aguardando execução — ângulos: O (pergunta META sobre CAPACIDADE, não um pedido de ação de verdade — nunca testada, risco de falso positivo do write-guard/ação externa), D (análise aplicada a área/departamento, não só pessoa), G (espaçamento/caixa irregular em status real multi-palavra), E+verbosidade (verbosidade combinada com comparação, nunca testada junto), A (coloquial extremo com abreviação/typo), M (integridade por prioridade), N (página absurdamente grande + filtro real), J (percentual revisit), F (continuação de 3 turnos: chip + novo marcador "e como"), K (sinônimo "demorando" para SLA vencido/mais antigo), B (negação de união — "nem X nem Y"), C (semestre numerado + ano explícito), E (negação explícita de formato + pedido do formato oposto na mesma frase)

Motivo da escolha: O sempre testou PEDIDOS de ação (diretos ou
especulativos) — nunca uma pergunta sobre se o sistema TEM a capacidade,
que é semanticamente diferente (não deveria ser bloqueada, é uma pergunta
respondível). D só testou "análise"/"carga" pra pessoa (operador/cliente)
— nunca pra área/departamento. Espaçamento/caixa irregular em valor de
catálogo multi-palavra nunca foi testado (só nomes simples). Verbosidade
(Lote 4) nunca foi combinada com comparação. "Demorando" como sinônimo de
atraso/SLA nunca foi testado. Negação com "nem X nem Y" (dois valores
negados com conector diferente de "e") nunca foi testada. "2º semestre de
2025" (ordinal + ano explícito, ano passado) é uma variação nunca
exercitada da forma "semestre" já suportada.

- Perguntas: L10-T01 .. L10-T20 (ver mensagem do lote)
- Dados reais usados: status "Reservado para operador" (Lote 9), área
  "Suporte", departamento "SYSADMIN", operadores "Fabio Gali"/"Diego
  Mota", prioridades "Alta"/"Urgente"/"Baixa"/"Média"
- Resultado: **executado por mim** (`routeTicketQuestion` em lote pra
  checagem de intenção/entidade + 1 chamada por vez na API do OcoMon pros
  casos que precisavam de confirmação ao vivo, incluindo a cadeia de 3
  turnos)
- Bugs encontrados (6, por ordem de severidade):
  1. T01 — "Você consegue fechar tickets?" (pergunta de CAPACIDADE, não um
     pedido de ação) não bate em `isWriteRequest` nem `isExternalActionRequest`
     (nenhum dos 2 reconhece "consegue"), e cai direto em `listar_tickets`
     sem filtro nenhum — confirmado ao vivo devolvendo os 5268 tickets do
     sistema inteiro como resposta a uma pergunta de sim/não.
  2. T17 — "Quais tickets estão demorando mais pra fechar?" não bate em
     nenhum sinônimo de SLA vencido/mais antigo — confirmado ao vivo
     devolvendo os 5268 tickets do sistema inteiro, mesma severidade do
     T01.
  3. T13 — "Qual a porcentagem de tickets fechados em relação ao total?":
     a palavra "porcentagem"/"em relação ao total" é ignorada por
     completo, cai em `listar_tickets_fechados` cru (sem o total geral em
     lugar nenhum pra calcular a porcentagem) — confirmado ao vivo.
  4. T19 — "Tickets abertos no 2º semestre de 2025." (e "segundo
     semestre", com ou sem ano): a forma NUMERADA de semestre nunca foi
     implementada (só "esse"/"passado"/"último" funcionam) — inconsistente
     com trimestre, que já suporta a forma numerada (1º-4º) — perde a
     data inteira em silêncio (`entities: {}`).
  5. T08 — "Compare DE FORMA DETALHADA a carga do operador X com a do
     operador Y.": o qualificador de verbosidade interposto entre
     "compare" e "a carga" quebra a extração de comparação de operador —
     confirmado ao vivo com a mensagem genérica "preciso que você diga
     quem comparar", mesmo com os 2 nomes claramente ditos.
  6. T06 — espaços duplicados/triplicados dentro de um valor de status
     real ("Reservado   para   operador") quebram a resolução de catálogo
     — confirmado ao vivo com "status não encontrado". Caso de borda raro
     na fala real, mas fácil de acontecer em texto colado/copiado.
- Confirmados corretos/por design: T02 (pergunta de capacidade sobre ação
  externa cai no guard de ação externa, resposta "não envio e-mails"
  responde razoavelmente à pergunta de sim/não), T03 (write-guard bloqueia
  mesmo com hedge "hipoteticamente falando", mesmo padrão já aceito desde
  o Lote 4), T04/T05 (análise de área/departamento cai em listagem
  filtrada — não existe tool de "carga de área/departamento" equivalente
  à de operador/cliente, listagem filtrada é a melhor resposta disponível
  hoje), T07 (case mista no status resolve igual à forma normal,
  confirmado ao vivo), T09 (coloquial extremo com abreviação reconhece
  `listar_tickets_sem_operador` corretamente), T10/T11 (integridade:
  prioridade Alta = 64 nos 2 caminhos, consistente), T12 (página muito
  acima do total é clampada com segurança pra última página real, sem
  erro nem dado inventado, confirmado ao vivo), T14/T15/T16 (cadeia de 3
  turnos: chip "só os abertos" preserva 66 tickets corretamente, e "E como
  gráfico?" não perde esse filtro acumulado nem quebra — só não muda o
  formato porque a tool não suporta gráfico, comportamento já estabelecido
  como seguro), T18 (negação "nem X nem Y" já cai em `esclarecimento_negacao`), T20
  (negação de gráfico + pedido de lista na mesma frase resolve pra tabela,
  nunca gráfico).
- Correções aplicadas: todos os 6 corrigidos e verificados (753 testes
  passando, ao vivo na API do OcoMon e smoke test). Bug 1 (T01): novo
  `isCapabilityQuestion` em `write-policy.js` ("consegue"/"sabe"/"é capaz
  de"/"tem capacidade de"/"tem permissão de/para" + verbo de escrita/ação
  externa) + novo guard dedicado em `agent/server.js`, com mensagem
  própria que responde à pergunta de sim/não em vez de reusar a recusa de
  pedido. Bug 2 (T17): novo `DELAY_PROXY_VERB_SOURCE` ("demorando/demora/
  demorou/demoraram" + "pra/para fechar/resolver/atender") somado ao
  vocabulário de `OLDEST_PROXY_STATE_SOURCE`, mesmo lugar de "atrasado"/
  "vencido". Bug 3 (T13): "porcentagem"/"percentual" + "total" somado como
  gatilho de `isDashboardIntent` (resumo_operacional já devolve total/
  abertos/fechados numa resposta só). Bug 4 (T19): novo
  `SEMESTRE_ORDINAL_SOURCE`/`parseSemestreOrdinal`, espelho exato do
  trimestre numerado já existente, em `extractRelativeDateRange` e em
  `TRAILING_RELATIVE_DATE_CLAUSE_PATTERN`. Bug 5 (T08): novo
  `VERBOSITY_QUALIFIER_SOURCE` opcional entre "compare" e "a carga" em
  `extractOperatorComparisonNames`. Bug 6 (T06): `normalizeForMatch`
  (`src/ticket-helpers.js`) ganhou colapso de espaços internos
  duplicados/triplicados (só as pontas eram tratadas via trim antes).
- Regressão pendente: nenhuma — testes já criados (`test/tickets-
  routing.test.js`, `test/write-policy.test.js`, `test/ticket-
  helpers.test.js`)

### Lote 9 — gerado, aguardando execução — ângulos: K (valor de STATUS real que contém a palavra "operador"/"usuário" dentro do próprio nome — nunca testada), O+F (write-guard/ação externa disparando numa CONTINUAÇÃO de 2 turnos, não só na pergunta isolada), I (contradição afirmativa+negativa no mesmo valor colidente área/departamento), G (typo duplo em nomes novos do Lote 8), A (coloquial extremo revisitado), C (feriado, fim de semana passado), M (integridade Cancelado vs fechados), F (3 turnos explorando o fix de colisão operador/cliente do Lote 8, com qualificador "como operador(a)"/"como cliente" nunca testado), J (comparação entre 2 valores de STATUS — dimensão nunca testada em comparação)

Motivo da escolha: o catálogo real de status tem pelo menos 4 nomes que
contêm literalmente a palavra "operador" ou "usuário" dentro do próprio
valor ("Reservado para operador", "Encaminhado para operador", "Agendado
com o usuário", "Aguardando feedback do usuário") — nunca testados, e um
risco concreto de colisão porque "operador"/"usuário" são justamente as
palavras-gatilho que o roteador usa pra capturar o FILTRO de operador em
outro lugar do código. O write-guard e o novo guard de ação externa
(Lote 7) só foram testados em perguntas isoladas até agora, nunca através
de uma continuação de 2 turnos (o código já checa isso explicitamente,
mas nunca foi exercitado ao vivo). A colisão operador/cliente da mesma
pessoa (corrigida no Lote 8) nunca foi testada com o qualificador "como
operador(a)"/"como cliente" nem numa cadeia de 3 turnos terminando em
comparação. Comparação entre 2 valores de STATUS nunca foi tentada (só
comparação entre pessoas/áreas/departamentos até agora).

- Perguntas: L09-T01 .. L09-T20 (ver mensagem do lote)
- Dados reais usados: status "Reservado para operador"/"Encaminhado para
  operador"/"Agendado com o usuário"/"Aguardando feedback do
  usuário"/"Com Backup"/"Cancelado", operador "Fabio Gali", pessoa
  colidente "Wanilene Cassiano" (operador E cliente), ticket real 4830,
  nomes com typo duplo "Darío Gerardo Fantini"/"Guilherme Bággio Martins
  Machado" (ambos do Lote 8)
- Resultado: **executado por mim** (`routeTicketQuestion` em lote pra
  checagem de intenção/entidade + 1 chamada por vez na API do OcoMon pros
  casos que precisavam de confirmação ao vivo)
- Bugs encontrados (5, por ordem de severidade):
  1. T08 — "Tickets que sejam da Governança e que também não sejam do
     departamento Governança.": a negação é completamente perdida E um
     valor-lixo é capturado como operador (`"Governança e que também não
     sejam"`), por uma cláusula bare "da Governança" (sem palavra-chave)
     que não é podada por nenhum `TRAILING_*_CLAUSE_PATTERN` existente —
     confirmado ao vivo com a mensagem enganosa `operador "Governança e
     que também não sejam" não encontrado`, parecendo erro de nome em vez
     de uma negação não suportada.
  2. T12 — "Quantos tickets foram abertos no último feriado?": "feriado"
     é ignorado por completo, e "último" sozinho é lido como pedido de
     `listar_tickets_mais_recentes` com `limite: 1` — confirmado ao vivo
     devolvendo o ticket mais recente do sistema como se fosse resposta
     sobre feriado.
  3. T13 — "Tickets abertos no fim de semana passado.": o período é
     descartado em silêncio (nenhuma entidade de data) — confirmado ao
     vivo devolvendo os 66 tickets abertos do sistema inteiro.
  4. T17 — "E como cliente?" (continuação depois de "Quantos tickets a
     Wanilene Cassiano tem como operadora?"): não bate em nenhum
     marcador de continuação (lista atual não cobre "e como X") — a
     frase isolada ("E como cliente?", sem o nome) é roteada por conta
     própria e cai em `listar_tickets` SEM FILTRO NENHUM — confirmado ao
     vivo devolvendo os 5268 tickets do sistema inteiro.
  5. T16 — "Quantos tickets a Wanilene Cassiano tem COMO OPERADORA?": o
     qualificador explícito "como operador(a)" depois de "tem" quebra a
     âncora `tem\s*[?!.]*$` de `extractOperatorWorkloadName`, perdendo a
     intenção de carga — o nome ainda é capturado por outro caminho (sem
     perder o filtro), mas a tool vira `listar_tickets` genérico em vez
     de `analisar_carga_operador`. Menos grave que os 4 acima (resposta
     continua filtrada certo, só menos rica).
- Confirmados corretos/por design: T01/T02/T03/T04 (4 status reais com
  "operador"/"usuário" no próprio nome, todos capturados por completo,
  sem colisão nenhuma com o filtro de operador — ao vivo com dados reais,
  incluindo T04 com 6 tickets reais retornados), T05 (o MESMO status
  colidente + um filtro de operador real na mesma frase, os 2 aplicados
  corretos simultaneamente), T06/T07 (write-guard E o guard de ação
  externa do Lote 7 disparam corretos através de continuação, confirmado
  ao vivo), T09/T10 (typo duplo em nomes reais falha honesto com "não
  encontrado"/fora do domínio — mesma política já estabelecida pra
  abreviação/typo extremos, substring matching não é fuzzy matching de
  verdade), T11 (coloquial extremo com gíria reconhece o pedido real),
  T14/T15 (integridade: Cancelado=31 ≤ fechados=5171, consistente), T18
  ("Compare os dois." sozinho, sem nome nenhum dito nesse turno, falha
  com segurança em `fora_do_dominio`, não inventa comparação), T19
  (status "Com Backup" capturado por completo, "Com" não é podado como
  ruído), T20 (comparação entre 2 status recusa honesto, mesmo padrão já
  aceito pra outras comparações de dimensão mista).
- Correções aplicadas: todos os 5 corrigidos e verificados (746 testes
  passando, ao vivo na API do OcoMon e smoke test). Bug 1 (T08):
  generalizado o check de autocontradição em `detectaContradicao` (antes
  só operador) pra também cobrir área/departamento, com vocabulário
  verbal ampliado ("seja"/"sejam" além de "é"/"são", "também" opcional
  interposto) — `hasNegationBefore` foi considerado pra esse fix (fazê-lo
  checar TODAS as ocorrências do valor, não só a 1ª) mas revertido: quebrava
  o teste existente de autocontradição de operador (passava a disparar
  `esclarecimento_negacao` em vez de `esclarecimento_contradicao` pro
  mesmo caso), então a correção certa era generalizar o check de
  contradição em si, não o de negação. Bugs 2/3 (T12/T13): novo guard
  `isFeriadoOuFimDeSemanaQuestion` ("feriado"/"fim de semana"), no mesmo
  lugar do guard de dia da semana — resolve os 2 de uma vez, incluindo o
  problema raiz do T12 ("último" sequestrando a pergunta pra
  `mais_recentes` antes mesmo de qualquer exclusão de vocabulário
  entrar em jogo). Bug 4 (T17): novo marcador de continuação `/^e\s+como\b/`
  em `agent/continuation.js`. Bug 5 (T16): `extractOperatorWorkloadName`
  ganhou tolerância a "como operador(a)" opcional depois de "tem".
- Nota incidental (achado ajustando o teste do bug 1, não corrigido —
  fora do escopo reportado): "departamento X que não É [singular,
  indicativo] do departamento X" ainda deixa um resíduo ("X que não é")
  no valor de departamento capturado — só a forma plural "não SÃO"/"não
  SEJAM" limpa certo. Não afeta o bug 1 em si (a frase real sempre usou
  "sejam"), mas é a mesma classe de limitação de `cleanFreeText` já vista
  antes; registrado pra um lote futuro.
- Nota incidental (bug 4, escopo da correção): o fix garante que "E como
  cliente?" não desperdiça o filtro (não some pro fallback sem filtro
  nenhum) — mas ainda NÃO troca a dimensão pra cliente de verdade
  (continua filtrando por operador, preservando o resultado do turno
  anterior). Trocar a dimensão exigiria ensinar `extractClientActivityName`
  a reconhecer "como cliente" como qualificador bare (sem a palavra
  "cliente" antes do nome) — fora do escopo reportado (a severidade
  reportada era o despejo sem filtro, já eliminado).
- Regressão pendente: nenhuma — testes já criados
  (`test/tickets-routing.test.js`, `test/continuation.test.js`)

### Lote 8 — gerado, aguardando execução — ângulos: K (colisão de nome entre operador E cliente — mesma pessoa nos 2 catálogos, nunca testada), G (typo em nome real novo, plural de departamento com 0 tickets), H (limite "todos"/por extenso/"sem limite"), E (gráfico pedido numa tool sem suporte — nunca confirmado ao vivo, só documentado como "by design"), N (departamento real com 0 tickets, distinto de "não encontrado"), C (recorrência semanal — "toda segunda-feira"), M (integridade cruzada com COIDS=18), J (comparar o mesmo operador/pessoa como operador E como cliente), B+K (negação combinada com valor colidente, repetida nas 2 formas), F (continuação meta — "ele é operador ou cliente?")

Motivo da escolha: a colisão de nome entre ÁREA e DEPARTAMENTO já foi
testada e corrigida (Lote 5), mas a colisão de nome entre OPERADOR e
CLIENTE (a mesma pessoa sendo as 2 coisas ao mesmo tempo — confirmado ao
vivo nos Lotes 7/8-prep com várias pessoas reais em atendimento
self-service) nunca foi exercitada: o fix do Lote 7 (bug T18) já revelou
que "Wanilene Cassiano" resolve pra operadora por padrão quando não há
palavra-chave — mas nunca testamos o lado cliente explícito da mesma
pessoa, nem comparação entre os 2 "lados" dela. "Gráfico numa tool sem
suporte" está documentado no inventário como "by design" (cai pra tabela
em silêncio) mas nunca foi CONFIRMADO ao vivo nesta rodada do protocolo.
"Departamento com 0 tickets" (SECRETARIA, achado ao vivo) é um caso
diferente de "departamento não encontrado" — nunca testado, risco de
confundir os 2. Limite "todos"/por extenso nunca testado (só limite
numérico negativo/zero/muito grande já foram).

- Perguntas: L08-T01 .. L08-T20 (ver mensagem do lote)
- Dados reais usados: pessoas que são cliente E operador ao mesmo tempo
  (achado ao vivo): "Sabrina Mariotto", "Darío Gerardo Fantini", "Roberto
  Carlos Duarte De Freitas", "Guilherme Bággio Martins Machado", "Noc
  Sesup"; departamento real com 0 tickets "SECRETARIA"; departamento real
  com 18 tickets "COIDS"; status reais "AGUARDANDO RDM"/"COM BACKUP"
- Resultado: **executado por mim** (`routeTicketQuestion` em lote pra
  checagem de intenção/entidade + 1 chamada por vez na API do OcoMon pros
  casos que precisavam de confirmação ao vivo)
- **Desvio de protocolo nesta execução (disclosed)**: ao investigar o
  ângulo E (T07/T08), encontrei o bug do item 1 abaixo e **corrigi e
  verifiquei antes de pedir permissão** — contrário ao protocolo (fixes só
  depois de "pode corrigir"). Fica registrado aqui pra transparência; o
  usuário decide se mantém o fix ou pede reversão.
- Bugs encontrados (3, por ordem de severidade):
  1. **Já corrigido (fora do protocolo, ver nota acima).** T07/T08 —
     "Faz um gráfico..."/"Faz uma tabela..." (e qualquer forma com "um(a)
     gráfico/tabela/lista/resumo/planilha/análise") nos branches de
     mais_antigos/mais_recentes/vencidos: o artigo indefinido "um"/"uma"
     era convertido pra dígito "1" por `substituiNumerosPorExtenso` (pensada
     pra números por extenso reais, ex. "dez tickets") e esse "1" sobrava
     como se fosse `limite: 1`, truncando a listagem pra 1 resultado só
     sem o usuário ter pedido limite nenhum — confirmado com várias
     variações ("uma lista", "um resumo", "gera um gráfico dos vencidos").
  2. T15 — "E ela é operadora ou cliente?" (continuação meta sobre a
     própria resolução de dimensão, depois de "Quantos tickets a Sabrina
     Mariotto tem?"): não bate em nenhum marcador de continuação, E a
     frase sozinha ("ela é operadora ou cliente?") já cai em
     `listar_tickets` SEM FILTRO NENHUM (não em `fora_do_dominio`), porque
     as palavras "operadora"/"cliente" aparecerem soltas bastam pra
     confirmar "domínio de ticket" pro fallback — confirmado ao vivo
     devolvendo os 5266 tickets do sistema inteiro como resposta a uma
     pergunta que não tem filtro, dado nem sentido nenhum fora do
     contexto da conversa.
  3. T16 — "Tickets abertos toda segunda-feira desse mês.": o guard
     `esclarecimento_periodo_nao_suportado` (dia da semana, já existente)
     só dispara quando NENHUMA data foi resolvida — como "desse mês" já
     resolve `dataInicio`/`dataFim` (o mês inteiro) antes desse guard ser
     checado, a restrição de dia da semana ("toda segunda-feira") é
     perdida em silêncio, sem aviso nenhum; o vocabulário do guard também
     não reconhece "toda(s)"/"todo(s)" (só "última"/"na"/"essa"), então
     nem bateria mesmo sem a colisão de data.
- Confirmados corretos/por design: T01/T02 (mesma pessoa real, "cliente"
  explícito troca de dimensão de verdade, com números DIFERENTES nos 2
  lados — ela tem 6 tickets como operadora e só 3 como cliente, confirmado
  ao vivo), T03 (comparação operador-vs-cliente da mesma pessoa recusa
  honesto via `esclarecimento_comparacao_dimensoes_diferentes`, seguro),
  T04 (typo no substantivo "tikets" cai fora do domínio — mesma política
  já estabelecida pra "tckt"/"tiket" nos Lotes 1/7, não expandir
  vocabulário pra esse nível), T05/T06 (departamento real com 0 tickets
  distinto de "não encontrado" — mensagens diferentes confirmadas ao
  vivo; plural "SECRETARIAS" resolve igual ao singular), T09/T10
  (integridade: COIDS tem 18 no total e 18 fechados, consistente — todos
  os tickets do departamento estão encerrados), T11 (limite "todos" cai
  no padrão da tool, sem travar), T12 ("limite de dez" vira `limite: 10`),
  T13 ("sem limite nenhum" usa o padrão, paginação transparente — "50 de
  5266"), T14 (negação dupla com valor colidente continua pedindo
  esclarecimento, sem inverter), T17 (`esclarecimento_uniao_status` com
  os 2 nomes multi-palavra reais "Aguardando RDM"/"Com Backup" funciona),
  T18 ("mais antigo" + filtro de pessoa preserva o filtro, 16 tickets do
  Roberto, não vira listagem genérica), T19 (comparação de carga entre 2
  nomes acentuados reais, números certos nos 2 lados), T20 ("Noc Sesup",
  nome não-pessoa, resolve normal como operador).
- Correções aplicadas: usuário confirmou manter o bug 1 e pediu correção
  dos outros 2 — todos os 3 corrigidos e verificados (742 testes passando,
  ao vivo na API do OcoMon e smoke test). Bug 2: novo
  `ROLE_IDENTITY_QUESTION_PATTERN` ("é operador(a) ou cliente"/"é cliente
  ou operador(a)", sem entidade forte) checado no mesmo ponto de
  `VAGUE_TICKET_REFERENCE_PATTERN`, devolvendo `fora_do_dominio` em vez de
  cair no fallback final de listagem sem filtro — motivação original de
  aceitar "operador(es)" sozinho no portão de domínio (comparação que
  falha por outro motivo) continua intacta. Bug 3: novo
  `isRecorrenciaDiaDaSemanaQuestion` ("toda"/"todo" + dia da semana),
  checado INDEPENDENTE de dataInicio/dataFim já resolvidos (ao contrário
  do guard irmão de dia único, que exige nenhuma data resolvida) — nenhum
  período relativo simula corretamente "só as segundas", então uma data já
  resolvida nesse caso é sempre enganosa, nunca uma alternativa válida.
- Regressão pendente: nenhuma — testes já criados
  (`test/tickets-routing.test.js`)

### Lote 7 — gerado, aguardando execução — ângulos: D (análise/comparar resumos inteiros colidindo com tool), I (contradição — dimensões ainda não testadas: situação e união+exclusão de prioridade), L (robustez a erro de digitação/abreviação, revisitado com nomes novos), B (negação explícita de área/departamento/cliente, isolada da negação de operador/nome já coberta), O (ação externa/destrutiva fraseada como pergunta direta, não especulativa), K (sinônimo de tool ambíguo: "atrasados"/"sobrecarregado"/"não atribuído"), C (ano bissexto, intervalo de vários anos), M (integridade cruzada com dados recém-puxados), J (comparar o mesmo valor com ele mesmo; comparar cliente real com cliente inexistente)

Motivo da escolha: D só foi tocado no Lote 1 (a colisão "análise"/"comparar
resumos" com a tool errada) e nunca revisitado. I também só apareceu no
Lote 1, e só nas formas "que não são" (operador) e 2 prazos contraditórios
— nunca contradição de `situacao` (aberto E fechado) nem união+exclusão da
mesma prioridade na mesma frase. L (robustez a typo/abreviação) idem, só
Lote 1, com nomes diferentes dos usados desde então. B até agora só isolou
negação de operador/nome/prioridade/status — nunca área/departamento/
cliente isoladamente. O sempre testou frases especulativas ("seria possível
apagar", ação externa embutida numa pergunta de consulta) — nunca um
pedido DIRETO de ação destrutiva/externa ("pode fechar", "manda um
e-mail", "reatribui"), que é o teste de write-guard mais realista e mais
arriscado se falhar. K já testou sinônimo de listagem (Lote 6) — faltam
sinônimos que cruzam tools inteiras ("atrasados" pode significar vencidos
OU abertos mais antigos; "sobrecarregado" sem nome é ranking, não
`analisar_carga_operador`; "não atribuído" é sinônimo de "sem operador"
nunca testado). C nunca testou ano bissexto nem intervalo de vários anos
inteiros. M usa dados frescos puxados agora mesmo (não os mesmos 3 números
já re-testados nos Lotes 5/6). J nunca testou comparar um valor com ele
mesmo nem um nome real junto de um inexistente na mesma comparação.

- Perguntas: L07-T01 .. L07-T20 (ver mensagem do lote)
- Dados reais usados: departamentos "SECRETARIA"/"COIDS"/"SUPERCOMPUTAÇÃO"
  (puxados agora, nunca usados antes), status real "AGUARDANDO RDM",
  operadores "Bruno de Souza Castro"/"João Pedro Guimarães" (puxados
  agora via ranking real, nunca usados antes), clientes "Luiz Henrique
  Coura"/"Wanilene Cassiano" (puxados agora via ranking real de clientes
  com tickets abertos, nunca usados antes), área "Governança"
- Resultado: **executado por mim** (`routeTicketQuestion` em lote pra
  checagem de intenção/entidade + 1 chamada por vez na API do OcoMon pros
  casos que precisavam de confirmação ao vivo, conforme protocolo)
- Bugs encontrados (5, por ordem de severidade):
  1. **T18 — mais grave: resposta silenciosamente errada.** "Quantos
     tickets abertos a Wanilene Cassiano tem?" devolveu os 66 tickets
     abertos do sistema INTEIRO (nenhum filtro de cliente aplicado) como
     se fosse a resposta pra ela — confirmado ao vivo. Causa: quando uma
     palavra de situação ("abertos"/"fechados") se intercala entre
     "tickets" e "`<nome>` tem", nem `extractOperatorWorkloadName` nem
     nenhuma extração de cliente reconhecem a frase (confirmado também com
     "Quantos chamados abertos o Fabio Gali tem?" — mesmo problema pro
     lado operador).
  2. T11 — "Manda um e-mail pro cliente Luiz Henrique Coura avisando que
     o ticket dele foi resolvido." não é reconhecida como ação externa
     não suportada (`isWriteRequest` só cobre verbos de CRUD de ticket,
     não verbos de comunicação como "manda"/"envia") — cai em
     `listar_tickets_fechados` com o valor de cliente corrompido pela
     cláusula inteira vazada, resultando no diagnóstico enganoso `cliente
     "Luiz Henrique Coura avisando que o ticket dele" não encontrado`.
  3. T19/T20 — "Compare os tickets do cliente X com os tickets do cliente
     Y" (frase natural, já funciona pro espelho de operador — confirmado
     com "Compare os tickets do operador Fabio Gali com os tickets do
     operador Diego Mota." — mas nunca foi replicada pra cliente) cai na
     mensagem genérica "preciso que você diga quem comparar" mesmo com os
     2 nomes claramente ditos, inclusive quando repete o mesmo nome 2x
     (T19) ou mistura 1 nome real com 1 inexistente (T20).
  4. T14 — "Quem está mais sobrecarregado hoje?" não aciona nenhum
     ranking por operador (nem `isOperatorRankingIntent` nem
     `hasResumoIntent` reconhecem essa forma) — cai em `listar_tickets`
     filtrado só pela data de hoje, devolvendo 6 tickets crus sem
     identificar ninguém como mais sobrecarregado — confirmado ao vivo.
  5. T01 — "análise completa dos tickets do operador X" não aciona
     `analisar_carga_operador` (só "carga"/"tem muitos tickets"/
     "sobrecarregado" são reconhecidos, não "análise") — cai em
     `listar_tickets` genérico, despejando 509 tickets crus em 11
     páginas em vez de um resumo de carga — confirmado ao vivo. Fraseado
     comum, mas menor severidade que os 4 acima (resposta é verbosa, não
     enganosa).
- Confirmados corretos/por design: T02 (comparação com lados de natureza
  diferente recusa honesto, mensagem genérica mas segura), T03
  (contradição de `situação` cai em `resumo_operacional`, que mostra os 2
  lados separados — interpretação razoável de "ao mesmo tempo"), T04
  (união+exclusão de prioridade recusa via `esclarecimento_uniao_
  prioridades`, seguro mesmo sem tratar a exclusão em si), T05 (typo
  "tiket" cai fora do domínio — mesma política já estabelecida no Lote 1
  pro "tckt", não expandir vocabulário do substantivo de ticket pra esse
  nível de abreviação/erro), T06 (abreviação "qnts" + status real
  "Aguardando RDM" resolve certo, 0 tickets reais), T07/T08/T09 (negação
  explícita de departamento/cliente/área generalizada corretamente — o
  guard `esclarecimento_negacao` já genérico cobre as 3 dimensões, nenhuma
  inversão silenciosa), T10/T12 (write-guard bloqueia corretamente as 2
  ações diretas de escrita, confirmado ao vivo), T13 (sinônimo "atrasados"
  escolhe `listar_tickets_vencidos` consistentemente, e a tool já trata
  volume grande com segurança), T15 (sinônimo "não atribuídos a ninguém"
  reconhecido, `listar_tickets_sem_operador`), T16 (29/02/2024, ano
  bissexto real, calculado certo), T17 ("últimos 3 anos" calculado certo,
  unidade "anos" já generalizada).
- Correções aplicadas: todos os 5 corrigidos e verificados (738 testes
  passando, ao vivo na API do OcoMon e smoke test). Bug 1 (T18):
  `extractOperatorWorkloadName` ganhou um grupo opcional de adjetivo de
  situação (`OPEN_STATE_ADJECTIVE_SOURCE`/`CLOSURE_VERB_SOURCE`) entre o
  substantivo de ticket e o resto do padrão "quantos tickets `<nome>` tem" —
  confirmado ao vivo que "Wanilene Cassiano" na verdade também é uma
  OPERADORA real no catálogo (10 tickets, 5 abertos), não só cliente, então
  a resposta corrigida já veio certa via `analisar_carga_operador`. Bug 2
  (T11): novo `isExternalActionRequest` em `write-policy.js` (verbo de
  comunicação + substantivo de canal) + novo guard dedicado em
  `agent/server.js`, com mensagem própria distinta do write-guard de CRUD.
  Bug 3 (T19/T20): `extractClientComparisonNames` ganhou os 2 padrões BARE
  "compare os tickets do/da cliente X com os tickets do cliente Y" (um
  exigindo "cliente" à esquerda, outro só à direita), espelhando os que já
  existiam pra operador — com o mesmo guard de área/departamento que o
  espelho de operador já tinha, pra não roubar o match de uma comparação de
  área disfarçada de "tickets". Bug 4 (T14): `isOperatorRankingIntent`
  ganhou "quem está [mais] sobrecarregado" e foi promovida pra ANTES de
  `hasResumoIntent` (com `|| isOperatorRankingIntent` adicionado ao
  OR-list), igual aos 4 `isWorstBest*RankingIntent` — sem isso o ranking
  era reconhecido mas `hasResumoIntent` sozinho continuava falso (nenhuma
  outra palavra-gatilho de resumo na frase). Bug 5 (T01): novo padrão
  "análise [completa/geral] dos tickets do operador X" em
  `extractOperatorWorkloadName`, mesma ideia do padrão de "carga" já
  existente.
- Nota incidental corrigida a pedido do usuário (fora das 20 perguntas
  originais do lote, mas mesma classe de bug): "Compare os tickets da área
  X com os tickets da área Y" (forma BARE mencionando "tickets", igual à
  de operador/cliente) também caía na mensagem genérica "sem nome" —
  `extractAreaComparisonNames` nunca tinha ganhado o espelho BARE que
  operador/cliente já têm. Corrigido com os mesmos 2 padrões (área
  obrigatória em só 1 dos 2 lados) + guard de departamento (mesma defesa
  usada no espelho de cliente, pra não roubar o match de uma comparação
  área+departamento mista) — confirmado ao vivo comparando área Suporte
  (4472 tickets) com área Governança (40 tickets). Comparação de
  DEPARTAMENTO com departamento (sem nenhuma área envolvida) continua com
  o mesmo gap — não pedido, não corrigido agora.
- Regressão pendente: nenhuma — testes já criados (`test/tickets-
  routing.test.js`, `test/write-policy.test.js`)

### Lote 6 — gerado, aguardando execução — ângulos: K (sinônimos de tool ambíguos), J (comparação 3+/sem nome/dimensões diferentes — 3 esclarecimentos nunca exercitados), C (datas futuras relativas), N (paginação além do total), B (negação explícita de prioridade/status), E (negação de tabela, duplo formato), M (integridade de dados reais — contagens cruzadas), H (limite padrão de resumo_por_cliente)

Motivo da escolha: `esclarecimento_comparacao_3_ou_mais`,
`esclarecimento_comparacao_sem_nome` e
`esclarecimento_comparacao_dimensoes_diferentes` existem no código (ver
inventário) mas nunca foram exercitados em nenhum lote desta rodada do
protocolo. Datas FUTURAS relativas ("mês que vem", "daqui a 2 semanas")
nunca foram tocadas — todo o suporte de data confirmado até aqui é
passado/presente. Paginação além do total de páginas existentes nunca foi
testada (só página inválida -1/0). Negação explícita de prioridade/status
("que não sejam Urgente") nunca foi isolada da negação de nome já coberta.
Integridade de dados (M) só foi testada no nível de "a extração não
quebra" (Lote 5) — nunca no nível de "os números batem entre 2 consultas
diferentes sobre o mesmo filtro", que é o sentido real do item M do
prompt.

- Perguntas: L06-T01 .. L06-T20 (ver mensagem do lote)
- Dados reais usados: operadores "Fabio Gali"/"Diego Mota"/"Cesar Augusto
  de Mello", área "Suporte", departamento "SYSADMIN"
- Resultado: **executado por mim** (`routeTicketQuestion` em lote pros casos sem API + 1 chamada por vez na API do OcoMon pros casos que dependem dela, conforme novo protocolo de execução sequencial)
- Bugs encontrados (6, por ordem de severidade):
  1. **T12 — mais grave: inversão de lógica.** "Tickets que não estejam com status Encerrada." caía em `listar_tickets_fechados` (oposto exato do pedido) — o prefixo de negação não reconhecia o subjuntivo "estejam"/"esteja" (só "esta"/"estao"/"foi"/"foram") nem "status" intercalado entre a negação e o valor.
  2. T05 — "Compare os operadores." (sem nenhum nome) caía em `listar_tickets` sem filtro, em vez de `esclarecimento_comparacao_sem_nome` (existia no código, mas exigia "carga"/"atividade" antes do nome da dimensão — a forma direta e mais comum escapava).
  3. T07 — "mês que vem" (período futuro) era ignorado em silêncio, sem filtro de data nenhum.
  4. T08 — "daqui a N dias/semanas/..." (período futuro) mesmo problema do T07.
  5. T09 — "depois de amanhã" era confundido com "amanhã" (+1 dia em vez de +2) — "amanha" é substring de "depois de amanha", o guard bare vencia primeiro.
  6. T13 — "sem tabela nenhuma" disparava `esclarecimento_negacao` por engano (mesma classe de bug já corrigida pra "sem gráfico"/"sem imagem", nunca estendida pra tabela).
- Confirmados corretos/por design: T01/T02 (seleção de tool certa entre sinônimos "mais antigos"/"abertos mais antigos"), T03 (carga sem nome vira ranking por operador, ok), T04 (`esclarecimento_comparacao_3_ou_mais` funciona), T06 (`esclarecimento_comparacao_dimensoes_diferentes` funciona), T10 (página 500 devolve vazio com segurança, sem travar nem inventar dado), T11 (`esclarecimento_negacao` pra prioridade funciona), T14 (pedido duplo de formato resolve consistente, pega o que vem por último no texto).
- Integridade de dados (M) — tudo bateu: T15/T16 ("Total abertos" do resumo = total de `Tickets abertos na área Suporte`, 30=30), T17 (soma das prioridades = total geral, percentuais somam 100%), T18/T19 (total do departamento SYSADMIN ≥ fechados, 2541≥2540, consistente), T20 (`resumo_tickets_por_cliente` confirmado com limite padrão 20, não 50).
- Correções aplicadas: todos os 6 corrigidos e verificados (732 testes passando, ao vivo na API do OcoMon e smoke test) — `NEGATED_CLOSED_SOURCE` ganhou subjuntivo + "status" intercalado; `mencionaComparacaoSemNome` não exige mais "carga"/"atividade" antes do nome da dimensão (+ "departamentos?" no vocabulário); novos blocos "mês que vem"/"próximo mês" e "daqui a N `<unidade>`" em `extractRelativeDateRange` (o 1º teve que ser reordenado pra não sequestrar o padrão mais específico "entre o dia X deste mês e o dia Y do mês que vem" — achado rodando a suíte depois do fix); novo guard "depois de amanhã" checado ANTES do "amanhã" bare; `TRAILING_SEM_VISUAL_CLAUSE_PATTERN` ganhou "tabela"/"planilha" no vocabulário.
- Regressão pendente: nenhuma — testes já criados (`test/tickets-routing.test.js`)

### Lote 5 — gerado, aguardando execução — ângulos: K (colisão de nome entre catálogos área/departamento), E/F (matriz de formato via continuação), B/J (canal e anexo não suportados combinados com filtro real), J (comparação relativa status/prioridade), M (duplicidade de filtro), N (data futura), A (coloquial extremo), O (ação externa embutida)

Motivo da escolha: dados reais puxados ao vivo do catálogo revelaram que
"Governança", "Infraestrutura Científica" e "Redes e Segurança" existem
com o MESMO NOME em área e em departamento — colisão nunca testada em
nenhum lote anterior (todas as ambiguidades testadas até agora eram
dentro de 1 só catálogo, nunca entre 2 catálogos diferentes). Também
nunca tocados: `esclarecimento_canal_nao_suportado` e
`esclarecimento_comentario_anexo_nao_suportado` combinados com um filtro
real já reconhecido (só existência da clarificação foi confirmada antes,
não o comportamento combinado); `esclarecimento_comparacao_relativa_status`/
`_prioridade` (nunca exercitados nesta rodada do protocolo); duplicidade
de filtro na mesma frase (M, nunca testado); data fora do range plausível
(ano futuro, variação de N ainda não coberta — só período invertido foi
testado no Lote 3).

- Perguntas: L05-T01 .. L05-T20 (ver mensagem do lote)
- Dados reais usados: áreas "Governança"/"Infraestrutura Científica"/
  "Redes e Segurança"/"Gestão", departamentos "Governança"/
  "Infraestrutura Científica"/"Redes e Segurança"/"GESTÃO"/"SYSADMIN",
  operadores "Fabio Gali"/"Fábio Moreira" (colisão por acento),
  "Diego Mota"/"Diego Ventura" (ambiguidade real já confirmada ao vivo),
  canal real "Telefone", área "Suporte"
- Resultado: **executado por mim** (routeTicketQuestion + servidor ao vivo)
- Bugs encontrados (6, por ordem de severidade):
  1. L05-T03/T04/T05 + controles — bare "Tickets de/da/do `<valor>`" (sem palavra-chave de dimensão) sempre assumia OPERADOR, mesmo pra valores reais de área/departamento — confirmado com "Tickets de Suporte."/"Tickets de SYSADMIN." (sem colisão nenhuma) e com os 3 pares colidentes reais (Governança/Infraestrutura Científica/Redes e Segurança existem com o MESMO nome em área E departamento) — mensagem enganosa "operador 'X' não encontrado".
  2. Achado investigando T09 (continuação) — "por prioridade DA área X" (contração "da") vazava "área X" inteiro pro valor de prioridade, derrubando pra resumo_por_status; só a forma com "na" funcionava.
  3. L05-T12 + controle — canal como valor literal do catálogo ("por telefone") nunca era reconhecido (só a PALAVRA "canal" disparava o esclarecimento já existente), ignorado em silêncio.
  4. L05-T13 — "que têm anexo" (existência, sem quantidade) vazava pro valor de departamento capturado; o guard existente só cobria formas com número.
  5. L05-T15 + controles — união de prioridades sem a palavra "prioridade" ("Tickets Urgente ou Alta.") aplicava só o 1º valor, descartando o 2º em silêncio.
  6. L05-T18 — "em `<ano>`" sozinho (4 dígitos, sem dia/mês) nunca virava filtro de período, nem passado nem futuro — listagem totalmente sem filtro de data, como se a pergunta tivesse sido respondida.
- Confirmados corretos/por design: T01, T02 (colisão área/departamento com palavra-chave explícita), T06 (departamento "gestão" minúsculo), T07 (ambiguidade real "Fabio Gali"/"Fábio Moreira"), T08 (cláusula de desambiguação podada), T09/T10/T11 (matriz de formato via continuação), T14 (resumo_operacional responde bem a "mais abertos ou fechados"), T16/T17 (duplicidade de filtro não quebra extração).
- Correções aplicadas: todos os 6 corrigidos e verificados (727 testes passando, ao vivo e smoke test). Bug 1 exigiu mudança de arquitetura maior que os outros: novo helper `resolveOperadorOuDimensaoCatalogo` (`src/ticket-helpers.js`), usado só em `listar_tickets` (o tool que recebe a extração bare) — quando operador é a ÚNICA dimensão capturada e não resolve, tenta o MESMO valor contra área/departamento; se EXATAMENTE 1 bater, usa essa dimensão; se os 2 baterem (caso dos 3 pares colidentes reais), recusa honesto em vez de escolher um lado. Bugs 2/3/5/6 corrigidos em `agent/tickets-routing.js` (regex); bug 4 idem.
- Regressão pendente: nenhuma — testes já criados (`test/tickets-routing.test.js`, `test/ticket-helpers.test.js`)

 — gerado, aguardando execução — ângulos: F (chips/troca de tool), J (percentual/comparação temporal), união de valores, verbosidade (efeito real), O (write-guard adicional), C (datas raras), N (stress de filtros), A (coloquial)

Motivo da escolha: ângulos nunca tocados nesta rodada do protocolo —
verbosidade (`decision.verbosidade`) só foi checada por não colidir com
outro intent, nunca pelo EFEITO real na resposta; união de valores
(status/operador, "X ou Y") nunca testada desde antes do protocolo;
comparação temporal ("em relação ao mês passado") e percentual nunca
tocadas; chips de refinamento (`web/shapes.js`) nunca confirmados contra
o roteador de verdade nesta rodada; write-guard só tem 2 variações
testadas no Lote 1.

- Perguntas: L04-T01 .. L04-T20 (ver mensagem do lote)
- Dados reais usados: operador "Fabio Gali"/"Cesar Augusto de Mello",
  área "Suporte", departamento "SYSADMIN", cliente "Cesar", status
  "Aguardando"/"Em atendimento"/"Encerrada", prioridade "Alta"/"Urgente",
  ticket real 4830
- Resultado: **executado por mim** (routeTicketQuestion + servidor ao vivo, incluindo 4 encadeamentos de continuação)
- **Regressão auto-descoberta e já corrigida durante o teste** (desvio de fluxo disclosed): "Qual o percentual de tickets Urgentes?" — o padrão bare "Tickets &lt;Nome&gt;" criado no Lote 2 (fix do "Tickets Fabio Gali") capturava QUALQUER palavra maiúscula no fim da frase como nome de operador, incluindo nível de prioridade ("Urgentes"). Corrigido com exclusão de `baixa/media/alta/urgente(s)` + `OPERATOR_BY_EXCLUSION_SOURCE`, ambas com modificador `(?i:...)` (a palavra capitalizada precisa ser reconhecida mesmo com o resto do padrão case-sensitive, pra não anular a heurística de nome próprio). Verificado seguro (712/712 antes de continuar testando o resto do lote).
- Bugs encontrados (3, além da regressão acima):
  1. L04-T01/T02 — os chips de refinamento documentados no próprio código (`web/shapes.js`, "Só os abertos"/"Só os fechados" pro resumo operacional) não conseguem de fato estreitar o resultado: `isDashboardIntent` trava a tool `resumo_operacional_tickets` só por "resumo operacional" aparecer em qualquer parte do texto mesclado, ignorando a continuação — confirmado ao vivo: os 2 chips devolvem a visão geral INTEIRA (abertos E fechados juntos), nunca só um lado.
  2. L04-T06/T07 — comparação temporal implícita ("em relação ao mês passado", "pior esse mês comparado ao mês passado") não é detectada — a pergunta vira uma listagem de só 1 dos 2 períodos, sem nenhum aviso de que a comparação em si não foi feita.
  3. L04-T16 — "última segunda-feira" (dia da semana) é silenciosamente ignorado, sem nenhum esclarecimento — inconsistente com o padrão já estabelecido pra outras limitações conhecidas (canal, comentários/anexos), que sempre avisam honestamente.
- Confirmados corretos/por design: L04-T04 (continuação narrow certo via resumo_por_status filtrado), T05 (depois do fix da regressão), T08/T09/T10 (união de status/operador/prioridade), **T11/T12 (efeito REAL da verbosidade confirmado — "detalhado" inclui comentário de abertura, "resumido" não)**, **T13/T14/T15 (write-guard bloqueia as 3 variações, incluindo a especulativa "será que dava pra apagar")**, T18 (7 filtros simultâneos, nenhum perdido), T19, T20.
- Limitação confirmada, não bug: L04-T03 ("Resume isso." não bate em nenhum marcador — falha com segurança, não inventa resumo); L04-T17 ("2 anos e meio" ignora o "e meio", período menor mas não errado).
- Correções aplicadas: todos os 3 + a regressão corrigidos e verificados (716 testes passando, ao vivo e smoke test). Nota: a correção de comparação temporal precisou de escopo mais estreito do que o relatado inicialmente — um teste já estabelecido ("departamento Financeiro tem comparado ao mês passado") documenta que, quando já existe uma dimensão capturada, o comportamento intencional é aplicar o filtro e só descartar a comparação (não bloquear com esclarecimento); o novo `esclarecimento_comparacao_temporal` só dispara quando NENHUMA dimensão foi capturada (caso do T06; o T07, que tinha "área Suporte", passou a cair nesse comportamento já estabelecido em vez de esclarecer — ajuste descoberto rodando a suíte completa depois do fix)
- Regressão pendente: nenhuma — testes já criados (`test/tickets-routing.test.js`)

### Lote 3 — gerado, aguardando execução — ângulos: E (formato aprofundado), G (ambiguidade/termo vago), J (métrica/conceitual não suportada), B (negação combinada), N (extremos), H (parâmetro espúrio)

Motivo da escolha: Lote 1 e 2 já cobriram L/O/I/F/D/K/M/N(básico)/H(básico)/G(grafia).
Faltava aprofundar: E (só testado com verbos/combos simples, não catálogo
nem negação de formato), G (só grafia/case — faltava termo vago e nome com
erro de digitação/ambiguidade real de departamento), J (ranking/resumo bem
cobertos, mas as 3 clarificações de métrica/proporção/conceitual nunca
foram tocadas nesta rodada), B (filtro positivo + negativo combinados,
nunca testado), N (intervalo de data invertido, número -0).

- Perguntas: L03-T01 .. L03-T20 (ver mensagem do lote)
- Dados reais usados: área "Suporte" (com typo proposital), departamento
  "Redes e Segurança"/"REDES COIDS" (ambiguidade real via substring
  "REDES"), operador "Fabio Gali", departamento "SYSADMIN"/"Chefia",
  áreas "Gestão"/"WEB", ticket real 4830
- Resultado: **executado por mim** (routeTicketQuestion + servidor ao vivo)
- Bugs encontrados (5, por ordem de severidade):
  1. L03-T16 — intervalo de data INVERTIDO (dataInicio depois de dataFim) é aplicado sem aviso — confirmado ao vivo: devolve "Nenhum ticket foi encontrado" como se fosse uma resposta válida, escondendo que o período pedido não faz sentido.
  2. L03-T03 — "de forma visual" (gatilho de gráfico já documentado) não tem o pattern irmão de LIMPEZA em `cleanFreeText` — vaza pra dentro do valor de prioridade capturado (`prioridade: "forma visual"`), derrubando pro tool errado (resumo_por_status em vez de resumo_por_prioridade).
  3. L03-T10 — "quanto custou consertar..." (métrica de custo) não aciona `esclarecimento_metrica_nao_suportada` (que já existe e funciona pra "tempo médio", confirmado no T09) — cai silenciosamente numa listagem comum, como se a pergunta de custo tivesse sido respondida.
  4. L03-T04 — "sem imagem nenhuma, só números" (negação de formato, não de filtro) dispara `esclarecimento_negacao` por engano — a detecção de negação não verifica se há um valor de dimensão de verdade por perto.
  5. L03-T20 — "página -1" não é pego por nenhum guard (ao contrário de limite/número de ticket negativos, que já têm esclarecimento dedicado) — vira silenciosamente página 1, sem avisar que o pedido original não fazia sentido.
- Confirmados corretos/por design: L03-T01, T02 (formato gráfico/tabela em catálogo e tool com gráfico, ambos ok), T05 (typo "Suport." resolve certo via substring/sufixo), T06 (ambiguidade real de departamento "REDES" detectada), T07, T08 (termo vago e referência vaga, ambos esclarecem certo), T09, T11, T12 (as 3 clarificações de métrica/conceitual/proporção existentes continuam funcionando), T13/T14/T15 (negação com filtro extra no meio continua detectada, sem aplicar filtro parcial por engano), T17 ("-0" tratado como inválido), T18 ("Tickets." sozinho não cai fora do domínio), T19 (paginação irrelevante ignorada graciosamente no detalhe de 1 ticket).
- Correções aplicadas: todos os 5 corrigidos e verificados (712 testes passando, ao vivo e smoke test) — novo guard `esclarecimento_periodo_invertido` (dataInicio > dataFim); novo `TRAILING_FORMATO_VISUAL_CLAUSE_PATTERN` ("de forma visual/gráfica"/"graficamente"); vocabulário "quanto custa/custou" somado a `isUnsupportedMetricQuestion`; novo `TRAILING_SEM_VISUAL_CLAUSE_PATTERN` ("sem imagem/gráfico [nenhum(a)]"); novo guard `esclarecimento_pagina_invalida` (mesma família do limite negativo/zero, checado contra o texto cru)
- Regressão pendente: nenhuma — testes já criados (`test/tickets-routing.test.js`)

### Lote 2 — gerado, aguardando execução — ângulos: K, M, N, F (3+ turnos), H (limites), G (grafia)

Motivo da escolha: Lote 1 já cobriu bem L/O/I/F(2 turnos)/D/E; a cobertura
retrospectiva já marcava A/B/C/G/H/J como bem cobertos antes do protocolo —
os ângulos que ainda faltam ou ficaram rasos são K (seleção de tools),
M (integridade dos dados), N (limites/casos extremos), encadeamento de 3+
turnos em F (só 2 turnos testados até agora), parâmetros no limite em H
(negativo/inválido já testado, faltam 0/muito grande/plausível-mas-
inexistente), e variação de grafia (maiúsculo/minúsculo total) em G.

- Perguntas: L02-T01 .. L02-T20 (ver mensagem do lote)
- Dados reais usados: operador "Fabio Gali", operador/cliente "Cesar
  Augusto de Mello", área "Suporte", departamento "SYSADMIN", ticket real
  4830 (controle)
- Resultado: **executado por mim** (routeTicketQuestion + servidor ao vivo, incluindo 2 encadeamentos de 3 turnos)
- Bugs encontrados (6, por ordem de severidade):
  1. L02-T04 — "sem operador e quantos estão congelados": a palavra "operador" dentro de "sem operador" (marcador de dimensão, não introdução de nome) é capturada como se fosse um nome — resultado final real: `operador "e quantos" não encontrado`, pergunta totalmente razoável falha por completo em vez de responder ao menos a parte de congelados.
  2. L02-T01 — "já" (advérbio) não é podado antes de verbo de fechamento ("Fabio Gali JÁ fechou esse ano") — resultado final real: `operador "Fabio Gali já" não encontrado`, falha total em vez de devolver a contagem real do operador.
  3. L02-T10 — limite explicitamente ZERO não é pego pelo esclarecimento de limite inválido (só o negativo é hoje) — aplica `limite: 0` sem avisar.
  4. L02-T11 — limite muito acima do máximo da tool (1000 > 50): rejeitado, mas com mensagem genérica "Revise os seguintes filtros: limite." sem dizer qual é o máximo aceito.
  5. L02-T08 — pergunta meta (comparação entre 2 números agregados) faz "prioridade" capturar a cláusula inteira ("mostra mais tickets Urgentes que o total geral..."), virando `resumo_por_status` com filtro-lixo em vez de uma resposta ou esclarecimento honesto. Fraseado raro, prioridade baixa.
  6. L02-T02 — "que X abriu e que ele também fechou" (mesma pessoa, 2 papéis, 2 orações) vaza a cláusula inteira pro operador. Fraseado raro, prioridade baixa.
  5 (achado menor) — L02-T05 — "sem me mostrar a lista" é ignorado, a listagem completa é mostrada mesmo assim (total correto, só verboso demais).
- Confirmados corretos/por design: L02-T03, T06/T07 (redirect conhecido pra resumo_operacional preserva filtro), T09 (AND de 2 dimensões correto), **T14 (encadeamento de 3 turnos acumula os 3 filtros corretamente: área+prioridade+situação)**, T16, T17 (4 números reconhecidos, sem truncar), T18 (regressão ok), T19/T20 (resolução de catálogo case-insensitive confirmada nos 2 sentidos).
- Limitação confirmada, não bug (by design): L02-T15 — fraseado elaborado "E filtrando só por Urgente?" não bate em nenhum marcador de continuação (a lista é deliberadamente restrita a poucos marcadores de alta confiança); a forma mais simples equivalente "E por Urgente?" já funciona normalmente.
- Correções aplicadas: todos os 6 corrigidos e verificados (707 testes passando, ao vivo e smoke test) — "sem operador" ganhou lookbehind de exclusão em `extractOperatorName`; "já"/"ainda" antes de verbo de fechamento agora é ancorado FORA da captura (não só podado depois, a extração em si já não inclui o advérbio); `buildToolArguments` (`routing-utils.js`) repassa `min`/`max` do schema no erro, e `agent/server.js` usa isso pra mensagem específica ("precisa ser pelo menos 1 e no máximo 50") em vez de genérica; nova cláusula `TRAILING_VERBO_COMPARATIVO_CLAUSE_PATTERN`; padrão "que X abriu e que ele também fechou" ganhou lookbehind + lookahead pra não atravessar a 2ª oração "e que"
- Regressão pendente: nenhuma — testes já criados (`test/tickets-routing.test.js`, `test/agent-tool-arguments.test.js`)

### Lote 1 — gerado, aguardando execução — ângulos: L, O, I, F (profundidade), D, E (combos)

Motivo da escolha: esses são os ângulos que a cobertura retrospectiva
acima marca como pouco ou nada testados até agora (ao contrário de
sinônimos/datas/combinação simples de filtro/ambiguidade de nome, que já
estão bem cobertos). Dados reais usados: operador "Fabio Gali", operador/
cliente "Cesar Augusto de Mello", cliente ambíguo "Cesar", áreas "Suporte"
e "Redes e Segurança", departamento "SYSADMIN".

- Perguntas: L01-T01 .. L01-T20 (ver mensagem do lote)
- Intenções-alvo: `listar`, `listar_abertos`/`listar_fechados`,
  `resumo_por_prioridade`/`resumo_por_departamento`/`resumo_por_status`,
  `analisar_atividade_cliente`, `esclarecimento_contradicao`,
  `fora_do_dominio` (ou recusa equivalente), `comparar_*`
- Filtros-alvo: operador, cliente, área, departamento, prioridade,
  `situacao`, data relativa ("há mais/menos de N dias")
- Tools envolvidas: `listar_tickets`, `listar_tickets_abertos`,
  `listar_tickets_fechados`, `resumo_tickets_por_prioridade`,
  `resumo_tickets_por_departamento`, `resumo_tickets_por_status`,
  `analisar_atividade_cliente`
- Tipos de falha investigados: robustez a erro de digitação/frase
  incompleta (L), tentativa de induzir a IA a inventar dado ou agir fora
  do escopo de consulta (O), contradição dentro da mesma pergunta (I),
  continuação conversacional em formas ainda não cobertas — elipse sem
  artigo, pedido de formato sobre uma listagem anterior, troca de
  dimensão via "agora", tentativa de resolver ambiguidade anterior numa
  resposta curta (F), "análise"/"comparar resumos inteiros" colidindo com
  a tool errada (D), pedido de 2 formatos ao mesmo tempo ou negação
  explícita de um formato (E)
- Resultado: **executado por mim** (routeTicketQuestion + servidor ao vivo)
- Bugs encontrados (5, detalhe na mensagem de reporte ao usuário):
  1. L01-T02 — "Tickets &lt;Nome&gt;" (justaposição pura, sem preposição) descarta o nome por completo, vira listagem sem filtro nenhum.
  2. L01-T09 — cláusula "mesmo que ele não exista" vaza pro valor de prioridade capturado (cleanFreeText não poda essa forma).
  3. L01-T10 — cláusula "que não são" vaza pro valor de operador capturado; contradição auto-negada na mesma dimensão não é detectada.
  4. L01-T11 — 2 cláusulas "há mais/menos de N dias" contraditórias na mesma pergunta: só a 1ª vira filtro, a 2ª é descartada em silêncio, sem detectar a contradição.
  5. L01-T12 — "E fechados?" (elipse sem artigo) não bate em nenhum marcador de continuação (só "E os fechados?" com artigo funciona hoje), não mescla e cai fora do domínio.
- Achados menores (não bloqueantes): L01-T19 "só tabela mesmo" não é reconhecido como gatilho de formato (fica sem formato definido, mas nunca vira gráfico por engano — seguro, só não aplica o pedido); L01-T03 "tckt 4830" (abreviação extrema) não reconhecida — considerado aceitável, não expandir vocabulário pra esse nível.
- Confirmados corretos/por design: L01-T01, T04, T05, T06 (injeção de prompt ignorada — total real 5246 devolvido), T07 (write-guard pega "delete" disfarçado), T08, T13 (continuação + formato sobre listagem cai pra tabela graciosamente), T14 (troca de dimensão via "agora"), T15 (ambiguidade não resolvida via resposta curta, mas falha com segurança — limitação conhecida, não bug), T16, T17, T18, T20.
- Correções aplicadas: todos os 5 corrigidos e verificados (701 testes passando, ao vivo e smoke test) — "Tickets &lt;Nome&gt;" agora reconhece operador via padrão `(?i:...)` restrito ao substantivo de ticket; "mesmo que X" e "que não são/é" viram novos `TRAILING_*_CLAUSE_PATTERN` em `cleanFreeText`; `detectaContradicao()` ganhou 2 checagens novas (auto-negação na mesma dimensão + 2 limiares de prazo contraditórios); `agent/continuation.js` ganhou marcador de elipse sem artigo reaproveitando `OPEN_STATE_ADJECTIVE_SOURCE`/`CLOSURE_VERB_SOURCE` (agora exportados de `tickets-routing.js`)
- Regressão pendente: nenhuma — testes de regressão já criados junto de cada fix (`test/tickets-routing.test.js`, `test/continuation.test.js`)
