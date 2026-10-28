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
