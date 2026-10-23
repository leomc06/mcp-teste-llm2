import {
  compactEntities,
  extractLimit,
  normalizeText,
  substituiNumerosPorExtenso,
} from "./routing-utils.js";

// "está"/"esta" (singular) ou "estão"/"estao" (plural) — atenção: o plural
// usa "ã" (til), não "á" (agudo), são letras diferentes.
const ESTAR_SOURCE = "est(?:[áa]|[ãa]o)";

// "sem" entra na lista de conectores (junto de com/e/que/do/da/no/na) pra
// cobrir "área Suporte SEM operador" — antes só "com/tem/está X" era podado,
// então "sem X" vazava inteiro pro nome capturado (ex.: area: "Suporte sem
// operador").
// "(?:e\\s+)?" antes de "d[oa]"/"n[oa]" (achado testando o lote de
// perguntas ao vivo): "Tickets abertos na área de TI E NO departamento de
// Suporte." deixava "e" sobrando no nome capturado (area: "TI e") — o "e"
// solto já era aceito como conector, mas só quando seguido direto de "o "/
// "a " + substantivo; "no"/"na" (contração de "em"+"o"/"a") depois de "e"
// não batia em nenhuma das 2 formas (nem "e" sozinho, que exige "o "/"a "
// logo depois, nem "n[oa]" sozinho, que não prevê um "e" antes).
const TRAILING_FILTER_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:(?:tem|possui|${ESTAR_SOURCE})\\s+)?(?:com|sem|e|que\\s+(?:tem|${ESTAR_SOURCE})|(?:e\\s+)?d[oa]|(?:e\\s+)?n[oa])\\s+(?:o\\s+|a\\s+)?(?:status|prioridade|[áa]rea|departamento|operador|respons[áa]vel|atendente|cliente|limite)\\b.*$`,
  "iu",
);

const TRAILING_PAGE_CLAUSE_PATTERN =
  /\s*\(?\s*p[áa]gina\s+\d+\)?\s*$/iu;

// "e depois exporte em PDF/CSV" (achado testando o lote de perguntas ao
// vivo): pedir um resumo/listagem e, na mesma frase, pedir pra exportar o
// resultado (exportação em si é um botão só de frontend, ver web/app.js —
// o backend não processa esse pedido) vazava a cláusula inteira pro nome
// capturado (ex.: "resumo do departamento Suporte e depois exporte em
// PDF" virava departamento: "Suporte e depois exporte em PDF", que nunca
// resolve no catálogo real). Só poda a cláusula, não implementa exportação.
// "(?:^|\s+)" no início, não só "\s+" (achado testando o lote de perguntas
// ao vivo, com dados reais): "Resumo de tickets POR ÁREA e exporte em
// CSV." não tem nome NENHUM antes da cláusula (conector "por área" bare,
// sem nome específico) — o grupo capturado começa DIRETO em "e exporte em
// CSV", sem espaço nenhum antes pra "\s+" casar, então a cláusula inteira
// sobrava sem ser podada (virava area: "e exporte em CSV" por engano).
const TRAILING_EXPORT_CLAUSE_PATTERN =
  /(?:^|\s+)e\s+(?:depois\s+)?export(?:e|a|ar)\s+(?:isso\s+|o\s+resultado\s+)?em\s+(?:pdf|csv)\b.*$/iu;

// "em volume/quantidade/número de tickets fechados" (achado testando o
// lote de perguntas ao vivo): cauda comum de "compare X com Y EM <métrica>"
// — sem essa poda, "Compare o departamento de Governança com o
// departamento Coids EM VOLUME DE TICKETS FECHADOS." vazava a cláusula
// inteira pro 2º nome capturado (departamento: "Coids em volume de
// tickets"), que nunca resolve no catálogo real.
const TRAILING_METRIC_CLAUSE_PATTERN =
  /\s+em\s+(?:volume|quantidade|numero)\s+de\s+.*$/iu;

// "em um gráfico"/"numa tabela"/"em forma de gráfico" (achado testando o
// lote de perguntas ao vivo): pedido de formato colado depois do nome
// capturado — "Mostra os tickets do cliente Ana Paula Reis EM UM GRÁFICO."
// vazava a cláusula inteira pro nome do cliente (cliente: "Ana Paula Reis
// em um gráfico"), que nunca bate por substring com nenhum contact_name
// real. Só poda a cláusula — decision.formato já é resolvido à parte, no
// texto original, por detectFormatoPreferido.
// "(?:...)?" no meio, não obrigatório (achado testando o lote de perguntas
// ao vivo, com dados reais): "quantos tickets tem POR DEPARTAMENTO EM
// TABELAS" (bare, sem "uma"/"forma de"/"formato de" no meio) não batia —
// só a forma COM artigo/preposição era podada, deixando "em tabelas"
// inteiro grudado no nome capturado (departamento: "em tabelas"). Mesma
// tolerância que FORMATO_TABELA_SOURCE/FORMATO_GRAFICO_SOURCE já aceitam
// pra DETECTAR o formato ("em tabela" bare também conta lá) — só faltava
// aqui, na limpeza do nome.
// "(?:^|\s+)" no início, não só "\s+" (achado testando o lote de perguntas
// ao vivo, com dados reais): "quantos tickets tem POR DEPARTAMENTO em
// tabelas" não tem nome nenhum antes da cláusula (conector bare, sem nome
// específico) — mesmo motivo do fix irmão em TRAILING_EXPORT_CLAUSE_PATTERN
// acima.
const TRAILING_FORMAT_CLAUSE_PATTERN =
  /(?:^|\s+)em\s+(?:(?:uma?|forma\s+de|formato\s+de)\s+)?(?:gr[áa]ficos?|tabelas?|planilhas?)\b.*$/iu;

// "mas atendidos/tratados por outro operador" (achado testando o lote de
// perguntas ao vivo): "Tickets abertos PELO Rodrigo MAS ATENDIDOS POR OUTRO
// OPERADOR." vazava a cláusula inteira pro nome capturado (operador:
// "Rodrigo mas atendidos por outro operador") — a pergunta cruzada em si
// (aberto por X, atendido por Y) não é suportada pelo modelo de dados (só
// existe 1 campo "operator" por ticket), então aqui só poda a cláusula; o
// filtro vira o operador que ABRIU (Rodrigo), a parte não suportada é
// descartada honestamente em silêncio, igual qualquer outra combinação sem
// suporte no sistema.
const TRAILING_BUT_OTHER_OPERATOR_CLAUSE_PATTERN =
  /\s+mas\s+(?:foram\s+|foi\s+)?(?:atendid[oa]s?|tratad[oa]s?)\s+por\s+outro\s+operador\b.*$/iu;

// "e me diga quem está mais sobrecarregado" (achado testando o lote de
// perguntas ao vivo): jeito comum de fechar um pedido de comparação pedindo
// um veredito explícito — "Compare a carga do X com a do Y E ME DIGA QUEM
// está mais sobrecarregado." vazava a cláusula inteira pro 2º nome
// capturado (operador: "Y e me diga quem"). A resposta da comparação já diz
// os números de cada lado (o usuário consegue ver quem está mais
// sobrecarregado olhando o resultado), então só poda a cláusula.
const TRAILING_TELL_ME_WHO_CLAUSE_PATTERN =
  /\s+e\s+(?:me\s+)?di(?:ga|z)\s+quem\b.*$/iu;

// Achado ao vivo testando continuação conversacional (agent/continuation.js):
// mergeContinuation só concatena a pergunta anterior com a nova usando um
// espaço, sem nenhuma pontuação entre as duas — "Resumo... na área Suporte"
// + "e desses só os Urgente" virava literalmente "...área Suporte e desses
// só os Urgente" numa frase só, e a captura de nome de área (livre, vai até
// o fim da frase) engolia a continuação inteira junto, virando
// area: "Suporte e desses só os Urgente". Mesma lista de marcadores de
// agent/continuation.js, repetida aqui de propósito (routing-utils.js não
// importa de agent/continuation.js nem vice-versa, pra não criar uma
// dependência cruzada só por isso).
const CONTINUATION_MARKER_SOURCE =
  "(?:e\\s+desses|desses|e\\s+os|e\\s+as|s[óo]\\s+os|s[óo]\\s+as|apenas\\s+os|apenas\\s+as|e\\s+quanto\\s+a(?:os?)?)";

const TRAILING_CONTINUATION_CLAUSE_PATTERN = new RegExp(`\\s+${CONTINUATION_MARKER_SOURCE}\\b.*$`, "iu");

// "e por X" (achado testando o lote de perguntas ao vivo): mesma ideia de
// CONTINUATION_MARKER_SOURCE acima, mas pro CONECTOR de resumo multi-
// dimensão numa frase só ("Resumo por área E POR CLIENTE.") — "status"/
// "prioridade" já tinham essa exclusão (achado num lote anterior), mas
// área/operador/departamento/cliente ainda não, e cada um tem seu próprio
// extrator de nome livre — por isso uma fonte única, reaproveitada nos 6,
// em vez de repetir a mesma exclusão 6 vezes com o risco de uma ficar pra
// trás se o vocabulário mudar (mesmo erro que já aconteceu com os
// sinônimos de área antes de existir AREA_SYNONYM_SOURCE).
const DIMENSION_CONNECTOR_LEAK_SOURCE = "e\\s+por\\b";

// Verbo solto no fim da captura, sem cláusula depois (ex.: "...o operador
// Cesar tem?" → o "tem" sobra porque não há um "no/na/do/da <dimensão>"
// depois dele para o corte acima remover junto). "no total"/"ao todo" depois
// do verbo (ex.: "a área Suporte tem no total?") também não faz parte do
// nome — sem isso, "Suporte tem no total" vazava inteiro pro filtro de área.
// "teve"/"tiveram" (passado de "ter") e "possuiu"/"possuíram" (passado de
// "possuir") são a mesma ideia em outro tempo verbal (ex.: "a área WEB teve
// no mês de agosto?") — sem eles, só a forma no presente era podada.
// "existe(m)" (achado testando o padrão novo "tickets de <nome>" acima):
// "Quantos chamados de Ana existem?" sobrava "Ana existem" como nome, pelo
// mesmo motivo — "existem" nunca tinha entrado nessa lista de verbos soltos.
const BARE_HAVE_VERB_SOURCE =
  `(?:tem|teve|tiveram|possui|possuiu|possu[íi]ram|existe|existem|${ESTAR_SOURCE})`;
// "na fila" (achado testando o lote de perguntas ao vivo): "Quantos
// chamados o técnico Rodrigo Fernandes TEM NA FILA?" só tinha "no total"/
// "ao todo" como qualificador aceito depois do verbo — "na fila" vazava
// junto do nome capturado ("Rodrigo Fernandes tem na fila").
const TRAILING_BARE_VERB_PATTERN = new RegExp(
  `\\s+${BARE_HAVE_VERB_SOURCE}(?:\\s+(?:no\\s+total|ao\\s+todo|na\\s+fila))?\\s*$`,
  "iu",
);

// "está(m) <situação do ticket>" no fim da frase não faz parte do nome
// capturado (ex.: "departamento COIDS estão com o SLA pausado", "área X
// estão abertos há mais tempo") — corta tudo a partir de "está(m)". "que"
// opcional antes do verbo (achado ao corrigir o P5 da auditoria end-to-end:
// "tickets do João QUE ESTÃO aguardando atendimento" capturava operador:
// "João que", porque o "que" antes de "estão" não era coberto) — mesma
// ideia do "no/na" opcional já usado antes da data relativa. "foram"/"foi"
// como alternativa a está/estão, com "ainda"/"não"/"já" opcionais antes
// (achado testando o lote de perguntas ao vivo): "...do Ivan Márcio Barbosa
// QUE AINDA NÃO FORAM RESOLVIDOS" capturava operador: "Ivan Márcio Barbosa
// que ainda não foram", porque só está/estão eram cobertos, não foi/foram.
const TRAILING_STATE_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:que\\s+)?(?:ainda\\s+)?(?:n[ãa]o\\s+)?(?:j[áa]\\s+)?(?:${ESTAR_SOURCE}|foram|foi)\\s+.+$`,
  "iu",
);

// Achado extra descoberto testando o item 10 (mesma causa raiz do item 1):
// o adjetivo de situação "aberto"/"pendente"/"congelado"/"travado"/
// "paralisado" SOLTO no fim (sem verbo "está"/"estão" antes, ex.: "área
// Suporte abertos", "cliente Acme congelados") não era removido — o
// equivalente pra "fechado" já funcionava (TRAILING_RESOLVED_CLAUSE_PATTERN
// reaproveita CLOSURE_VERB_SOURCE, que já cobre a forma adjetiva "fechados"
// etc.), mas não havia um pattern irmão pra esse vocabulário.
const OPEN_STATE_ADJECTIVE_SOURCE =
  "(?:abert[oa]s?|pendentes?|congelad[oa]s?|travad[oa]s?|paralisad[oa]s?)";
// "em" opcional antes do adjetivo (achado ao vivo: "a equipe de Suporte tem
// EM aberto?" deixava "tem em" sobrando — o corte só pegava " aberto" sozinho,
// sem a preposição que normalmente vem antes ("está EM aberto"), e o "em"
// dangling impedia TRAILING_BARE_VERB_PATTERN de reconhecer "tem" como
// último token da frase logo depois).
// "ainda"/"já" opcionais antes do "em" (achado testando o lote de perguntas
// ao vivo): "Tickets do cliente X AINDA EM aberto." deixava "ainda" sobrando
// no nome capturado (cliente: "X ainda"), porque o corte só reconhecia
// "em aberto"/"aberto" direto, sem o advérbio que costuma vir antes — mesmo
// vocabulário de advérbio já aceito por TRAILING_STATE_CLAUSE_PATTERN acima
// (que/ainda/não/já), aqui só os 2 que fazem sentido antes de um adjetivo.
const TRAILING_OPEN_STATE_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:ainda\\s+|j[áa]\\s+)?(?:em\\s+)?${OPEN_STATE_ADJECTIVE_SOURCE}\\b.*$`,
  "iu",
);

// Vocabulário de "fechado" em toda forma verbal (3ª pessoa do singular/
// plural no passado) e adjetiva (singular/plural) dos 6 sinônimos aceitos —
// um único lugar pra declarar isso evita o que já aconteceu duas vezes
// nesta sessão: um sinônimo ganhar a forma adjetiva ("encerrados") mas não a
// verbal ("encerrou"), ou vice-versa, em só um dos usos (detecção de
// intenção, negação, ou corte de cláusula final ao extrair nomes).
// "solucionado/solucionou" (item 5 do plano de correção) é sinônimo comum de
// "resolvido" que faltava.
// "fex-" (achado testando o lote de perguntas ao vivo — Complexas 1,
// pergunta 13): "ch"/"x" soam igual em português, e é um erro de digitação
// comum o suficiente pra tratar como sinônimo mesmo (não é um typo
// aleatório qualquer) — "tickts fexados essa semana" perdia o filtro de
// status inteiro, virando uma listagem genérica (abertos+fechados
// misturados). Só o radical "fech"/"fex" ganha a variante; os outros 5
// sinônimos de fechamento não têm esse padrão de troca fonética comum.
const CLOSURE_VERB_SOURCE =
  "(?:fe(?:ch|x)(?:ad[oa]s?|ou|aram)"
  + "|encerr(?:ad[oa]s?|ou|aram)"
  + "|conclu(?:[íi]d[oa]s?|iu|[íi]ram)"
  + "|finaliz(?:ad[oa]s?|ou|aram)"
  + "|resolv(?:id[oa]s?|eu|eram)"
  + "|solucion(?:ad[oa]s?|ou|aram))";

// "fechou/encerrou/concluiu/finalizou/resolveu <período>" no fim da captura
// não faz parte do nome (ex.: "o pessoal da Infraestrutura Científica
// resolveu esse mês" → a área é só "Infraestrutura Científica"; "a área WEB
// concluiu quantos chamados" → só "WEB").
const TRAILING_RESOLVED_CLAUSE_PATTERN = new RegExp(`\\s+${CLOSURE_VERB_SOURCE}\\b.*$`, "iu");

// "atendido(s)/atendida(s)" no meio da captura (achado testando o lote de
// perguntas ao vivo, com dados reais): "Tickets do operador X ATENDIDOS na
// área Y." usa "atendidos" em concordância com o substantivo implícito
// "tickets" (não faz parte do nome do operador) — sem podar essa cláusula,
// "atendidos na área Y" inteiro vazava pro nome capturado (operador: "X
// atendidos"). Mesmo formato de TRAILING_RESOLVED_CLAUSE_PATTERN acima
// (poda da palavra até o fim da frase, não só até o próximo espaço).
const TRAILING_HANDLED_CLAUSE_PATTERN = /\s+atendid[oa]s?\b.*$/iu;

// Mesma ideia do padrão acima, mas pro verbo de CRIAÇÃO (voz passiva "foi/
// foram aberto(s)"), não de fechamento — reaproveitado também por
// isCreationPassive mais abaixo, pra não duplicar o vocabulário em 2
// lugares. Ex.: "tickets urgentes da categoria Suporte foram abertos este
// mês" → a área é só "Suporte".
const CREATION_VERB_SOURCE = "(?:foi|foram)\\s+abert[oa]s?";
const TRAILING_CREATION_CLAUSE_PATTERN = new RegExp(`\\s+${CREATION_VERB_SOURCE}\\b.*$`, "iu");

// "criado(s)/criada(s) por/pelo/pela <agente>" (voz ativa, identifica QUEM
// criou, diferente de CREATION_VERB_SOURCE acima que é sobre QUANDO) no fim
// da captura não faz parte do nome — quem criou já é extraído à parte por
// extractOperatorName (ex.: "tickets com prioridade alta criados pelo
// operador Cesar" → a prioridade é só "alta").
const TRAILING_CREATED_BY_CLAUSE_PATTERN = /\s+criad[oa]s?\s+(?:por|pel[oa])\s+.+$/iu;

// Vocabulário de "atrasado" (proxy de mais-antigo — a API não tem dado real
// de prazo de SLA em lote, ver isOldestOpenIntent mais abaixo) em forma
// adjetiva e verbal — mesmo cuidado do CLOSURE_VERB_SOURCE acima, 1 lugar só
// pra não repetir o bug de um sinônimo ganhar só 1 das 2 formas. Também
// reaproveitado pelo detector de negação (item 3) pra reconhecer "não estão
// atrasados"/"não passou do prazo" como negação de um estado, não só de uma
// palavra solta. "fora do prazo"/"passou do prazo"/"venceu" (item 5) eram os
// sinônimos que o próprio usuário citou no pedido original e que faltavam.
// F5 (auditoria de robustez): "ultrapassou o prazo/SLA", "estourou o SLA" e
// o idioma modal "já deveriam ter sido resolvidos" (que no uso natural
// significa vencido — "deveria ter acontecido mas não aconteceu", não uma
// afirmação de que já fechou) faltavam aqui.
// "j[áa]" (não só "ja") de propósito: esta constante agora também é usada
// contra texto CRU em TRAILING_SLA_MODAL_CLAUSE_PATTERN (cleanFreeText),
// onde "já" mantém o acento — mesmo motivo da tolerância em TICKET_NOUN_
// SOURCE/NEGATION_MARKER_SOURCE.
const SLA_MODAL_OVERDUE_SOURCE = `deveria(?:m)?\\s+(?:j[áa]\\s+)?ter\\s+sido\\s+${CLOSURE_VERB_SOURCE}`;
const OLDEST_PROXY_STATE_SOURCE =
  "(?:atrasad[oa]s?"
  + "|vencid[oa]s?"
  + "|estourad[oa]s?"
  + "|venc(?:eu|eram)"
  + "|fora\\s+do\\s+prazo"
  + "|fora\\s+do\\s+sla"
  + "|estour(?:ou|aram)\\s+o\\s+sla"
  + "|ultrapass(?:ou|aram)\\s+(?:o\\s+)?(?:prazo|sla)"
  + "|pass(?:ou|aram)\\s+do\\s+prazo"
  + `|${SLA_MODAL_OVERDUE_SOURCE})`;

// Conecta uma dimensão (status/área/operador/...) ao pedido de resumo: além
// de "por X", aceita "em cada X", "por cada X", "de cada X" e "cada X" (ex.:
// "quantos tickets existem em cada departamento?").
const DIMENSION_CONNECTOR_SOURCE = "(?:por|em\\s+cada|por\\s+cada|de\\s+cada|cada)";

// "Quais operadores possuem mais tickets?" / "...têm mais chamados?" /
// "...abre mais chamados?" / "área/operador COM mais tickets" / "qual
// cliente MAIS abriu chamados" (ordem invertida, comum em português pra dar
// ênfase) também pedem um resumo/ranking, mesmo sem a palavra "por" ou
// "quantos". O "(?!\s+de\b)" depois de "mais"/"menos" evita casar "com mais
// de 30 dias" (limiar de idade, não ranking) com a mesma regra de "com
// mais". "menos" (o oposto de "mais") também aciona o resumo/ranking — a
// tool sempre devolve a lista completa ordenada do maior pro menor, então
// "quem tem menos" é respondido lendo o fim da lista; só não vale combinar
// isso com um "top N" numérico (nesse caso o corte pegaria os N maiores, não
// os N menores — limitação conhecida, não implementada).
// "teve"/"tiveram" (passado simples de "ter", achado testando o lote de
// perguntas ao vivo — Lote extra 3, pergunta 15): "tem" só cobre o presente;
// "Qual cliente TEVE mais tickets nos últimos 30 dias?" não batia em nenhum
// gatilho de ranking, e a frase inteira acabava capturada por engano como
// nome de cliente ("teve mais tickets") por extractClientName.
// "tem a maior/menor carga (de trabalho)" (achado testando o lote de
// perguntas ao vivo): "Qual operador tem A MENOR carga de trabalho na área
// de Suporte?" não batia em nenhuma forma acima (todas exigem "mais"/
// "menos" logo depois do verbo, sem o artigo "a" nem o adjetivo "maior"/
// "menor" no meio) — a frase inteira caía no fallback genérico, e "tem a
// menor carga de trabalho" virava nome de operador.
// "fechou"/"fecharam"/"atendeu"/"atenderam"/"tratou"/"trataram" (achado
// testando o lote de perguntas ao vivo): "Quais os 3 operadores QUE MAIS
// FECHARAM tickets este mês?" não batia em nenhuma forma de verbo aceita
// (só possuir/ter/abrir) — a frase inteira caía no listar_tickets_fechados
// genérico, perdendo o ranking "3 operadores que mais X" por completo. Mesmo
// vocabulário de verbo já aceito em OPERATOR_WORKLOAD_VERB_SOURCE, reusado
// aqui pelo mesmo motivo (evitar 2 listas divergentes do mesmo verbo).
// "abr(?:e|em|iu|iram)" (achado testando o lote de perguntas ao vivo):
// faltava a forma plural do passado ("abriram") — todos os outros verbos
// aqui já tinham sua forma plural (fech(?:ou|aram), atend(?:eu|eram),
// trat(?:ou|aram)), só "abrir" tinha ficado pra trás (só e/em/iu). "Quais
// os 3 clientes que mais ABRIRAM chamados este mês?" não batia em nenhuma
// das 2 alternativas, perdendo o ranking por completo (caía num
// listar_tickets genérico, sem agrupar por cliente nem ordenar).
const RANKING_CUE_SOURCE =
  "(?:(?:possu(?:i|em)|tem|teve|tiveram|abr(?:e|em|iu|iram)|fech(?:ou|aram)|atend(?:eu|eram)|trat(?:ou|aram)|com)"
  + "\\s+(?:mais|menos)(?!\\s+de\\b)"
  + "|(?:mais|menos)\\s+(?:possu(?:i|em)|tem|teve|tiveram|abr(?:e|em|iu|iram)|fech(?:ou|aram)|atend(?:eu|eram)|trat(?:ou|aram))"
  + "|tem\\s+a\\s+(?:maior|menor)\\s+carga(?:\\s+de\\s+trabalho)?"
  // "tem o maior/menor número de tickets" (achado testando o lote de
  // perguntas ao vivo): "Qual área TEM O MENOR NÚMERO DE TICKETS abertos?"
  // não batia em nenhuma forma acima (todas exigem "mais"/"menos" logo
  // depois do verbo, sem "o maior/menor número de" no meio) — mesma classe
  // do "tem a maior/menor carga" já aceito pra operador, generalizado aqui
  // pra qualquer dimensão (área/departamento/cliente também usam esse
  // jeito de perguntar, não só carga de operador).
  + "|tem\\s+o\\s+(?:maior|menor)\\s+n[uú]mero\\s+de\\s+(?:tickets?|chamados?|atendimentos?))";

// Uma dimensão é mencionada tanto pela conexão "por/em cada/cada X" quanto
// pela estrutura de ranking "X ... tem/possui mais" (nome aparece antes) ou
// por "<dimensão>s diferentes" (achado testando o lote de perguntas ao
// vivo: "Quantos solicitantes diferentes abriram chamado esse mês?" caía
// no listar_tickets genérico — devolvendo a listagem inteira de tickets —
// em vez de resumo_tickets_por_cliente, que já devolve exatamente o que
// "diferentes" pede: nomes distintos, cada um com sua contagem, não uma
// lista de tickets crua). Não colide com a negação "diferente(s) de X"
// (NEGATION_PREFIX_SOURCE) porque essa exige "de" logo depois — aqui o
// \b fecha o match bem em "diferentes", sem nada depois.
function mentionsDimension(text, dimensionSource) {
  // "(?<!ordenad[oa]s?\\s)" (achado testando o lote de perguntas ao vivo):
  // "Mostra os tickets abertos da área Suporte, ORDENADOS POR prioridade."
  // pede uma LISTAGEM ordenada (não suportado — nenhuma tool de listagem
  // aceita ordenação por campo arbitrário, só as tools de resumo têm
  // `ordem` crescente/decrescente), mas "ordenados POR prioridade" batia
  // no mesmo conector "por X" usado pra reconhecer pedido de RESUMO
  // (agrupamento), hijackando a pergunta inteira pra resumo_por_prioridade
  // (números agrupados) em vez da listagem de tickets abertos que o
  // usuário pediu. "ordenado(s)/ordenada(s) por X" nunca significa
  // "agrupe por X" — sempre significa "classifique a listagem por X", um
  // pedido diferente (e sem suporte hoje, ver TRAILING_ORDER_CLAUSE_
  // PATTERN, que só poda a cláusula das capturas de nome, não reinterpreta
  // a intenção).
  const connector = new RegExp(`(?<!ordenad[oa]s?\\s)\\b${DIMENSION_CONNECTOR_SOURCE}\\s+(?:${dimensionSource})\\b`);
  const ranking = new RegExp(`\\b(?:${dimensionSource})\\b.*\\b${RANKING_CUE_SOURCE}\\b`);
  const distinctCount = new RegExp(`\\b(?:${dimensionSource})\\s+diferentes\\b`);

  return connector.test(text) || ranking.test(text) || distinctCount.test(text);
}

const ISO_DATE_SOURCE = "\\d{4}-\\d{2}-\\d{2}";

const MONTH_NAME_SOURCE =
  "janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";

const MONTH_NUMBERS = {
  janeiro: "01",
  fevereiro: "02",
  marco: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

// Mesmas chaves de MONTH_NUMBERS, sem acento — usado pra reconhecer "no mês
// de agosto"/"em agosto" (nome do mês solto, sem dia nem ano) no texto já
// normalizado (sem acento) que extractRelativeDateRange recebe.
const NORMALIZED_MONTH_NAME_SOURCE = Object.keys(MONTH_NUMBERS).join("|");

// Data por extenso, ex.: "dia 2 de agosto de 2026" ou "2 de agosto de 2026".
const LONG_DATE_SOURCE =
  `(?:dia\\s+)?\\d{1,2}\\s+de\\s+(?:${MONTH_NAME_SOURCE})\\s+de\\s+\\d{4}`;

// Data no formato brasileiro DD/MM/AAAA (achado testando o lote de perguntas
// ao vivo — Img 5): "entre 01/07/2026 e 31/07/2026" não batia em nenhum
// formato aceito (só ISO ou por extenso), então o intervalo inteiro vazava
// pro nome da entidade capturada (ex.: área "WEB teve entre 01/07/2026 e
// 31/07/2026"). Assume DD/MM (dia primeiro), o formato padrão em pt-BR — não
// há como distinguir de MM/DD sem contexto adicional, mas essa é a leitura
// natural de quem escreve em português.
const BR_DATE_SOURCE = "\\d{1,2}/\\d{1,2}/\\d{4}";

// Qualquer formato de data aceito (ISO, por extenso ou BR), como um único
// token.
const DATE_TOKEN_SOURCE = `(?:${ISO_DATE_SOURCE}|${LONG_DATE_SOURCE}|${BR_DATE_SOURCE})`;

// Normaliza um token de data (ISO, por extenso ou BR) para "AAAA-MM-DD".
function parseDateToken(token) {
  const texto = token.trim();

  if (new RegExp(`^${ISO_DATE_SOURCE}$`).test(texto)) {
    return texto;
  }

  const brMatch = texto.match(new RegExp(`^(\\d{1,2})/(\\d{1,2})/(\\d{4})$`));

  if (brMatch) {
    const dia = brMatch[1].padStart(2, "0");
    const mes = brMatch[2].padStart(2, "0");
    const ano = brMatch[3];

    return `${ano}-${mes}-${dia}`;
  }

  const longMatch = texto.match(
    new RegExp(`^(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${MONTH_NAME_SOURCE})\\s+de\\s+(\\d{4})$`, "iu"),
  );

  if (!longMatch) {
    return undefined;
  }

  const dia = longMatch[1].padStart(2, "0");
  const mesChave = longMatch[2].toLowerCase().replace("ç", "c");
  const mes = MONTH_NUMBERS[mesChave];
  const ano = longMatch[3];

  return mes === undefined ? undefined : `${ano}-${mes}-${dia}`;
}

function formatIsoDate(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

// "Tickets abertos no dia 31 de abril." (achado testando o lote de
// perguntas ao vivo): abril não tem dia 31, mas nada validava isso — o
// filtro virava o literal "2026-04-31" (data que não existe), e a resposta
// final era só "nenhum ticket encontrado", como se a pergunta fosse válida
// e só não tivesse resultado, em vez de avisar que a DATA em si é
// impossível. JS normaliza datas invalidas construindo um Date com
// rollover silencioso (new Date(2026,3,31) vira 1º de maio) — construir o
// Date e conferir se mês/dia batem com o que foi pedido é o jeito mais
// simples de detectar isso sem reimplementar o calendário.
function isDataCalendarInvalida(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? "");

  if (!match) {
    return false;
  }

  const [, anoStr, mesStr, diaStr] = match;
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  const dia = Number(diaStr);
  const data = new Date(ano, mes - 1, dia);

  return data.getFullYear() !== ano || data.getMonth() + 1 !== mes || data.getDate() !== dia;
}

// Segunda-feira da semana que contém `date`.
function startOfWeek(date) {
  const resultado = new Date(date);
  const diaSemana = resultado.getDay();
  const deslocamento = diaSemana === 0 ? -6 : 1 - diaSemana;

  resultado.setDate(resultado.getDate() + deslocamento);

  return resultado;
}

// Datas relativas ("essa semana", "hoje", "mês passado" etc.) não têm um
// token de data explícito — calculadas a partir do momento da pergunta.
// `agora` é parametrizável só para permitir teste determinístico.
export function extractRelativeDateRange(text, agora = new Date()) {
  if (/\bhoje\b/.test(text)) {
    const hoje = formatIsoDate(agora);

    return { dataInicio: hoje, dataFim: hoje };
  }

  if (/\bontem\b/.test(text)) {
    const ontem = new Date(agora);
    ontem.setDate(ontem.getDate() - 1);
    const isoOntem = formatIsoDate(ontem);

    return { dataInicio: isoOntem, dataFim: isoOntem };
  }

  // "amanhã" (achado P4 da auditoria end-to-end): antes não tinha nenhum
  // padrão pra essa data relativa, então o filtro simplesmente desaparecia
  // em silêncio ("tickets abertos amanhã" virava "tickets abertos", sem
  // filtro de data nenhum) — confirmado ao vivo com um resultado
  // logicamente impossível (tickets "abertos amanhã" sendo uma data futura).
  if (/\bamanha\b/.test(text)) {
    const amanha = new Date(agora);
    amanha.setDate(amanha.getDate() + 1);
    const isoAmanha = formatIsoDate(amanha);

    return { dataInicio: isoAmanha, dataFim: isoAmanha };
  }

  if (/\bsemana\s+passada\b/.test(text) || /\bultima\s+semana\b/.test(text)) {
    const segundaAtual = startOfWeek(agora);
    const segundaPassada = new Date(segundaAtual);
    segundaPassada.setDate(segundaPassada.getDate() - 7);
    const sextaPassada = new Date(segundaPassada);
    sextaPassada.setDate(sextaPassada.getDate() + 4);

    return { dataInicio: formatIsoDate(segundaPassada), dataFim: formatIsoDate(sextaPassada) };
  }

  // "Semana de trabalho" = segunda a sexta da semana atual. "d?essa"/
  // "d?esta" (achado testando o lote de perguntas ao vivo): "DESSA/DESTE
  // semana/mês/ano" (contração natural de "de"+"essa"/"de"+"este", tão
  // comum quanto a forma sem contração) não era reconhecida em nenhum dos
  // 3 períodos (semana/mês/ano) — a data inteira era ignorada em silêncio.
  if (/\b(?:d|n)?(?:essa|esta)\s+semana\b/.test(text)) {
    const segunda = startOfWeek(agora);
    const sexta = new Date(segunda);
    sexta.setDate(sexta.getDate() + 4);

    return { dataInicio: formatIsoDate(segunda), dataFim: formatIsoDate(sexta) };
  }

  // "último dia do mês" (achado testando o lote de perguntas ao vivo): data
  // de CALENDÁRIO (o último dia do mês atual), não um pedido de "ticket mais
  // recente" — checado ANTES de "último mês" (mais específico primeiro,
  // mesma ordem de leitura do resto do arquivo), embora os 2 regex não
  // colidam de verdade ("ultimo mes" exige "ultimo" IMEDIATAMENTE antes de
  // "mes", sem as palavras "dia do" no meio). Sem este caso, "Tickets no
  // ÚLTIMO DIA DO MÊS." não batia em nenhuma data relativa reconhecida, e
  // "último" sozinho acabava lido como pedido de recência (isBareMostRecentIntent,
  // mais abaixo) — virando "me mostre o ticket mais recente", sentido
  // completamente diferente do período de calendário pedido.
  if (/\b[uú]ltimo\s+dia\s+(?:d[oe]\s+)?mes\b/.test(text)) {
    const ultimoDia = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
    const isoUltimoDia = formatIsoDate(ultimoDia);

    return { dataInicio: isoUltimoDia, dataFim: isoUltimoDia };
  }

  // "último mês" (achado testando o lote de perguntas ao vivo): mesma ideia
  // de "última semana" já aceita acima como sinônimo de "semana passada" —
  // faltava o equivalente pra mês ("mês passado" sozinho não cobria essa
  // forma, bem comum, de falar).
  if (/\bmes\s+passado\b/.test(text) || /\bultimo\s+mes\b/.test(text)) {
    const primeiroDiaMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const ultimoDiaMesPassado = new Date(primeiroDiaMesAtual);
    ultimoDiaMesPassado.setDate(ultimoDiaMesPassado.getDate() - 1);
    const primeiroDiaMesPassado = new Date(ultimoDiaMesPassado.getFullYear(), ultimoDiaMesPassado.getMonth(), 1);

    return {
      dataInicio: formatIsoDate(primeiroDiaMesPassado),
      dataFim: formatIsoDate(ultimoDiaMesPassado),
    };
  }

  // "mês retrasado" (achado testando o lote de perguntas ao vivo): 2 meses
  // atrás (o mês ANTES do mês passado) — mesmo raciocínio de "mês passado"
  // acima, só 1 mês a mais pra trás. Checado DEPOIS de "mês passado" de
  // propósito (regex mais específico primeiro — "retrasado" não contém
  // "passado", então a ordem não causaria colisão de match, mas mantém a
  // leitura em sequência lógica: passado, depois retrasado).
  if (/\bmes\s+retrasado\b/.test(text)) {
    const primeiroDiaMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const primeiroDiaMesRetrasado = new Date(primeiroDiaMesAtual.getFullYear(), primeiroDiaMesAtual.getMonth() - 2, 1);
    const ultimoDiaMesRetrasado = new Date(primeiroDiaMesAtual.getFullYear(), primeiroDiaMesAtual.getMonth() - 1, 0);

    return {
      dataInicio: formatIsoDate(primeiroDiaMesRetrasado),
      dataFim: formatIsoDate(ultimoDiaMesRetrasado),
    };
  }

  // "num intervalo de 10 a 20 de outubro" (achado testando o lote de
  // perguntas ao vivo): intervalo de DIAS dentro de um mês NOMEADO — mesma
  // ideia do "entre o dia 1 e o dia 15 deste mês" logo abaixo, só com outra
  // construção ("num intervalo de X a Y de <mês>") e um mês explícito em
  // vez de "esse/este mês". Checado antes do padrão de mês nomeado sozinho
  // (diaMesNomeadoMatch, mais abaixo) pra não perder o intervalo de dias e
  // virar só 1 dia (dataInicio = dataFim) por engano.
  const intervaloDiasMesNomeadoMatch = text.match(
    new RegExp(
      `\\b(?:num|em\\s+um)\\s+intervalo\\s+de\\s+(\\d{1,2})\\s+a\\s+(\\d{1,2})\\s+de\\s+(${NORMALIZED_MONTH_NAME_SOURCE})\\b`,
      "iu",
    ),
  );

  if (intervaloDiasMesNomeadoMatch) {
    const diaInicio = intervaloDiasMesNomeadoMatch[1].padStart(2, "0");
    const diaFim = intervaloDiasMesNomeadoMatch[2].padStart(2, "0");
    const mes = MONTH_NUMBERS[intervaloDiasMesNomeadoMatch[3].toLowerCase()];
    const ano = agora.getFullYear();

    return { dataInicio: `${ano}-${mes}-${diaInicio}`, dataFim: `${ano}-${mes}-${diaFim}` };
  }

  // "entre o dia 1 e o dia 15 deste mês" (achado testando o lote de
  // perguntas ao vivo): intervalo de DIAS dentro do mês atual — mais
  // específico que "esse mês" sozinho (mês inteiro), checado ANTES pra não
  // perder o intervalo real de dias e virar o mês inteiro por engano.
  const entreDiasDesseMesMatch = text.match(
    /\bentre\s+(?:o\s+)?dia\s+(\d{1,2})\s+e\s+(?:o\s+)?dia\s+(\d{1,2})\s+(?:d|n)?(?:esse|este)\s+mes\b/iu,
  );

  if (entreDiasDesseMesMatch) {
    const diaInicio = entreDiasDesseMesMatch[1].padStart(2, "0");
    const diaFim = entreDiasDesseMesMatch[2].padStart(2, "0");
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, "0");

    return { dataInicio: `${ano}-${mes}-${diaInicio}`, dataFim: `${ano}-${mes}-${diaFim}` };
  }

  // "entre o dia 25 deste mês e o dia 5 do mês que vem" (achado testando o
  // lote de perguntas ao vivo): mesma ideia do intervalo de dias acima, mas
  // cruzando a virada do mês — o qualificador de mês vem 1 vez PRA CADA dia
  // (não 1 vez só no final, como no padrão irmão), por isso é um padrão à
  // parte, checado ANTES do fallback genérico de "esse/este mês" (que
  // estava engolindo a frase inteira e devolvendo o mês atual inteiro,
  // ignorando o intervalo de dias real pedido). "mês que vem"/"próximo mês"
  // como sinônimos do mês seguinte.
  const entreDiasVirandoMesMatch = text.match(
    /\bentre\s+(?:o\s+)?dia\s+(\d{1,2})\s+(?:d|n)?(?:esse|este)\s+mes\s+e\s+(?:o\s+)?dia\s+(\d{1,2})\s+(?:d[oe]\s+)?(?:mes\s+que\s+vem|proximo\s+mes)\b/iu,
  );

  if (entreDiasVirandoMesMatch) {
    const diaInicio = entreDiasVirandoMesMatch[1].padStart(2, "0");
    const diaFim = entreDiasVirandoMesMatch[2].padStart(2, "0");
    const primeiroDiaMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const anoInicio = primeiroDiaMesAtual.getFullYear();
    const mesInicio = String(primeiroDiaMesAtual.getMonth() + 1).padStart(2, "0");
    const primeiroDiaMesSeguinte = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
    const anoFim = primeiroDiaMesSeguinte.getFullYear();
    const mesFim = String(primeiroDiaMesSeguinte.getMonth() + 1).padStart(2, "0");

    return {
      dataInicio: `${anoInicio}-${mesInicio}-${diaInicio}`,
      dataFim: `${anoFim}-${mesFim}-${diaFim}`,
    };
  }

  if (/\b(?:d|n)?(?:esse|este)\s+mes\b/.test(text)) {
    const primeiroDia = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const ultimoDia = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);

    return { dataInicio: formatIsoDate(primeiroDia), dataFim: formatIsoDate(ultimoDia) };
  }

  // "último ano" — mesmo raciocínio de "último mês"/"última semana" acima.
  if (/\bano\s+passado\b/.test(text) || /\bultimo\s+ano\b/.test(text)) {
    const anoPassado = agora.getFullYear() - 1;

    return {
      dataInicio: formatIsoDate(new Date(anoPassado, 0, 1)),
      dataFim: formatIsoDate(new Date(anoPassado, 11, 31)),
    };
  }

  // "segundo trimestre desse ano" (achado testando o lote de perguntas ao
  // vivo): trimestre NUMERADO (1º a 4º), diferente de "último trimestre"
  // abaixo (que é sempre o trimestre calendário ANTERIOR ao atual) — aqui
  // o número é explícito, então usa o ano mencionado (ou o atual, se
  // nenhum "ano passado"/ano específico for dito). Checado ANTES do
  // "último trimestre" de propósito: sem isso, "segundo trimestre desse
  // ano" caía inteiro no fallback de "esse ano" (ano inteiro), perdendo o
  // recorte de trimestre por completo.
  const trimestreNumeradoMatch = text.match(
    /\b(primeiro|segundo|terceiro|quarto)\s+trimestre(?:\s+d[eo]\s+(\d{4})|\s+(?:d|n)?(?:esse|este)\s+ano|\s+do\s+ano\s+passado)?\b/iu,
  );

  if (trimestreNumeradoMatch) {
    const ORDINAL_TRIMESTRE = { primeiro: 0, segundo: 1, terceiro: 2, quarto: 3 };
    const trimestreNumero = ORDINAL_TRIMESTRE[trimestreNumeradoMatch[1].toLowerCase()];
    const ano = trimestreNumeradoMatch[2] !== undefined
      ? Number(trimestreNumeradoMatch[2])
      : /\bdo\s+ano\s+passado\b/.test(trimestreNumeradoMatch[0])
        ? agora.getFullYear() - 1
        : agora.getFullYear();
    const primeiroMes = trimestreNumero * 3;

    return {
      dataInicio: formatIsoDate(new Date(ano, primeiroMes, 1)),
      dataFim: formatIsoDate(new Date(ano, primeiroMes + 3, 0)),
    };
  }

  // "último trimestre" (achado testando o lote de perguntas ao vivo):
  // "trimestre" nunca tinha entrado no vocabulário de período — sem
  // reconhecimento nenhum, a frase inteira caía no fallback de "último"
  // sozinho (isBareMostRecentIntent, mais abaixo), virando por engano um
  // pedido de "só o ticket mais recente" (limite:1), sentido completamente
  // diferente do período pedido. Trimestre CALENDÁRIO (jan-mar/abr-jun/
  // jul-set/out-dez), mesmo raciocínio de "mês passado" (unidade de
  // calendário completa anterior, não uma janela corrida de 90 dias).
  if (/\btrimestre\s+passado\b/.test(text) || /\bultimo\s+trimestre\b/.test(text)) {
    const trimestreAtual = Math.floor(agora.getMonth() / 3);
    const trimestrePassado = (trimestreAtual + 3) % 4;
    const anoTrimestrePassado = trimestreAtual === 0 ? agora.getFullYear() - 1 : agora.getFullYear();
    const primeiroMes = trimestrePassado * 3;

    return {
      dataInicio: formatIsoDate(new Date(anoTrimestrePassado, primeiroMes, 1)),
      dataFim: formatIsoDate(new Date(anoTrimestrePassado, primeiroMes + 3, 0)),
    };
  }

  // "última quinzena" — mesmo gap de vocabulário acima, mas sem
  // equivalente de calendário padronizado (diferente de mês/trimestre/ano),
  // então é tratada como janela corrida dos últimos 15 dias, mesmo
  // raciocínio de "últimos N dias" mais abaixo.
  if (/\bultima\s+quinzena\b/.test(text)) {
    const inicio = new Date(agora);
    inicio.setDate(inicio.getDate() - 15);

    return { dataInicio: formatIsoDate(inicio), dataFim: formatIsoDate(agora) };
  }

  if (/\b(?:d|n)?(?:esse|este)\s+ano\b/.test(text)) {
    const anoAtual = agora.getFullYear();

    return {
      dataInicio: formatIsoDate(new Date(anoAtual, 0, 1)),
      dataFim: formatIsoDate(new Date(anoAtual, 11, 31)),
    };
  }

  // "entre agosto e setembro" — intervalo de 2 meses soltos, sem dia nem
  // ano (diferente de TRAILING_DATE_CLAUSE_PATTERN/extractDateRange, que só
  // cobre "entre X e Y" com data completa). Assume o ano corrente pros dois
  // meses — não cobre o caso de o intervalo atravessar a virada do ano
  // (ex.: "entre novembro e fevereiro").
  const intervaloMesesMatch = text.match(
    new RegExp(
      `\\bentre\\s+(${NORMALIZED_MONTH_NAME_SOURCE})\\s+e\\s+(${NORMALIZED_MONTH_NAME_SOURCE})\\b`,
      "iu",
    ),
  );

  if (intervaloMesesMatch) {
    const mesInicio = Number(MONTH_NUMBERS[intervaloMesesMatch[1].toLowerCase()]);
    const mesFim = Number(MONTH_NUMBERS[intervaloMesesMatch[2].toLowerCase()]);
    const ano = agora.getFullYear();

    return {
      dataInicio: formatIsoDate(new Date(ano, mesInicio - 1, 1)),
      dataFim: formatIsoDate(new Date(ano, mesFim, 0)),
    };
  }

  // "desde agosto"/"a partir de agosto" — mês nomeado sozinho como início de
  // um intervalo aberto (sem data final, assume até hoje), sem dia nem ano.
  // Diferente do "desde <data completa>" que extractDateRange já cobre —
  // achado testando o lote de perguntas ao vivo: "Qual cliente mais abriu
  // chamados na área WEB DESDE JANEIRO?" não extraía data nenhuma (nem essa
  // nem a de "no mês de"/"em" abaixo, que exigem outro conector), então o
  // "desde janeiro" inteiro vazava pro nome da área.
  const desdeMesNomeadoMatch = text.match(
    new RegExp(`\\b(?:desde|a\\s+partir\\s+de)\\s+(${NORMALIZED_MONTH_NAME_SOURCE})\\b`, "iu"),
  );

  if (desdeMesNomeadoMatch) {
    const mes = Number(MONTH_NUMBERS[desdeMesNomeadoMatch[1].toLowerCase()]);
    const ano = agora.getFullYear();

    return {
      dataInicio: formatIsoDate(new Date(ano, mes - 1, 1)),
      dataFim: formatIsoDate(agora),
    };
  }

  // "desde o dia 10 de março"/"a partir do dia 10 de março" (achado
  // testando o lote de perguntas ao vivo): mesma ideia de "desde agosto"/
  // "a partir de agosto" acima (intervalo ABERTO, até hoje), só que com um
  // dia específico dentro do mês em vez do mês inteiro — checado ANTES do
  // padrão "dia N de mês" sozinho (mais específico primeiro), senão esse
  // padrão mais genérico batia primeiro e virava um snapshot de 1 dia só
  // (dataInicio = dataFim), quando o pedido real é um intervalo aberto.
  const desdeDiaMesNomeadoMatch = text.match(
    new RegExp(
      `\\b(?:desde\\s+(?:o\\s+)?|a\\s+partir\\s+d[oe]\\s+)dia\\s+(\\d{1,2})\\s+de\\s+(${NORMALIZED_MONTH_NAME_SOURCE})\\b`,
      "iu",
    ),
  );

  if (desdeDiaMesNomeadoMatch) {
    const dia = desdeDiaMesNomeadoMatch[1].padStart(2, "0");
    const mes = MONTH_NUMBERS[desdeDiaMesNomeadoMatch[2].toLowerCase()];
    const ano = agora.getFullYear();

    return { dataInicio: `${ano}-${mes}-${dia}`, dataFim: formatIsoDate(agora) };
  }

  // "dia 15 de março" (achado testando o lote de perguntas ao vivo): dia +
  // mês nomeado, sem ano — mesmo raciocínio de "no mês de agosto"/"em
  // agosto" logo abaixo (assume o ano corrente), só que com um dia
  // específico dentro do mês, não o mês inteiro.
  const diaMesNomeadoMatch = text.match(
    new RegExp(`\\bdia\\s+(\\d{1,2})\\s+de\\s+(${NORMALIZED_MONTH_NAME_SOURCE})\\b`, "iu"),
  );

  if (diaMesNomeadoMatch) {
    const dia = diaMesNomeadoMatch[1].padStart(2, "0");
    const mes = MONTH_NUMBERS[diaMesNomeadoMatch[2].toLowerCase()];
    const ano = agora.getFullYear();
    const isoData = `${ano}-${mes}-${dia}`;

    return { dataInicio: isoData, dataFim: isoData };
  }

  // "no mês de agosto"/"em agosto" — nome do mês solto, sem dia nem ano.
  // Diferente de LONG_DATE_SOURCE (que exige "de <mês> de <ano>" completo),
  // aqui assume-se o ano corrente, já que é assim que a maioria das
  // perguntas do dia a dia se refere a um mês sem querer dizer um ano
  // específico.
  const mesNomeadoMatch = text.match(
    new RegExp(`\\b(?:no\\s+mes\\s+de|em)\\s+(${NORMALIZED_MONTH_NAME_SOURCE})\\b`, "iu"),
  );

  if (mesNomeadoMatch) {
    const mes = Number(MONTH_NUMBERS[mesNomeadoMatch[1].toLowerCase()]);
    const ano = agora.getFullYear();

    return {
      dataInicio: formatIsoDate(new Date(ano, mes - 1, 1)),
      dataFim: formatIsoDate(new Date(ano, mes, 0)),
    };
  }

  // "nos últimos N dias/semanas/meses/anos" — intervalo FECHADO (desse ponto
  // no passado até hoje), diferente de "há mais de N ..." logo abaixo (só
  // teto aberto, sem piso). Achado testando o lote de perguntas ao vivo: a
  // frase não tinha reconhecimento nenhum — nem virava filtro de data (o
  // período inteiro era ignorado em silêncio), nem era podada de nomes
  // capturados em outros campos (ex.: "atividade do cliente X nos últimos 30
  // dias e destaque..." vazava a cláusula inteira pro nome do cliente).
  const ultimosMatch = text.match(/\bultim[oa]s\s+(\d+)\s+(dias?|semanas?|mes|meses|anos?)\b/iu);

  if (ultimosMatch) {
    const quantidade = Number(ultimosMatch[1]);
    const unidade = ultimosMatch[2].toLowerCase();
    const inicio = new Date(agora);

    if (unidade.startsWith("dia")) {
      inicio.setDate(inicio.getDate() - quantidade);
    } else if (unidade.startsWith("semana")) {
      inicio.setDate(inicio.getDate() - quantidade * 7);
    } else if (unidade.startsWith("mes")) {
      inicio.setMonth(inicio.getMonth() - quantidade);
    } else {
      inicio.setFullYear(inicio.getFullYear() - quantidade);
    }

    return { dataInicio: formatIsoDate(inicio), dataFim: formatIsoDate(agora) };
  }

  // "há mais de N dias/semanas/meses/anos" — período relativo EM ABERTO
  // (só teto na data de abertura, sem piso): tickets abertos antes desse
  // ponto no tempo. Achado testando o lote de perguntas ao vivo (Img 31):
  // "tickets abertos há mais de 6 meses" não tinha suporte nenhum, o
  // período inteiro era ignorado em silêncio.
  // "mês" pluraliza irregular ("meses", não "mes" + "s"), por isso a
  // unidade lista as duas formas de cada uma por extenso em vez de um
  // radical + "s?" só (bug achado testando esta própria correção: "6
  // meses" não batia com "mes" + s? opcional, porque sobra um "e" entre os
  // dois "s").
  // "passou de"/"passaram de" (achado testando o lote de perguntas ao
  // vivo): mesmo sentido de "há mais de N dias" (teto na data de abertura),
  // só com outro verbo — "considerando só os que PASSARAM DE 90 dias" não
  // batia em nenhuma forma aceita.
  const haMaisDeMatch = text.match(
    /\b(?:ha\s+mais\s+de|passou\s+de|passaram\s+de)\s+(\d+)\s+(dias?|semanas?|mes|meses|anos?)\b/iu,
  );

  if (haMaisDeMatch) {
    const quantidade = Number(haMaisDeMatch[1]);
    const unidade = haMaisDeMatch[2].toLowerCase();
    const limite = new Date(agora);

    if (unidade.startsWith("dia")) {
      limite.setDate(limite.getDate() - quantidade);
    } else if (unidade.startsWith("semana")) {
      limite.setDate(limite.getDate() - quantidade * 7);
    } else if (unidade.startsWith("mes")) {
      limite.setMonth(limite.getMonth() - quantidade);
    } else {
      limite.setFullYear(limite.getFullYear() - quantidade);
    }

    return { dataFim: formatIsoDate(limite) };
  }

  // "N dias/semanas/meses/anos abertos" (ou "... sem operador atribuído") —
  // mesma ideia de "há mais de N ..." acima, só que com o estado vindo
  // DEPOIS do número, não antes de "há mais de" (achado testando o lote de
  // perguntas ao vivo — Complexas 1, perguntas 6 e 11): "tickets têm mais de
  // 30 dias abertos"/"ticket que ficou mais de 90 dias sem operador
  // atribuído" não batiam em haMaisDeMatch (que exige "há mais de N ..."
  // como prefixo), e o "mais de N ..." inteiro era ignorado em silêncio — a
  // resposta só "acertava" por coincidência quando nenhum outro ticket mais
  // novo também batia no resto dos filtros.
  const maisDeDiasAbertosMatch = text.match(
    /\bmais\s+de\s+(\d+)\s+(dias?|semanas?|mes|meses|anos?)\s+(?:(?:em\s+)?abert[oa]s?|sem\s+operador(?:\s+atribu[ií]do)?)\b/iu,
  );

  if (maisDeDiasAbertosMatch) {
    const quantidade = Number(maisDeDiasAbertosMatch[1]);
    const unidade = maisDeDiasAbertosMatch[2].toLowerCase();
    const limite = new Date(agora);

    if (unidade.startsWith("dia")) {
      limite.setDate(limite.getDate() - quantidade);
    } else if (unidade.startsWith("semana")) {
      limite.setDate(limite.getDate() - quantidade * 7);
    } else if (unidade.startsWith("mes")) {
      limite.setMonth(limite.getMonth() - quantidade);
    } else {
      limite.setFullYear(limite.getFullYear() - quantidade);
    }

    return { dataFim: formatIsoDate(limite) };
  }

  return undefined;
}

const TRAILING_DATE_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:(?:entre|per[íi]odo\\s+de)\\s+${DATE_TOKEN_SOURCE}\\s+(?:e|a|at[ée])\\s+${DATE_TOKEN_SOURCE}`
    + `|desde\\s+${DATE_TOKEN_SOURCE}`
    + `|a\\s+partir\\s+de\\s+${DATE_TOKEN_SOURCE}`
    + `|at[ée]\\s+${DATE_TOKEN_SOURCE})\\s*$`,
  "iu",
);

// Mesmos períodos relativos que extractRelativeDateRange reconhece (hoje/
// ontem/essa semana/semana passada/esse mês/mês passado/esse ano/ano
// passado) — sem isso, "departamento Governança ESSA SEMANA" vazava a
// cláusula de data inteira pro nome capturado (departamento: "Governança
// essa semana"). TRAILING_DATE_CLAUSE_PATTERN acima só cobre data ABSOLUTA
// ("entre X e Y"/"desde X"/"até X"), por isso é um padrão à parte.
// "no"/"na" opcional antes da fase relativa (ex.: "departamento Coids teve
// NO mês passado") — sem isso, o corte deixava o "no" órfão colado no nome
// capturado (departamento: "Coids teve no").
// "entre o dia 1 e o dia 15 deste mês" (achado testando o lote de
// perguntas ao vivo) — mesma ideia das outras TRAILING_*_CLAUSE acima, pro
// intervalo de dias dentro do mês que extractRelativeDateRange também
// passou a reconhecer. Padrão à parte (não cabe dentro de
// TRAILING_RELATIVE_DATE_CLAUSE_PATTERN abaixo porque essa começa a busca
// em "hoje|ontem|..."/formas de período sozinhas, não em "entre").
const TRAILING_ENTRE_DIAS_DESSE_MES_CLAUSE_PATTERN =
  /\s+entre\s+(?:o\s+)?dia\s+\d{1,2}\s+e\s+(?:o\s+)?dia\s+\d{1,2}\s+(?:d|n)?(?:esse|este)\s+m[êe]s\b.*$/iu;

// "entre o dia 25 deste mês e o dia 5 do mês que vem" (achado testando o
// lote de perguntas ao vivo) — mesma ideia do padrão acima, pro intervalo
// de dias cruzando a virada do mês que extractRelativeDateRange também
// passou a reconhecer.
const TRAILING_ENTRE_DIAS_VIRANDO_MES_CLAUSE_PATTERN =
  /\s+entre\s+(?:o\s+)?dia\s+\d{1,2}\s+(?:d|n)?(?:esse|este)\s+m[êe]s\s+e\s+(?:o\s+)?dia\s+\d{1,2}\s+(?:d[oe]\s+)?(?:m[êe]s\s+que\s+vem|pr[óo]ximo\s+m[êe]s)\b.*$/iu;

// "num intervalo de 10 a 20 de outubro" (achado testando o lote de
// perguntas ao vivo) — mesma ideia do padrão acima, pro intervalo de dias
// dentro de um MÊS NOMEADO que extractRelativeDateRange também passou a
// reconhecer.
const TRAILING_INTERVALO_DIAS_MES_NOMEADO_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:num|em\\s+um)\\s+intervalo\\s+de\\s+\\d{1,2}\\s+a\\s+\\d{1,2}\\s+de\\s+(?:${MONTH_NAME_SOURCE})\\b.*$`,
  "iu",
);

// "(?![\\p{L}\\p{N}])" no fim do grupo, não "\\b" (achado testando o lote de
// perguntas ao vivo): "amanh[ãa]" pode terminar em "ã" (acento no ÚLTIMO
// caractere, diferente de "área"/"página", onde o acento fica no meio e a
// última letra é ASCII) — \b do JS só reconhece [A-Za-z0-9_] como "palavra",
// então bem depois de um "ã" ele NUNCA fecha fronteira (os dois lados do
// ponto contam como "não-palavra" pro \b), mesmo contra um espaço em
// seguida. "Tickets da área Suporte AMANHÃ." não podava "amanhã" (ficava
// "Suporte amanhã" inteiro no nome capturado) por esse motivo. O lookahead
// unicode funciona igual pras outras alternativas do grupo (todas terminam
// em ASCII), então não muda nada pra elas.
const TRAILING_RELATIVE_DATE_CLAUSE_PATTERN = new RegExp(
  "\\s+(?:n[oa]\\s+)?(?:hoje|ontem|amanh[ãa]"
    + "|(?:d|n)?(?:ess[ae]|est[ae])\\s+semana|semana\\s+passada|[úu]ltima\\s+semana"
    + "|[úu]ltimo\\s+dia\\s+(?:d[oe]\\s+)?m[êe]s"
    + "|(?:d|n)?(?:esse|este)\\s+m[êe]s|m[êe]s\\s+passado|m[êe]s\\s+retrasado|[úu]ltimo\\s+m[êe]s"
    + "|(?:d|n)?(?:esse|este)\\s+ano|ano\\s+passado|[úu]ltimo\\s+ano"
    + "|(?:primeiro|segundo|terceiro|quarto)\\s+trimestre(?:\\s+d[eo]\\s+\\d{4}|\\s+(?:d|n)?(?:esse|este)\\s+ano|\\s+do\\s+ano\\s+passado)?"
    + "|trimestre\\s+passado|[úu]ltimo\\s+trimestre|[úu]ltima\\s+quinzena)(?![\\p{L}\\p{N}]).*$",
  "iu",
);

// "no mês de agosto"/"em agosto" (nome do mês solto) no fim da captura
// também não faz parte do nome — mesmo raciocínio do padrão acima, mas pro
// mês nomeado que extractRelativeDateRange passou a reconhecer.
const TRAILING_NAMED_MONTH_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:dia\\s+\\d{1,2}\\s+de|no\\s+m[êe]s\\s+de|em)\\s+(?:${MONTH_NAME_SOURCE})\\b.*$`,
  "iu",
);

// "tem comparado ao mês passado" (achado testando o lote de perguntas ao
// vivo): "Quantos tickets o departamento Financeiro TEM COMPARADO AO mês
// passado?" pede uma comparação de PERÍODO (não suportada — não há cálculo
// de tendência/delta entre 2 janelas de tempo), mas o período em si
// ("mês passado") já é podado certo pelos TRAILING_*_DATE_* acima — sobra
// só "tem comparado ao" dangling no fim do nome capturado (ex.:
// departamento: "Financeiro tem comparado ao"), porque nenhum pattern
// prunava esse verbo+preposição residual. Checado DEPOIS de todos os
// padrões de data acima de propósito — só limpa o que sobra depois que a
// cláusula de período já foi removida.
const TRAILING_COMPARED_TO_CLAUSE_PATTERN = /\s+(?:tem\s+)?comparado\s+a[oa]?\s*$/iu;

// "desde agosto"/"a partir de agosto" (mês nomeado solto, sem data
// completa) — mesma ideia do padrão acima, pro intervalo aberto que
// extractRelativeDateRange também passou a reconhecer.
const TRAILING_NAMED_MONTH_SINCE_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:desde\\s+(?:o\\s+dia\\s+\\d{1,2}\\s+de\\s+)?|a\\s+partir\\s+d[oe]\\s+(?:dia\\s+\\d{1,2}\\s+de\\s+)?)(?:${MONTH_NAME_SOURCE})\\b.*$`,
  "iu",
);

// "há mais de N dias/semanas/meses/anos" (Img 31) — mesma ideia, pro
// período relativo em aberto que extractRelativeDateRange também passou a
// reconhecer.
const TRAILING_HA_MAIS_DE_CLAUSE_PATTERN =
  /\s+(?:h[áa]\s+mais\s+de|passou\s+de|passaram\s+de)\s+\d+\s+(?:dias?|semanas?|mes|meses|anos?)\b.*$/iu;

// "fechados pelo Carlos EM MENOS DE 1 DIA" (achado testando o lote de
// perguntas ao vivo): limiar de duração de RESOLUÇÃO (não suportado —
// nenhuma tool filtra por quanto tempo um ticket levou pra ser fechado,
// diferente de "há mais de N dias" acima, que é sobre a idade do ticket
// desde a ABERTURA) vazava inteiro pro nome capturado (ex.: operador:
// "Carlos em menos de 1 dia"). Só poda a cláusula — a mesma lógica
// honesta de "canal"/outras dimensões sem suporte: descarta em silêncio
// em vez de inventar um filtro errado, mas sem corromper o nome que FOI
// capturado corretamente (Carlos).
const TRAILING_DURATION_THRESHOLD_CLAUSE_PATTERN =
  /\s+em\s+(?:menos|mais)\s+de\s+\d+\s+(?:dias?|horas?|semanas?|mes|meses|anos?)\b.*$/iu;

// "nos últimos N dias/semanas/meses/anos" — mesma ideia, pro intervalo
// fechado que extractRelativeDateRange também passou a reconhecer. ".*$" no
// fim de propósito: a cláusula costuma vir seguida de mais texto solto
// ("...nos últimos 30 dias e destaque os tickets mais antigos dele"), que
// também não faz parte do nome capturado.
const TRAILING_ULTIMOS_N_CLAUSE_PATTERN =
  /\s+(?:n[oa]s\s+)?[úu]ltim[oa]s\s+\d+\s+(?:dias?|semanas?|mes|meses|anos?)\b.*$/iu;

// "já deveriam ter sido resolvidos" (achado testando o lote de perguntas ao
// vivo): "Os chamados DO CARLOS já deveriam ter sido resolvidos há quanto
// tempo?" — o idioma modal de SLA vencido (SLA_MODAL_OVERDUE_SOURCE, já
// reconhecido certo pra ESCOLHER a tool listar_tickets_vencidos) nunca
// tinha o equivalente de poda em cleanFreeText, então vazava inteiro pro
// nome capturado ("Carlos já deveriam ter sido"). "(?:ja\s+)?" extra aqui
// cobre a ordem "já deveria(m)..." (mais comum na fala), além da ordem
// "deveria(m) já..." que SLA_MODAL_OVERDUE_SOURCE já cobre por conta
// própria.
const TRAILING_SLA_MODAL_CLAUSE_PATTERN = new RegExp(`\\s+(?:j[áa]\\s+)?${SLA_MODAL_OVERDUE_SOURCE}\\b.*$`, "iu");

// "entre agosto e setembro" (intervalo de 2 meses soltos) — mesma ideia,
// pro intervalo de meses que extractRelativeDateRange também reconhece.
const TRAILING_NAMED_MONTH_RANGE_CLAUSE_PATTERN = new RegExp(
  `\\s+entre\\s+(?:${MONTH_NAME_SOURCE})\\s+e\\s+(?:${MONTH_NAME_SOURCE})\\b.*$`,
  "iu",
);

// Achado testando o lote de perguntas ao vivo (Img 35): 'Existe algum
// chamado duplicado sobre "LED DE ALERTA"?' capturava texto: '"LED DE
// ALERTA"' com as aspas literais dentro — a API de tickets provavelmente
// faz match por substring contra o texto real do ticket, que não tem aspas
// nenhuma, então a busca nunca batia com nada. Remove aspas (retas e
// tipográficas) de qualquer entidade de texto livre capturada, não só busca
// por texto — o mesmo problema valeria pra um nome de área/operador/cliente
// entre aspas.
const QUOTE_CHARACTERS_PATTERN = /["'“”‘’„‟‹›«»]/gu;

// "abre muito(s) chamado(s)/ticket(s)/atendimento(s)" no fim da captura não
// faz parte do nome (achado testando o lote de perguntas ao vivo — Img 7):
// "cliente Amanda Carolina ABRE MUITOS CHAMADOS?" capturava cliente: "Amanda
// Carolina abre muitos chamados" inteiro, que nunca batia por substring com
// nenhum contact_name real.
const CLIENT_ACTIVITY_VERB_SOURCE = "(?:abre|abrem|abriu|abriram)";
const TRAILING_CLIENT_ACTIVITY_CLAUSE_PATTERN = new RegExp(
  `\\s+${CLIENT_ACTIVITY_VERB_SOURCE}\\s+muito[s]?\\s+(?:tickets?|chamados?|atendimentos?)\\b.*$`,
  "iu",
);

// "cliente X ABRIU no último mês" (achado testando o lote de perguntas ao
// vivo): mesmo verbo ativo de criação do padrão acima, mas sem "muito(s)
// chamados" depois — sozinho no fim da captura, uma vez que a cláusula de
// data relativa já foi cortada (por isso entra DEPOIS de
// TRAILING_RELATIVE_DATE_CLAUSE_PATTERN/TRAILING_DATE_CLAUSE_PATTERN na
// cadeia abaixo). Sem isso, "cliente Acme abriu no último mês" virava
// cliente: "Acme abriu" (verbo colado), que nunca bate com nenhum
// contact_name real.
const TRAILING_BARE_CREATION_VERB_PATTERN = new RegExp(`\\s+${CLIENT_ACTIVITY_VERB_SOURCE}\\s*$`, "iu");

// "equipe X tratou NO DIA DD/MM/AAAA" — TRAILING_DATE_CLAUSE_PATTERN só
// cobre data absoluta em intervalo ("entre/desde/até"), não uma data única
// ("em"/"no dia" + 1 data, o mesmo formato que extractDateRange reconhece
// via diaMatch) — sem isso, a cláusula de data inteira sobrava colada no
// verbo (achado ao vivo: "a equipe de Suporte tratou no dia 17/12/2025"
// virava area: "Suporte tratou no dia 17/12/2025", porque nem essa data nem
// o verbo em seguida eram podados).
const TRAILING_SINGLE_DATE_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:em|no\\s+dia)\\s+${DATE_TOKEN_SOURCE}\\s*$`,
  "iu",
);

// "tickets que a equipe X atendeu/tratou" — o verbo de atividade sobra no
// fim depois da data já ser podada acima (Img 16: "equipe web atendeu essa
// semana" virava area: "web atendeu" sem isso).
// "nunca " opcional antes do verbo (achado testando o lote de perguntas ao
// vivo): "Quais tickets o operador Carlos NUNCA atendeu?" deixava "nunca"
// sobrando no nome capturado (operador: "Carlos nunca") — o corte só
// reconhecia o verbo sozinho, sem o advérbio que costuma vir antes dele
// nessa construção.
const TRAILING_TEAM_ACTIVITY_CLAUSE_PATTERN = /\s+(?:nunca\s+)?(?:trat(?:ou|aram)|atend(?:eu|eram))\s*$/iu;

// "O operador Fulano TRATOU quantos tickets urgentes esse mês?" (achado
// testando o lote de perguntas ao vivo — Lote extra 2, pergunta 15): mesma
// ideia do pattern acima, mas o verbo vem seguido de mais pergunta
// ("quantos tickets...") em vez de fechar a frase — sem isso, "operador
// Fulano" capturava a cláusula inteira colada ("Fulano tratou quantos
// tickets urgentes esse mês"), que nunca bate com nenhum nome real.
// Vocabulário de verbo inline (não referencia OPERATOR_WORKLOAD_VERB_SOURCE,
// declarado mais abaixo no arquivo) pelo mesmo motivo do pattern irmão
// acima: ordem de declaração.
const TRAILING_WORKLOAD_QUESTION_CLAUSE_PATTERN =
  /\s+(?:tem|trat(?:ou|aram)|atend(?:eu|eram)|fech(?:ou|aram))\s+quant[oa]s?\b.*$/iu;

// "departamento Coids QUE O Rodrigo Fernandes ATENDEU" (achado testando o
// lote de perguntas ao vivo): oração relativa do lado do OPERADOR (ver
// extractOperatorName, mais abaixo, que já extrai "Rodrigo Fernandes"
// certo via esse mesmo padrão "que X tratou/atendeu/fechou/tem") vazava
// inteira pro nome de OUTRA dimensão capturada antes dela na frase
// (departamento: "Coids que o Rodrigo Fernandes"). Mesmo vocabulário de
// verbo inline do pattern irmão acima, mesmo motivo (ordem de declaração).
const TRAILING_OPERATOR_RELATIVE_CLAUSE_PATTERN =
  /\s+que\s+(?:o\s+|a\s+)?.+?\s+(?:tem|trat(?:ou|aram)|atend(?:eu|eram)|fech(?:ou|aram))\b.*$/iu;

// "ordenados da mais antiga pra mais nova"/"em ordem do maior pro menor"
// (achado testando o lote de perguntas ao vivo): pedido de ordenação de
// LISTAGEM (não suportado — só as tools de resumo têm campo `ordem`, ver
// ordemRanking mais abaixo) vazava inteiro pro nome capturado antes dele
// (ex.: "Liste os tickets do operador Carlos Eduardo ORDENADOS DA MAIS
// ANTIGA PRA MAIS NOVA" virava operador: "Carlos Eduardo ordenados da mais
// antiga pra mais nova"). Corta a partir de "ordenado(s)/ordenada(s)"
// inteiro — igual a outros TRAILING_*_PATTERN que cortam a partir de um
// verbo/adjetivo até o fim da frase, sem tentar interpretar a ordem em si
// (pedido de ordenação de listagem continua não suportado, só honestamente
// não vaza mais pro nome).
const TRAILING_ORDER_CLAUSE_PATTERN = /\s+(?:em\s+ordem|ordenad[oa]s?)\b.*$/iu;

function cleanFreeText(value) {
  const text = String(value ?? "")
    .split(/[,.!?;:]/u, 1)[0]
    .trim()
    .replace(QUOTE_CHARACTERS_PATTERN, "")
    .trim()
    // Achado testando o lote de perguntas ao vivo: "cliente O Boticário"
    // (empresa real cujo nome começa com artigo) perde o "O" aqui, virando
    // cliente: "Boticário" — tentativa de corrigir via case-sensitivity
    // (só podar a forma minúscula) foi revertida: um artigo GRAMATICAL
    // capturado no INÍCIO DA FRASE (ex.: "O Rodrigo Fernandes está com mais
    // tickets...", onde "O" é só a maiúscula de início de frase, não parte
    // do nome) também vem capitalizado, então case sozinho não distingue os
    // dois casos — confirmado ao rodar a suíte (3 testes existentes
    // quebraram). Limitação conhecida, não corrigida: um nome de
    // cliente/operador que comece com artigo (raro) pode perder essa
    // palavra.
    .replace(/^(?:o|a|os|as|de|do|da)\b\s+/iu, "")
    .replace(/^(?:operador|respons[áa]vel|atendente)\b\s+/iu, "")
    // Espaço artificial no início (achado testando o lote de perguntas ao
    // vivo, com dados reais — 3º caso da mesma classe, depois de "em
    // tabelas"/"e exporte em CSV"): quase toda TRAILING_*_CLAUSE_PATTERN
    // abaixo exige um "\s+" ANTES da cláusula pra podar — isso funciona bem
    // quando sobra um nome de verdade antes dela, mas quando o valor
    // capturado é a cláusula de lixo INTEIRA (ex.: "por departamento ENTRE
    // 2026-01-01 e 2026-02-01?", conector bare sem nome nenhum, onde a
    // captura começa DIRETO em "entre..."), não existe espaço nenhum pra
    // esse "\s+" casar, e a cláusula sobrava inteira sem ser removida. Um
    // espaço postiço aqui garante que todo pattern "\s+<cláusula>" também
    // bate quando a cláusula é tudo que sobrou — removido de novo pelo
    // ".trim()" no fim da cadeia, então é inofensivo pro resultado final.
    .replace(/^/, " ")
    .replace(TRAILING_CONTINUATION_CLAUSE_PATTERN, "")
    .replace(TRAILING_FILTER_CLAUSE_PATTERN, "")
    .replace(TRAILING_STATE_CLAUSE_PATTERN, "")
    // Antes de TRAILING_RESOLVED_CLAUSE_PATTERN de propósito (mesma lógica
    // do comentário sobre TRAILING_CREATION_CLAUSE_PATTERN mais abaixo):
    // "já deveriam ter sido RESOLVIDOS" precisa ser podado inteiro primeiro
    // (pattern mais específico, cobre o idioma modal inteiro), senão o
    // pattern genérico de "resolvidos" solto como verbo de fechamento comia
    // só o "resolvidos" e deixava "já deveriam ter sido" órfão pra trás.
    .replace(TRAILING_SLA_MODAL_CLAUSE_PATTERN, "")
    .replace(TRAILING_RESOLVED_CLAUSE_PATTERN, "")
    .replace(TRAILING_CREATION_CLAUSE_PATTERN, "")
    // Depois de TRAILING_CREATION_CLAUSE_PATTERN de propósito: "foram
    // abertos" precisa ser podado inteiro primeiro (pattern mais
    // específico), senão esse pattern (mais genérico, "abertos" solto)
    // comeria só o "abertos" e deixaria o "foram" órfão pra trás.
    .replace(TRAILING_OPEN_STATE_CLAUSE_PATTERN, "")
    .replace(TRAILING_CREATED_BY_CLAUSE_PATTERN, "")
    .replace(TRAILING_CLIENT_ACTIVITY_CLAUSE_PATTERN, "")
    .replace(TRAILING_DATE_CLAUSE_PATTERN, "")
    .replace(TRAILING_ENTRE_DIAS_DESSE_MES_CLAUSE_PATTERN, "")
    .replace(TRAILING_ENTRE_DIAS_VIRANDO_MES_CLAUSE_PATTERN, "")
    .replace(TRAILING_INTERVALO_DIAS_MES_NOMEADO_CLAUSE_PATTERN, "")
    .replace(TRAILING_RELATIVE_DATE_CLAUSE_PATTERN, "")
    .replace(TRAILING_NAMED_MONTH_RANGE_CLAUSE_PATTERN, "")
    .replace(TRAILING_NAMED_MONTH_SINCE_CLAUSE_PATTERN, "")
    .replace(TRAILING_HA_MAIS_DE_CLAUSE_PATTERN, "")
    .replace(TRAILING_DURATION_THRESHOLD_CLAUSE_PATTERN, "")
    .replace(TRAILING_ULTIMOS_N_CLAUSE_PATTERN, "")
    .replace(TRAILING_NAMED_MONTH_CLAUSE_PATTERN, "")
    .replace(TRAILING_COMPARED_TO_CLAUSE_PATTERN, "")
    .replace(TRAILING_PAGE_CLAUSE_PATTERN, "")
    .replace(TRAILING_EXPORT_CLAUSE_PATTERN, "")
    .replace(TRAILING_METRIC_CLAUSE_PATTERN, "")
    .replace(TRAILING_FORMAT_CLAUSE_PATTERN, "")
    .replace(TRAILING_BUT_OTHER_OPERATOR_CLAUSE_PATTERN, "")
    // Depois de TRAILING_BUT_OTHER_OPERATOR_CLAUSE_PATTERN de propósito: "mas
    // atendidos por outro operador" precisa ser podado inteiro primeiro
    // (cláusula mais específica), senão esse pattern genérico ("atendidos"
    // solto) comeria só o "atendidos" e deixaria o "mas" órfão pra trás.
    .replace(TRAILING_HANDLED_CLAUSE_PATTERN, "")
    .replace(TRAILING_TELL_ME_WHO_CLAUSE_PATTERN, "")
    .replace(TRAILING_BARE_VERB_PATTERN, "")
    .replace(TRAILING_SINGLE_DATE_CLAUSE_PATTERN, "")
    .replace(TRAILING_WORKLOAD_QUESTION_CLAUSE_PATTERN, "")
    .replace(TRAILING_OPERATOR_RELATIVE_CLAUSE_PATTERN, "")
    .replace(TRAILING_ORDER_CLAUSE_PATTERN, "")
    .replace(TRAILING_TEAM_ACTIVITY_CLAUSE_PATTERN, "")
    // Por último de propósito: só depois que uma cláusula de data já foi
    // cortada (ex.: "no último mês" por TRAILING_RELATIVE_DATE_CLAUSE_
    // PATTERN acima) é que o verbo de criação fica exposto sozinho no fim
    // ("Acme abriu" → "Acme").
    .replace(TRAILING_BARE_CREATION_VERB_PATTERN, "")
    .trim();

  // "Quantos tickets CADA OPERADOR TEM?" (achado testando o lote de
  // perguntas ao vivo): "cada" vem ANTES de "operador" (não faz parte do
  // valor capturado), então o que sobra pra limpar é só " tem?" — nenhum
  // TRAILING_*_PATTERN acima bate, porque todos exigem `\s+` (espaço) ANTES
  // do verbo pra cortar, e aqui não sobra nada antes dele dentro do próprio
  // texto capturado (o "cada" ficou de fora, no lado de fora da captura).
  // Resultado: "tem" sozinho passava como se fosse um nome válido de 3
  // letras (operador: "tem"). Guard final: se o texto INTEIRO (não só o
  // final) não é nada além de um verbo solto, não é um nome de verdade.
  if (new RegExp(`^${BARE_HAVE_VERB_SOURCE}$`, "iu").test(text)) {
    return undefined;
  }

  return text.length >= 1 && text.length <= 100 ? text : undefined;
}

function extractByPatterns(value, patterns) {
  const originalText = String(value ?? "");

  for (const pattern of patterns) {
    const match = originalText.match(pattern);

    if (!match) {
      continue;
    }

    const cleaned = cleanFreeText(match[1]);

    if (cleaned !== undefined) {
      return cleaned;
    }
  }

  return undefined;
}

// "ticket" tem sinônimos comuns no vocabulário de helpdesk (o próprio
// OcoMon vem de "Ocorrência"); todos são aceitos antes do número. "ordem(ns)
// de serviço" (achado na auditoria de robustez — termo comum fora deste
// sistema) entra como frase inteira, não como palavra solta "os": "os" sem
// contexto colide com o artigo plural comuníssimo em português ("OS
// atrasadas" normaliza igual a "os atrasadas"), então nunca é seguro aceitar
// "os" sozinho como sinônimo de ticket.
// "ordem" pluraliza irregular (ordem -&gt; ordens, "m" vira "ns", não é só
// "+s") — mesmo cuidado já tomado com "solicitação/solicitações" logo
// abaixo (TICKET_CONTEXT_SOURCE), erro que quase se repetiu aqui.
// Tolerante a acento ([êe]/[çc]/[ãa]) de propósito: quase todo uso desta
// constante é contra texto já normalizado (normalizeText, sem acento), onde
// essa tolerância é um no-op inofensivo — mas extractOperatorName (achado
// testando o lote de perguntas ao vivo, padrão "tickets DE <nome>" abaixo)
// usa contra o texto CRU, onde "serviço"/"ocorrência"/"solicitação" mantêm
// o acento de verdade, e sem essa tolerância o padrão nunca bateria.
const TICKET_NOUN_SOURCE =
  "(?:ticket|chamado|atendimento|ocorr[êe]ncia|solicita[çc][ãa]o|(?:ordem|ordens)\\s+de\\s+servi[çc]o)";

// Referência vaga a um ticket específico ("Aquele ticket lá, você sabe
// qual") produz entities:{} — exatamente a mesma forma de "Liste os
// tickets" (pedido deliberado de listagem sem filtro nenhum). As duas não
// dão pra distinguir só pela ausência de entidade; o sinal extra aqui é a
// combinação demonstrativo ("aquele"/"esse"/"aquela"/"essa") + substantivo
// de ticket + uma pista de incerteza do próprio usuário (ele mesmo admite
// não saber qual é). Sem essa combinação completa, uma frase comum como
// "Esse ticket está aberto?" não deve disparar — "esse ticket" sozinho é
// só uma referência demonstrativa normal, não necessariamente vaga.
// `text`, aqui e no uso abaixo, já passou por normalizeText (sem acento,
// sem pontuação) — por isso o acento nunca aparece e não precisa de
// fronteira de frase entre as duas partes do padrão (pontuação já virou
// espaço).
const VAGUE_TICKET_UNCERTAINTY_SOURCE =
  "(?:(?:voce\\s+)?sabe\\s+qual|nao\\s+sei\\s+qual|nao\\s+lembro\\s+qual|qual\\s+(?:era|e)\\s+mesmo)";
const VAGUE_TICKET_REFERENCE_PATTERN = new RegExp(
  `\\b(?:aquele|aquela|esse|essa|esses|essas)\\s+${TICKET_NOUN_SOURCE}\\b.*${VAGUE_TICKET_UNCERTAINTY_SOURCE}`
    + `|${VAGUE_TICKET_UNCERTAINTY_SOURCE}.*\\b${TICKET_NOUN_SOURCE}\\b`,
  "u",
);

// "área" tinha 3 listas de sinônimo quase-iguais, cada uma num lugar
// diferente do arquivo (extractAreaName, mentionsDimension pro resumo, e o
// portão de domínio mais abaixo) — cada uma foi ganhando uma palavra nova
// (ex.: "equipe") sem as outras duas acompanharem, então uma pergunta como
// "visualizar as OS por categoria" caía em "fora do domínio" só porque o
// PORTÃO (não a extração) nunca tinha ganhado "categoria". Uma fonte única,
// reaproveitada nos 3 lugares, evita essa dessincronia se repetir.
// "setor" (achado testando o lote de perguntas ao vivo): mesmo sinônimo
// comum de área/categoria/equipe, faltava — "Tickets do SETOR de
// Infraestrutura" caía no fallback genérico de operador (extractOperatorName
// capturando "setor de Infraestrutura" via "do/da X"), em vez de reconhecer
// "setor" como filtro de área.
const AREA_SYNONYM_SOURCE = "(?:[áa]rea|categoria|equipe|setor)";

// Mesma ideia, pro vocabulário de "cliente" — "solicitante" é sinônimo comum
// fora do vocabulário interno do sistema, faltava tanto na extração quanto
// no portão de domínio.
const CLIENT_LOOKUP_NOUN_SOURCE = "(?:cliente|solicitante)";
// Forma PLURAL de CLIENT_LOOKUP_NOUN_SOURCE — usada só em extractClientComparisonNames
// (achado testando o lote de perguntas ao vivo): "Compare os SOLICITANTES
// Ana e Beto." não batia em nenhum padrão de comparação (que hardcodava
// "clientes" literal, sem o sinônimo), e a frase inteira acabava em
// fora_do_dominio por não ter nenhuma outra palavra do vocabulário de
// tickets.
const CLIENT_LOOKUP_NOUN_PLURAL_SOURCE = "(?:clientes|solicitantes)";

// Mesmo vocabulário acima, mas aceitando plural — "solicitação" tem plural
// irregular ("solicitações" normaliza pra "solicitacoes", não
// "solicitacaos"), por isso entra como alternativa própria em vez de só
// anexar "s?" no grupo inteiro. Usado pelo guard de contexto de
// isFechadoIntent (item 7 do plano de correção) — ver mais abaixo.
const TICKET_CONTEXT_SOURCE = `(?:${TICKET_NOUN_SOURCE}s?|solicitacoes)`;

// Vocabulário mínimo que indica que a pergunta é sobre o domínio de tickets,
// mesmo quando nenhuma entidade foi extraída com sucesso — usado só no
// catch-all final de routeTicketQuestion (achado P1 da auditoria end-to-end:
// "qual é a previsão do tempo?" e outras perguntas sem relação nenhuma com
// tickets caíam silenciosamente em listar_tickets sem filtro, devolvendo uma
// listagem como se fosse resposta válida). Reaproveita os vocabulários já
// declarados acima (fechado/aberto/vencido) em vez de duplicar sinônimos.
// Deliberadamente SEM ${CLOSURE_VERB_SOURCE} (achado testando o lote de
// perguntas ao vivo — Lote extra 1, pergunta 19, teste de falso positivo
// proposital do usuário): "resolveu"/"concluiu"/"finalizou" são verbos
// genéricos do dia a dia (mesmo raciocínio do item 7/achado B10, que já
// existe para isFechadoIntent via hasTicketDomainContext) — "O time
// resolveu adiar a manutenção programada" não tem nada a ver com tickets,
// mas bastava a palavra "resolveu" pra esse portão aceitar a frase como "é
// sobre tickets" e cair no fallback de listar_tickets SEM NENHUM FILTRO,
// despejando o banco inteiro como se fosse resposta válida — falha pior
// que simplesmente recusar. "Chamados solucionados"/"tickets resolvidos"
// continuam funcionando normalmente: TICKET_CONTEXT_SOURCE (chamado/
// ticket/...) já cobre esses casos independente do verbo de fechamento.
// "operador(?:es)?" (achado testando o lote de perguntas ao vivo): "operador"
// sozinho (sem plural) nunca batia com "Compare OS OPERADORES Ana e Bruno,
// excluindo os fechados." — sem nenhuma entidade forte capturada (a
// comparação em si falhava por outro motivo, ver extractOperatorComparisonNames),
// esse portão era a última chance de reconhecer a frase como "sobre
// tickets", e a falha fazia uma pergunta claramente sobre o domínio ser
// recusada como fora_do_dominio.
const TICKET_DOMAIN_VOCABULARY_PATTERN = new RegExp(
  `\\b(?:${TICKET_CONTEXT_SOURCE}|resumo|historico|status|prioridade|urgente`
    + `|critic[oa]s?|${AREA_SYNONYM_SOURCE}s?|departamento|operador(?:es)?|responsavel|atendente|${CLIENT_LOOKUP_NOUN_SOURCE}`
    + `|pendente|${OPEN_STATE_ADJECTIVE_SOURCE}|${OLDEST_PROXY_STATE_SOURCE})\\b`,
  "u",
);

export function extractTicketNumber(value) {
  const text = normalizeText(value);

  const patterns = [
    new RegExp(`\\b${TICKET_NOUN_SOURCE}\\s+(?:numero\\s+)?(\\d+)\\b`),
    new RegExp(`\\bnumero\\s+(?:do\\s+)?(?:${TICKET_NOUN_SOURCE}\\s+)?(\\d+)\\b`),
    /\bn[°º]\s*(\d+)\b/,
    // Número sozinho, sem nenhuma outra palavra (ex.: "1002") — jeito comum
    // de perguntar por um ticket específico sem dizer "ticket"/"número"
    // (achado P3 da auditoria end-to-end: antes caía no fallback
    // listar_tickets, ignorando o número). Só bate quando o texto INTEIRO é
    // o número, pra não confundir com um número solto dentro de uma frase
    // maior sobre outra coisa (ex.: "limite 5", "página 2").
    /^(\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const numero = Number(match[1]);

    if (
      Number.isSafeInteger(numero)
      && numero > 0
      && numero <= 2147483647
    ) {
      return numero;
    }
  }

  return undefined;
}

// "Detalhe o ticket -5."/"Detalhe o ticket 999999999999999." (achado
// testando o lote de perguntas ao vivo): 2 jeitos de uma referência a
// ticket parecer válida mas não ser:
// (1) número NEGATIVO — normalizeText remove "-" como pontuação (mesma
//     regra usada em toda palavra do arquivo), então "-5" virava
//     silenciosamente "5" em extractTicketNumber, e a resposta mostrava o
//     ticket 5 DE VERDADE como se fosse o que foi pedido, sem avisar que
//     o "-5" original não faz sentido nenhum. Checado contra o texto CRU
//     (não normalizado) de propósito — é o único jeito de ainda enxergar
//     o "-" antes dele sumir.
// (2) número FORA do intervalo aceito (> 2147483647) — extractTicketNumber
//     já rejeita e devolve undefined (correto), mas sem este guard a
//     rejeição silenciosa caía direto no fallback de listagem SEM filtro
//     nenhum (despejando a base inteira), em vez de avisar que o número
//     em si é grande demais pra ser um ticket real.
const NEGATIVE_TICKET_NUMBER_PATTERN = new RegExp(
  `\\b(?:${TICKET_NOUN_SOURCE}|n[úu]mero|n[°º])\\.?\\s*-\\s*\\d+\\b`,
  "iu",
);

function detectaReferenciaDeTicketInvalida(pergunta) {
  if (NEGATIVE_TICKET_NUMBER_PATTERN.test(pergunta)) {
    return true;
  }

  const text = normalizeText(pergunta);
  const match =
    text.match(new RegExp(`\\b${TICKET_NOUN_SOURCE}\\s+(?:numero\\s+)?(\\d+)\\b`))
    ?? text.match(new RegExp(`\\bnumero\\s+(?:do\\s+)?(?:${TICKET_NOUN_SOURCE}\\s+)?(\\d+)\\b`))
    ?? text.match(/\bn[°º]\s*(\d+)\b/);

  if (!match) {
    return false;
  }

  const numeroBruto = Number(match[1]);

  return !(Number.isSafeInteger(numeroBruto) && numeroBruto > 0 && numeroBruto <= 2147483647);
}

// "Compare o ticket X com o ticket Y" / "diferença entre os tickets X e Y" —
// dois números de ticket na mesma pergunta com um conector de comparação.
// Só ativa quando há de fato um conector de comparação (não é só "atualize
// o 100 e o 200", por exemplo).
const COMPARE_CONNECTOR_SOURCE = "compar[ae]|diferen[cç]a\\s+entre";

export function extractTicketComparisonNumbers(value) {
  const text = normalizeText(value);

  if (!new RegExp(`\\b(?:${COMPARE_CONNECTOR_SOURCE})\\b`).test(text)) {
    return undefined;
  }

  // O substantivo (ticket/chamado/...) geralmente aparece uma vez só pra
  // valer pros dois números ("compare os tickets 50 e 75"), não repetido
  // antes de cada um — por isso não exige o substantivo colado em cada
  // número, só que ele apareça em algum lugar da frase.
  if (!new RegExp(`\\b(?:${TICKET_NOUN_SOURCE}s?|numero)\\b`).test(text)) {
    return undefined;
  }

  const numeros = [...text.matchAll(/\b(\d+)\b/g)]
    .map((match) => Number(match[1]))
    .filter((numero) => Number.isSafeInteger(numero) && numero > 0 && numero <= 2147483647);

  // "Compare os tickets 100, 200 e 300." (achado testando o lote de
  // perguntas ao vivo): com 3+ números, essa função truncava pros 2
  // primeiros e descartava o resto em silêncio (comparava só 100 e 200,
  // ignorando o 300 sem avisar). Em vez de truncar, devolve undefined pra
  // deixar a extração cair em extractMultipleTicketNumbers logo abaixo, que
  // já é genérica pra N itens (reusa o mesmo mecanismo de comparação) — só
  // muda o nome da intent (detalhar_varios_tickets em vez de
  // comparar_tickets), sem perder nenhum número.
  if (numeros.length > 2) {
    return undefined;
  }

  return numeros.length === 2 ? [numeros[0], numeros[1]] : undefined;
}

// "Detalhe os tickets 100, 200 e 300." (achado testando o lote de perguntas
// ao vivo): pedir o detalhe de 2+ tickets específicos SEM usar "compare"/
// "diferença entre" (ver COMPARE_CONNECTOR_SOURCE acima, exigido por
// extractTicketComparisonNumbers) — TICKET_NOUN_SOURCE é singular (sem "s"
// embutido, mesmo motivo do "s?" avulso logo abaixo), então "tickets 100"
// no plural nunca batia no padrão de ticket único (extractTicketNumber), e
// a lista de números inteira era descartada em silêncio, caindo num
// listar_tickets sem filtro nenhum.
// Ancorado direto no substantivo + números em sequência (não só "2+
// números em qualquer lugar da frase") de propósito — pra não confundir
// com outras frases que também têm 2+ números por motivos diferentes (ex.:
// "liste os 5 tickets mais antigos, página 2" tem 2 números, mas nenhum
// dos 2 está numa enumeração direta logo depois do substantivo).
export function extractMultipleTicketNumbers(value) {
  const text = normalizeText(value);

  // "," vira espaço em normalizeText (remove toda pontuação) — por isso o
  // separador aqui é "\\s+" entre os números, não uma vírgula literal
  // (achado testando esta própria correção: "tickets 100, 200 e 300" só
  // batia o "100" sozinho até essa troca, porque a vírgula nunca sobrevive
  // à normalização).
  const match = text.match(
    new RegExp(
      `\\b${TICKET_NOUN_SOURCE}s?\\s+(?:numero\\s+)?(\\d+(?:\\s+\\d+)*(?:\\s+e\\s+\\d+)?)\\b`,
      "u",
    ),
  );

  if (match) {
    const numeros = [...new Set(
      [...match[1].matchAll(/\d+/g)]
        .map((numeroMatch) => Number(numeroMatch[0]))
        .filter((numero) => Number.isSafeInteger(numero) && numero > 0 && numero <= 2147483647),
    )];

    if (numeros.length >= 2) {
      return numeros;
    }
  }

  // "O ticket 100 e o ticket 200 são do mesmo cliente?" (achado testando o
  // lote de perguntas ao vivo): forma natural que REPETE a palavra ticket/
  // chamado/etc. antes de CADA número, em vez de dizer o substantivo uma
  // vez só seguido da lista (padrão acima, que exige exatamente isso) —
  // sem este fallback, só o 1º número era capturado por extractTicketNumber
  // (que só olha a 1ª ocorrência da frase inteira), descartando o 2º (e a
  // pergunta real) em silêncio.
  const repetidos = [...text.matchAll(
    new RegExp(`\\b${TICKET_NOUN_SOURCE}\\s+(?:numero\\s+)?(\\d+)\\b`, "gu"),
  )]
    .map((repetidoMatch) => Number(repetidoMatch[1]))
    .filter((numero) => Number.isSafeInteger(numero) && numero > 0 && numero <= 2147483647);

  const numerosRepetidosUnicos = [...new Set(repetidos)];

  return numerosRepetidosUnicos.length >= 2 ? numerosRepetidosUnicos : undefined;
}

// Uma sequência de Nomes Próprios (1+ palavras capitalizadas cada) — usada
// pelos 2 padrões abaixo pra detectar uma ENUMERAÇÃO de pessoas/clientes
// (não tickets, que já têm seu próprio mecanismo de N itens acima), sem
// tentar resolver quem são de verdade. Contra o texto CRU (não normalizado),
// de propósito: capitalização é o único sinal barato de "isto é um nome
// próprio" disponível aqui.
// "(?:(?:de|da|do|dos|das)\\s+)?" entre as palavras (achado testando o lote
// de perguntas ao vivo, com dados reais): nomes compostos reais do sistema
// têm conector minúsculo NO MEIO do próprio nome ("Cesar Augusto DE Mello",
// "Bruno DE Souza Castro") — sem essa alternativa opcional, a sequência de
// maiúsculas quebrava bem antes da vírgula/"e" que de fato separa a lista
// ("Cesar Augusto" já fechava o nome, e o "de Mello" sobrando não batia em
// nada), e a exclusão inteira (2+ nomes) nunca disparava. "e" (conjunção da
// lista) não entra nessa lista de conectores de propósito — teria o efeito
// oposto, impedindo o reconhecimento de ONDE a lista realmente termina.
const NOME_PROPRIO_CONECTOR_SOURCE = "(?:de|da|do|dos|das)";
const NOME_PROPRIO_SOURCE =
  `\\p{Lu}[\\p{L}.]*(?:\\s+(?:${NOME_PROPRIO_CONECTOR_SOURCE}\\s+)?\\p{Lu}[\\p{L}.]*)*`;

// "sem contar o Fabio Gali e o Diego Mota" (achado testando o lote de
// perguntas ao vivo): negação de 2+ NOMES PRÓPRIOS específicos — diferente
// de negar um valor de catálogo com complemento fixo (fechado/congelado/
// etc., já coberto por detectaNegacaoNaoSuportada), aqui nenhum extrator
// chega a capturar nada (os de nome único não esperam "e" no meio, os de
// comparação exigem "compare"), então a exclusão inteira era ignorada em
// silêncio — o resumo saía CHEIO, com os nomes que deviam ser excluídos
// aparecendo normalmente. Detectado por um sinal mais simples (sem resolver
// os nomes): marcador de negação (reusa os mesmos 4 já aceitos em
// detectaNegacaoNaoSuportada) seguido de 2+ Nomes Próprios ligados por "e".
// "excluindo os OPERADORES Fulano, Beltrano e Cicrano" (achado testando o
// lote de perguntas ao vivo): 2 lacunas na 1ª versão deste padrão —
// (1) só aceitava artigo SINGULAR ("o"/"a") entre o marcador e o 1º nome,
// não o plural ("os"/"as"); (2) não aceitava a palavra de dimensão
// ("operadores"/"clientes"/...) que costuma vir ENTRE o artigo e o nome
// quando são 3+ pessoas enumeradas; (3) só aceitava EXATAMENTE 2 nomes
// ligados por "e", sem suporte a lista com vírgula pro 3º+ (mesma forma já
// aceita em TRES_OU_MAIS_NOMES_DO_DA_PATTERN abaixo). Função (não `const`
// de nível de módulo) de propósito: referencia USER_LOOKUP_NOUN_SOURCE, que
// só é declarada mais abaixo no arquivo — módulo não aceitaria uma `const`
// inicializada antes da declaração que ela usa, mas uma função só lê essa
// constante quando CHAMADA (de dentro de routeTicketQuestionCore, bem
// depois do módulo inteiro já ter carregado), então a ordem de declaração
// no arquivo não importa aqui.
function matchesExclusaoDeNomes(pergunta) {
  const prefixoSource =
    `(?:o\\s+|a\\s+|os\\s+|as\\s+)?(?:(?:${USER_LOOKUP_NOUN_SOURCE}|${CLIENT_LOOKUP_NOUN_SOURCE})(?:es|s)?\\s+)?`;
  const pattern = new RegExp(
    `\\b(?:sem\\s+contar|tirando|excluindo|exceto)\\s+${prefixoSource}${NOME_PROPRIO_SOURCE}`
      + `(?:\\s*,\\s*${prefixoSource}${NOME_PROPRIO_SOURCE})*\\s+e\\s+${prefixoSource}${NOME_PROPRIO_SOURCE}\\b`,
    "u",
  );

  return pattern.test(pergunta);
}

// "Detalhe os tickets do Fabio Gali, do Diego Mota e do Cesar." (achado
// testando o lote de perguntas ao vivo): 3+ NOMES PRÓPRIOS enumerados via
// "do/da X, do/da Y e do/da Z" — diferente de extractMultipleTicketNumbers
// acima (que já cobre "detalhe os TICKETS 100, 200 e 300" sem a palavra
// "compare"), aqui são pessoas/clientes, não números de ticket, e não
// existe tool nenhuma que detalhe/compare 3+ operadores ou clientes de uma
// vez (analisar_carga_operador/analisar_atividade_cliente só trabalham em
// pares) — sem este guard, o 1º nome virava operador e os outros 2 somem
// em silêncio. Exige a palavra ticket/chamado/etc. em algum lugar da frase
// (TICKET_NOUN_SOURCE), pra não disparar numa frase qualquer fora do
// domínio que por acaso enumere 3 nomes (ex.: um convite, não relacionado a
// tickets).
const TRES_OU_MAIS_NOMES_DO_DA_PATTERN = new RegExp(
  `\\bd[oa]\\s+${NOME_PROPRIO_SOURCE}\\s*,\\s*d[oa]\\s+${NOME_PROPRIO_SOURCE}`
    + `(?:\\s*,\\s*d[oa]\\s+${NOME_PROPRIO_SOURCE})*\\s+e\\s+d[oa]\\s+${NOME_PROPRIO_SOURCE}\\b`,
  "u",
);

// "(?!(?:mais|menos)\b)" no início da captura evita que perguntas de ranking
// com "mais"/"menos" invertido ("qual área MAIS tem tickets", "cliente que
// MAIS abriu chamados", "operador com MENOS tickets") sejam lidas como um
// nome de filtro literal ("área 'mais tem tickets'") — nenhum nome real de
// área/departamento/operador/cliente começa com "mais" ou "menos".
// "(?!${CONTINUATION_MARKER_SOURCE}\b)" logo depois (achado testando ao vivo
// a continuação conversacional, item F: "Resumo de tickets por operador" +
// "e desses, só os do Fábio?"): a palavra "operador"/"área"/"cliente"/etc.
// também aparece sozinha como CONECTOR de dimensão ("por operador", sem nome
// nenhum), e nesse caso ela fica diretamente colada ao marcador de
// continuação mesclado pelo F ("operador E DESSES, só os do Fábio"). Sem
// essa exclusão, o 1º pattern (achando a palavra "operador") vencia e
// engolia o marcador de continuação inteiro como se fosse o nome, e o nome
// de verdade ("Fábio", mais adiante na frase, via "do Fábio") nunca era
// tentado pelos padrões seguintes — o filtro inteiro sumia em silêncio.
// "(?!${RANKING_CUE_SOURCE})" (achado corrigindo o item acima, regressão
// pega por um teste já existente): "(?!mais|menos)" só bloqueia quando
// "mais"/"menos" vem IMEDIATAMENTE depois do substantivo — "Qual operador
// TEM MENOS tickets?" tem um verbo no meio ("tem") antes do "menos", e por
// isso não era bloqueado; capturava "tem menos tickets" como se fosse nome.
// RANKING_CUE_SOURCE já reconhece essa forma com verbo no meio (usado em
// mentionsDimension/hasResumoIntent), reaproveitado aqui pelo mesmo motivo.
export function extractAreaName(value) {
  return extractByPatterns(value, [
    // "categoria"/"equipe" são sinônimos comuns de "área" fora do
    // vocabulário interno do sistema (quem pergunta não necessariamente sabe
    // que a API chama isso de "área") — resolveMetaId falha graciosamente se
    // não for um nome de área real, então o risco de falso positivo é baixo.
    // "(?!${UNSET_VALUE_ADJECTIVE_SOURCE}\\b)" (achado testando o lote de
    // perguntas ao vivo): "Quantos tickets SEM ÁREA DEFINIDA existem?" não é
    // um nome de área de verdade — mesma ideia já corrigida pra prioridade
    // (ver UNSET_VALUE_ADJECTIVE_SOURCE), sem ela "definida existem" inteiro
    // virava area: "definida existem".
    new RegExp(
      `(?<![\\p{L}\\p{N}])${AREA_SYNONYM_SOURCE}\\s+(?:de\\s+)?(?!(?:mais|menos)\\b)(?!${RANKING_CUE_SOURCE})(?!${CONTINUATION_MARKER_SOURCE}\\b)(?!${DIMENSION_CONNECTOR_LEAK_SOURCE})(?!${UNSET_VALUE_ADJECTIVE_SOURCE}\\b)(.+)$`,
      "iu",
    ),
    // "o pessoal da/do X" é um jeito comum de gestor se referir a uma área
    // sem usar a palavra "área" — mesmo raciocínio acima.
    new RegExp(`\\bpessoal\\s+d[ao]\\s+(?!(?:mais|menos)\\b)(?!${RANKING_CUE_SOURCE})(?!${CONTINUATION_MARKER_SOURCE}\\b)(.+)$`, "iu"),
  ]);
}

// "sem departamento atribuído" (achado testando o lote de perguntas ao
// vivo): "atribuído" capturava como se fosse o NOME do departamento — não
// existe uma tool "listar_tickets_sem_departamento" (só sem_operador),
// então o pedido não tem como ser atendido de verdade, mas pelo menos não
// deve gerar um filtro de departamento "atribuído" (nunca resolve no
// catálogo real).
export function extractDepartmentName(value) {
  return extractByPatterns(value, [
    new RegExp(
      `\\bdepartamento\\s+(?:de\\s+)?(?!(?:mais|menos)\\b)(?!${RANKING_CUE_SOURCE})(?!${CONTINUATION_MARKER_SOURCE}\\b)(?!${DIMENSION_CONNECTOR_LEAK_SOURCE})(?!atribu[ií]do\\b)(.+)$`,
      "iu",
    ),
  ]);
}

// "por" também introduz fórmulas de cortesia/discurso em português ("por
// favor", "por gentileza") e conectivos que não têm nada a ver com "feito
// por alguém" ("por último", "por enquanto", "por exemplo") — confirmado ao
// vivo: "Liste os tickets abertos por favor" produzia operador: "favor".
// "usuário" (regressão achada testando o fix do item P5 da auditoria
// end-to-end): "aguardando feedback DO USUÁRIO" é parte do nome literal de
// um status, não uma referência a um operador chamado "usuário" — sem essa
// exclusão, "Quantos tickets estão aguardando feedback do usuário?"
// capturava operador: "usuário" (inexistente), fazendo a consulta não
// encontrar nada. Não afeta "tickets do usuário Carlos" (aí quem casa
// primeiro é o padrão explícito "usuário <nome>", não este).
// "fornecedor" (de "aguardando retorno DO FORNECEDOR", outro nome literal de
// status) e "prazo" (de "fora DO PRAZO"/"passou DO PRAZO", vocabulário de
// SLA vencido) são a mesma regressão do "usuário" acima — varredura
// completa do arquivo por "do/da <palavra>" feita depois de achar o bug do
// "usuário" pra não deixar mais casos iguais escondidos.
// Lista única de palavras de domínio, compartilhada pelos padrões "por/pelo"
// e "do/da" — "cliente"/"sistema"/"mês"/"ano"/"semana"/"período"/"total"
// também vazavam via "por" (achado testando "Quantos tickets por cliente?" →
// operador: "cliente" de brinde, corrompendo o filtro de resumo_por_cliente)
// e não só via "do/da", então não faz sentido as duas listas divergirem:
// se uma palavra é arriscada demais pra um conector possessivo, é arriscada
// do mesmo jeito pro outro. resolveMetaId continua sendo a rede de segurança
// final: um valor capturado errado só falha como "não encontrado", não
// aplica um filtro errado silenciosamente.
// "ninguém" (achado testando o lote de perguntas ao vivo — Img 8): "tickets
// que ainda não foram atendidos POR NINGUÉM" capturava operador: "ninguém"
// (um nome inventado), e o detector de negação via ("não" antes desse valor)
// concluía (errado) que era uma exclusão não suportada — a pergunta real é
// "sem operador" (isSemOperadorIntent, já suportado), só numa ordem de
// frase ("verbo + por ninguém") que esse detector ainda não cobria.
// "equipe" (achado ao vivo: "Quantos tickets a EQUIPE DE REDES tem?" e
// "...a equipe de Suporte TRATOU..." capturavam operador: "equipe de X"
// inteiro, porque extractAreaName passou a aceitar "equipe" como sinônimo de
// área mas essa lista de exclusão — compartilhada pelos padrões de
// operador/carga — nunca ganhou a mesma palavra, então os 2 padrões
// competiam pelo mesmo trecho da frase).
// "vencidos"/"atrasados"/"estourados" (achado ao vivo: "Quantos tickets
// VENCIDOS tem o departamento Suporte...?" capturava operador: "vencidos" —
// o padrão "quantos tickets <nome> tem" só verifica a PRIMEIRA palavra
// contra a exclusão, e esse adjetivo de SLA nunca tinha entrado na lista).
// "solicitante" (achado junto da consolidação de CLIENT_LOOKUP_NOUN_SOURCE):
// sem essa exclusão, "tickets do solicitante Carlos" capturava cliente:
// "Carlos" (certo, via extractClientName) E operador: "solicitante Carlos"
// (errado, via o fallback genérico "do/da X" abaixo, que não sabia que
// "solicitante" já tinha sido consumido por outro extrator) — os dois
// filtros brigando entre si zerava o resultado.
// "sla" (achado junto da ampliação do vocabulário de vencido, F5): "tickets
// fora do SLA" capturava operador: "SLA" pelo mesmo motivo de "prazo" acima
// (fallback genérico "do/da X" sem essa exclusão).
// "canal" (achado testando o lote de perguntas ao vivo): "tickets abertos
// PELO CANAL Telefone" capturava operador: "canal Telefone" — nenhuma tool
// filtra por canal hoje (só lista o catálogo via listar_canais_tickets),
// mas "canal" continua sendo uma palavra de domínio conhecida que não é
// nome de pessoa, mesma classe de "fornecedor"/"sistema" acima.
// "engano" (achado testando outro lote ao vivo): "Tickets fechados POR
// ENGANO esse mês" capturava operador: "engano" — mesma família de
// "favor"/"gentileza"/"último" acima (idioma de cortesia/discurso, não
// nome de pessoa).
// "nome" (achado junto): "Liste os tickets... PELO NOME do cliente"
// capturava operador: "nome" — pedido de ORDENAÇÃO alfabética (não
// suportado, dados sempre vêm ordenados por data), mas "nome" sozinho
// nunca é um nome de pessoa de verdade.
// "menor"/"maior" (achado junto): "ordenado DO MENOR pro maior" capturava
// operador: "menor pro maior" — vocabulário de ordenação de ranking (ver
// RANKING_CUE_SOURCE), não nome de pessoa.
// "dia\s+\d" (achado testando o lote de perguntas ao vivo): "a partir DO
// dia 10 de março" tem um "do" solto (de "a partir do"), que o padrão
// genérico "do/da X" (fallback de operador) casava, capturando "dia 10 de
// março" inteiro — sem nome nenhum antes da cláusula de data pra
// cleanFreeText podar (mesmo problema estrutural de "nesse ano" sozinho
// acima, resolvido aqui excluindo a origem em vez de tentar podar depois).
// "manha\b" (achado testando o lote de perguntas ao vivo): "Tickets
// fechados PELA MANHÃ de ontem." capturava operador: "manhã de" via o
// fallback genérico "pel[ao] X" — não há tool que filtre por horário do
// dia, então a cláusula é descartada (igual "canal"/"fornecedor" acima),
// não inventa um operador fantasma. "tarde\b"/"noite\b" entram pela mesma
// família (período do dia), mesmo sem ter sido testado ao vivo ainda.
// "(?![\p{L}\p{N}])" em vez de "\b" só pra essa alternativa (achado testando
// a própria correção acima): "manh[ãa]" pode terminar acentuado ("ã" é a
// ÚLTIMA letra, diferente de "área"/"página", onde o acento fica no meio) —
// \b do JS só reconhece [A-Za-z0-9_] como "palavra", então nunca fecha
// fronteira bem depois de um "ã", mesmo com espaço em seguida. Sem essa
// troca, a correção acima não bloquearia nada de verdade (lookahead sempre
// passava), já que esta fonte é usada dentro de `(?!...)` em todo lugar
// abaixo.
// "e-?mail\b|telefone\b|whatsapp\b|chat\b" (achado testando o lote de
// perguntas ao vivo): "Tickets abertos POR E-MAIL OU TELEFONE." vazava o
// canal (não só a palavra "canal", já excluída acima) pro fallback
// genérico "por X" — não há tool que filtre por canal hoje (mesmo motivo
// de "canal" acima), então a cláusula é descartada, não inventa um
// operador fantasma. Valores escolhidos à mão (igual "fornecedor"/
// "sistema" acima) porque o catálogo de canais vem de uma API dinâmica
// (/meta/channels), sem uma lista fixa no código pra reaproveitar aqui.
// Frases literais de status com 2+ palavras (mesmo vocabulário de
// STATUS_LITERAL_PATTERNS, acima — duplicado aqui de propósito: aquela lista
// casa contra texto NORMALIZADO, enquanto as exclusões de operador abaixo
// casam contra texto CRU, com acento/caixa variável) — achado testando o
// lote de perguntas ao vivo: "Qual o PIOR OPERADOR EM ATENDIMENTO esse
// mês?" perdia "pior" (já excluído), mas "em atendimento" (o status, já
// capturado certo à parte por extractLiteralStatus) vazava TAMBÉM pro
// operador ("operador: em atendimento"), nome-lixo que nunca bate no
// catálogo e ainda briga com o filtro de status já certo. Só as frases de
// 2+ palavras entram aqui — status de 1 palavra só (ex.: "cancelado") já
// têm cobertura própria mais abaixo nesta mesma lista.
const STATUS_LITERAL_PHRASE_SOURCE =
  "aguardando\\s+atendimento\\b"
  + "|n[ãa]o\\s+atendid[oa]s?\\b"
  + "|em\\s+andamento\\b|em\\s+atendimento\\b|em\\s+estudo\\b"
  + "|agendad[oa]s?\\s+com\\s+(?:o\\s+)?usu[áa]rio\\b"
  + "|aguardando\\s+feedback\\b"
  + "|indispon[íi]vel\\s+para\\s+atendimento\\b"
  + "|encaminhad[oa]s?\\s+para\\s+(?:o\\s+)?operador\\b"
  + "|interrompid[oa]s?\\s+para\\s+atender\\s+outro\\s+chamado\\b"
  + "|aguardando\\s+retorno\\s+do\\s+fornecedor\\b"
  + "|reservad[oa]s?\\s+para\\s+(?:o\\s+)?operador\\b"
  + "|aguardando\\s+aprova[çc][ãa]o\\b"
  + "|aguardando\\s+rdm\\b";

const OPERATOR_BY_EXCLUSION_SOURCE =
  "status\\b|prioridade\\b|[áa]rea\\b|categoria\\b|equipe\\b|setor\\b|departamento\\b|cliente\\b|solicitante\\b|operador\\b|p[áa]gina\\b|usu[áa]rio\\b"
  + "|fornecedor\\b|prazo\\b|sla\\b|canal\\b|e-?mail\\b|telefone\\b|whatsapp\\b|chat\\b"
  + "|favor\\b|gentileza\\b|[úu]ltimo\\b|[úu]ltima\\b|enquanto\\b|exemplo\\b|engano\\b|nome\\b|menor\\b|maior\\b"
  // "pior(es)"/"melhor(es)" (achado testando o lote de perguntas ao vivo):
  // "Mostra os tickets vencidos ordenados DO PIOR pro melhor." capturava
  // operador: "pior pro melhor" via o fallback genérico "do/da X" — mesma
  // classe de bug de "menor"/"maior" (já excluídos) só que no vocabulário
  // de ranking qualitativo, não quantitativo.
  + "|pior(?:es)?\\b|melhor(?:es)?\\b"
  + "|sistema\\b|m[êe]s\\b|ano\\b|semana\\b|per[íi]odo\\b|total\\b|limite\\b|ningu[ée]m\\b|dia\\s+\\d"
  + "|manh[ãa](?![\\p{L}\\p{N}])|tarde\\b|noite\\b"
  + "|vencid[oa]s?\\b|atrasad[oa]s?\\b|estourad[oa]s?\\b"
  + `|${STATUS_LITERAL_PHRASE_SOURCE}`;

const OPERATOR_DO_DA_EXCLUSION_SOURCE = OPERATOR_BY_EXCLUSION_SOURCE;

// Achado P5 da auditoria end-to-end: as variantes "por/pelo X" e "do/da X"
// (antes só na extração usada pelas tools de situação — aberto/fechado/
// congelado/vencido/mais-antigos/mais-recentes) não estavam ligadas a esta
// extração genérica, usada por listar_tickets e por qualquer pergunta de
// status arbitrário sem branch dedicado — confirmado ao vivo: "Mostre os
// tickets do João que estão aguardando atendimento" perdia o "João" por
// completo. Unificado aqui numa função só, em vez de manter 2 versões da
// mesma extração em paralelo (era exatamente esse tipo de duplicação que
// deixou o fix anterior — "do/da X" — cobrindo só uma das duas).
// Exclusão usada tanto aqui (padrão "quantos tickets <nome> tem", achado do
// bug de "Quantos tickets o Fábio Gali tem em aberto?" perder o operador)
// quanto em extractOperatorWorkloadName mais abaixo (mesma ideia, pra
// "carga do operador") — evita capturar "a área Suporte"/"o departamento
// Governança"/etc. como se fosse nome de operador. Reaproveita a mesma lista
// unificada de OPERATOR_BY_EXCLUSION_SOURCE (+ "responsável"/"atendente",
// que só fazem sentido aqui) em vez de manter uma terceira lista divergente
// — achado ao vivo testando a mesma classe de bug: "Quantos tickets o
// sistema/mês/fornecedor/usuário tem?" todos roteavam pra
// analisar_carga_operador com um "operador" inventado, porque essa lista
// nunca tinha ganhado as palavras já excluídas nas outras duas.
const OPERATOR_WORKLOAD_EXCLUSION_SOURCE =
  `${OPERATOR_BY_EXCLUSION_SOURCE}|respons[áa]vel\\b|atendente\\b`;

// "tratou"/"atendeu" (achado testando o lote de perguntas ao vivo — Img 13):
// "Quantos tickets o Fábio Moreira TRATOU...?" não capturava o operador,
// porque só "tem" fechava esse padrão — o nome inteiro se perdia, mesmo
// antes de qualquer problema de negação na cláusula seguinte.
// "fechou"/"fecharam" (achado testando o lote de perguntas ao vivo —
// Complexas 1, pergunta 18): "Quantos tickets o Helpdesk FECHOU no
// departamento X?" não capturava o operador (só tem/tratou/atendeu
// fechavam esse padrão) — o filtro de operador se perdia por completo, e a
// resposta mostrava o departamento inteiro, não só os tickets do Helpdesk.
const OPERATOR_WORKLOAD_VERB_SOURCE = "(?:tem|trat(?:ou|aram)|atend(?:eu|eram)|fech(?:ou|aram))";

export function extractOperatorName(value) {
  return extractByPatterns(value, [
    // "Resumo por operador NESSE ANO..." (achado testando o lote de
    // perguntas ao vivo): diferente dos padrões "por/pelo X" e "do/da X"
    // abaixo, este 1º padrão (ancorado em operador/usuário/responsável/
    // atendente/técnico) nunca tinha ganhado a exclusão de palavras de
    // domínio (OPERATOR_BY_EXCLUSION_SOURCE) nem das formas contraídas de
    // período relativo ("nesse"/"desse"/"essa"/...) — "operador" sem nome
    // nenhum depois, só uma cláusula de data, virava operador: "nesse ano"
    // (cleanFreeText não tem como podar, não sobra nada ANTES da cláusula
    // pra ancorar o corte de \s+ das TRAILING_*_CLAUSE_PATTERN).
    new RegExp(
      `\\b(?:${USER_LOOKUP_NOUN_SOURCE})\\s+`
        + `(?!(?:mais|menos)\\b)(?!${RANKING_CUE_SOURCE})(?!${CONTINUATION_MARKER_SOURCE}\\b)`
        + `(?!(?:n[oa]s?\\s+)?(?:d|n)?(?:ess[ae]|est[ae])\\s+(?:semana|m[êe]s|ano)\\b)`
        + `(?!${DIMENSION_CONNECTOR_LEAK_SOURCE})(?!${OPERATOR_BY_EXCLUSION_SOURCE})(.+)$`,
      "iu",
    ),
    new RegExp(`\\b(?:por|pel[ao])\\s+(?!${OPERATOR_BY_EXCLUSION_SOURCE})(.+)$`, "iu"),
    new RegExp(`\\bd[oa]\\s+(?!${OPERATOR_DO_DA_EXCLUSION_SOURCE})(.+)$`, "iu"),
    // "Quais os tickets de Vanessa Ventura?" (achado testando o lote de
    // perguntas ao vivo): "de" sem contração com artigo ("do"/"da") é tão
    // comum quanto elas na fala natural, mas só o padrão "do/da X" acima
    // existia — a pergunta inteira caía sem filtro nenhum, devolvendo a
    // listagem completa do sistema como se "de Vanessa Ventura" nunca
    // tivesse sido dito. Diferente do padrão "do/da" (que vale em qualquer
    // ponto da frase), este é ancorado logo depois do substantivo de ticket
    // — "de" sozinho é genérico demais pra soltar em qualquer lugar (bate
    // em "resumo DE tickets", "tickets DE hoje/ontem/março", datas ISO
    // etc.), então a mesma lista de exclusão de palavras de domínio
    // (OPERATOR_DO_DA_EXCLUSION_SOURCE) mais dia relativo/nome de mês/dígito
    // cobre os casos mais prováveis de falso positivo.
    new RegExp(
      `\\b${TICKET_NOUN_SOURCE}s?\\s+de\\s+`
        // "(?![\\p{L}\\p{N}])", não "\\b", depois de "amanh[ãa]" (achado
        // testando o lote de perguntas ao vivo): \b do JS nunca fecha
        // fronteira bem depois de um "ã" (não é [A-Za-z0-9_]), então
        // "Quantos tickets DE AMANHÃ existem?" nunca era excluído por essa
        // negative lookahead — "amanhã" virava operador fantasma.
        + `(?!hoje\\b)(?!ontem\\b)(?!amanh[ãa](?![\\p{L}\\p{N}]))(?!\\d)(?!(?:${MONTH_NAME_SOURCE})\\b)`
        // "alta"/"baixa"/"media" + "prioridade" (achado testando o lote de
        // perguntas ao vivo): "tickets DE ALTA PRIORIDADE" tem "prioridade"
        // como a 2ª palavra, não a 1ª — a exclusão de OPERATOR_DO_DA_
        // EXCLUSION_SOURCE só bloqueia quando "prioridade" vem logo depois
        // de "de", então "alta prioridade" inteiro escapava e virava um
        // operador fantasma (junto do prioridade:"alta" já resolvido certo
        // por extractPriorityName, os 2 filtros brigavam entre si).
        + `(?!(?:baixa|media|alta)\\s+prioridade\\b)`
        + `(?!${OPERATOR_DO_DA_EXCLUSION_SOURCE})(.+)$`,
      "iu",
    ),
    // "Quantos tickets o Fábio Gali tem em aberto?" (achado testando o
    // lote de perguntas ao vivo): mesmo padrão de extractOperatorWorkloadName
    // ("quantos tickets <nome> tem"), mas SEM exigir que "tem" feche a
    // frase — aqui o resultado só alimenta o filtro genérico de operador
    // (combinado com o resto da pergunta já resolvido, ex. "em aberto"),
    // não força a rota de carga (que perderia os outros filtros) como
    // extractOperatorWorkloadName faz.
    // "(?:a\\s+|o\\s+|cada\\s+)?" na negação (achado testando o lote de
    // perguntas ao vivo): "Quantos tickets CADA OPERADOR tem?" não tinha
    // "cada" como prefixo reconhecido antes da palavra excluída — só "a "/
    // "o " eram previstos — então "cada operador" passava inteiro pela
    // negação e virava operador: "cada operador" (nome-lixo, nunca bate
    // com nenhum operador real).
    // "(?!${OPEN_STATE_ADJECTIVE_SOURCE}...)" (achado testando o lote de
    // perguntas ao vivo): "Quantos tickets ABERTOS E FECHADOS tem o Fabio
    // Gali?" — aqui quem "tem" vem DEPOIS do verbo, não antes (inversão de
    // sujeito, comum em pergunta), então o `(.+?)` não-guloso capturava a
    // única coisa que sobrava ANTES do único "tem" da frase: "abertos e
    // fechados" (situação, não nome) — virava operador: "abertos e"
    // (cleanFreeText ainda poda o "fechados" via verbo de fechamento,
    // sobrando esse resto). Bloqueia a captura quando o que vem logo depois
    // é só um estado aberto/fechado (sozinho ou com "e" entre 2 estados) —
    // nenhum nome de operador real é literalmente "aberto"/"fechado".
    new RegExp(
      `\\bquantos\\s+(?:tickets?|chamados?|atendimentos?)\\s+`
        + `(?!(?:a\\s+|o\\s+|cada\\s+)?(?:${OPERATOR_WORKLOAD_EXCLUSION_SOURCE}))`
        + `(?!(?:${OPEN_STATE_ADJECTIVE_SOURCE}|${CLOSURE_VERB_SOURCE})(?:\\s+e\\s+(?:${OPEN_STATE_ADJECTIVE_SOURCE}|${CLOSURE_VERB_SOURCE}))?\\s+${OPERATOR_WORKLOAD_VERB_SOURCE}\\b)`
        + `(?:a\\s+|o\\s+)?(.+?)\\s+${OPERATOR_WORKLOAD_VERB_SOURCE}\\b.*$`,
      "iu",
    ),
    // "Quantos tickets abertos e fechados TEM o Fabio Gali?" (achado
    // testando o lote de perguntas ao vivo, continuação da correção acima):
    // bloquear a captura errada ("abertos e") não bastava sozinho — o nome
    // de verdade, que vem DEPOIS de "tem" (sujeito invertido), nunca era
    // capturado em lugar nenhum. Âncora estreita de propósito: exige
    // MAIÚSCULA (NOME_PROPRIO_SOURCE, heurística de nome próprio) logo
    // depois de "tem", pra não arriscar capturar qualquer coisa solta
    // depois de um "tem" genérico (palavra comuníssima em outros contextos,
    // ex.: "tem na fila").
    new RegExp(
      `\\b(?:${OPEN_STATE_ADJECTIVE_SOURCE}|${CLOSURE_VERB_SOURCE})(?:\\s+e\\s+(?:${OPEN_STATE_ADJECTIVE_SOURCE}|${CLOSURE_VERB_SOURCE}))?`
        + `\\s+tem\\s+(?:o\\s+|a\\s+)?(${NOME_PROPRIO_SOURCE})\\b`,
      "u",
    ),
    // "os tickets QUE o Fábio Gali tratou/atendeu/fechou" (achado testando o
    // lote de perguntas ao vivo): mesma ideia de "que X abriu" já aceita
    // por extractClientName, só do lado do operador — quem ABRE um ticket é
    // o cliente, mas quem TRATA/ATENDE/FECHA é o operador. Sem este padrão,
    // "Mostra os tickets que o Fábio Gali tratou." não capturava operador
    // nenhum, caindo no fallback genérico sem filtro algum.
    new RegExp(`\\bque\\s+(?:o\\s+|a\\s+)?(.+?)\\s+${OPERATOR_WORKLOAD_VERB_SOURCE}\\b`, "iu"),
    // "excluindo o Fábio"/"tirando a Ana"/"exceto o Carlos" (achado testando
    // o lote de perguntas ao vivo): "Qual operador tem a maior carga de
    // trabalho na área de TI, EXCLUINDO O FÁBIO?" não capturava operador
    // nenhum (nenhum padrão acima exige a palavra "operador" antes do nome),
    // então a exclusão era descartada em silêncio em vez de recusada por
    // detectaNegacaoNaoSuportada (que só reage a uma negação encontrada
    // perto de um valor JÁ capturado). Exige que o nome comece com letra
    // maiúscula (heurística de nome próprio) pra não capturar valores de
    // catálogo em minúsculo de outra dimensão (ex.: "excluindo os
    // cancelados" não bate aqui — "cancelados" é minúsculo). Não precisa de
    // exclusão própria de palavras de domínio: catálogo (status/prioridade/
    // etc.) é sempre pedido em minúsculo nas perguntas reais, então o filtro
    // de maiúscula já é suficiente.
    new RegExp(
      `\\b${NEGATION_MARKER_SOURCE}\\s+(?:o\\s+|a\\s+)?(\\p{Lu}[\\p{L}'-]*(?:\\s+\\p{Lu}[\\p{L}'-]*)*)`,
      "u",
    ),
  ]);
}

// "mostrando o cliente responsável" (achado testando o lote de perguntas ao
// vivo): "responsável" logo depois de "cliente" é descrição genérica (pedido
// pra incluir a coluna do cliente no resultado), não um nome de cliente de
// verdade — sem essa exclusão virava filtro cliente:"responsável", que nunca
// bate por substring com nenhum contact_name real (resultado some em
// silêncio, "nenhum ticket encontrado").
// "Tickets com o e-mail renato.ferreira@inpe.br." (achado testando o lote
// de perguntas ao vivo): e-mail como contact_name é um padrão REAL nos
// dados (vários clientes só existem como "nome.sobrenome@inpe.br", ver
// resumo_tickets_por_cliente) — sem este caso, o endereço inteiro era
// descartado em silêncio e a pergunta caía num listar_tickets SEM FILTRO
// NENHUM, devolvendo a base inteira como se fosse a resposta certa.
const EMAIL_CLIENTE_PATTERN =
  /\be-?mails?\s+(?:d[oe]\s+)?(?:cliente\s+)?([\w.+-]+@[\w.-]+\.[a-z]{2,})\b/iu;

// "Tickets do cliente renato.ferreira@inpe.br." (achado testando o lote de
// perguntas ao vivo, com dados reais): mesmo dado real do padrão acima, mas
// sem a palavra "e-mail" antes — só "cliente"/"solicitante" direto seguido
// do endereço. EMAIL_CLIENTE_PATTERN não dispara (exige "e-mail"/"email"
// explícito) e DOTTED_CLIENTE_PATTERN (abaixo) não reconhece "@" (só
// "\w+(?:\.\w+)+"), então o endereço batia só até o "@" e perdia o domínio
// inteiro (cliente: "renato.ferreira" em vez de "renato.ferreira@inpe.br")
// — por sorte o substring ainda batia só nesse contato nos dados reais,
// mas o filtro ficava ambíguo/errado em geral (poderia colidir com outro
// contato cujo prefixo batesse no mesmo substring).
const CLIENTE_EMAIL_PATTERN = new RegExp(
  `\\b${CLIENT_LOOKUP_NOUN_SOURCE}\\s+([\\w.+-]+@[\\w.-]+\\.[a-z]{2,})\\b`,
  "iu",
);

// "Tickets do cliente fabio.gali." (achado testando o lote de perguntas ao
// vivo, com dados reais): variante do mesmo problema do e-mail acima, mas
// sem "@" — vários clientes reais existem só como "nome.sobrenome" (sem
// domínio, ver resumo_tickets_por_cliente), e cleanFreeText cortava no
// primeiro "." do mesmo jeito, virando cliente: "fabio" — pior que só
// perder o ".gali": "fabio" sozinho é bem mais ambíguo (bate em muito mais
// gente) do que "fabio.gali" bateria. Só dispara logo depois da palavra
// "cliente"/"solicitante" — um token com ponto solto em qualquer outro
// lugar da frase não é necessariamente um nome, então não arrisca nesse
// caso mais genérico.
const DOTTED_CLIENTE_PATTERN = new RegExp(
  `\\b${CLIENT_LOOKUP_NOUN_SOURCE}\\s+(\\w+(?:\\.\\w+)+)\\b`,
  "iu",
);

export function extractClientName(value) {
  const text = String(value ?? "");

  // Checado ANTES de extractByPatterns/cleanFreeText de propósito:
  // cleanFreeText trunca o valor capturado no primeiro "." (ver
  // `.split(/[,.!?;:]/u, 1)[0]` no topo da função), o que cortaria
  // "renato.ferreira@inpe.br" em só "renato" — o endereço é devolvido
  // direto daqui, sem passar por essa limpeza genérica (não precisa:
  // o próprio regex já delimita exatamente o token do e-mail, sem
  // nenhuma cauda pra podar).
  const emailMatch = text.match(EMAIL_CLIENTE_PATTERN);

  if (emailMatch) {
    return emailMatch[1];
  }

  const clienteEmailMatch = text.match(CLIENTE_EMAIL_PATTERN);

  if (clienteEmailMatch) {
    return clienteEmailMatch[1];
  }

  const dottedMatch = text.match(DOTTED_CLIENTE_PATTERN);

  if (dottedMatch) {
    return dottedMatch[1];
  }

  return extractByPatterns(text, [
    // "(?!${DIMENSION_CONNECTOR_LEAK_SOURCE})" e "(?!${UNSET_VALUE_ADJECTIVE_
    // SOURCE}\\b)" (achado testando o lote de perguntas ao vivo): mesmos 2
    // bugs já corrigidos pra área/operador/departamento (conector "e por X"
    // vazando) e pra prioridade/área ("sem X definido" virando nome
    // literal) — faltavam aqui. "Tickets SEM CLIENTE DEFINIDO." virava
    // cliente: "definido"; "Resumo por cliente E POR OPERADOR." virava
    // cliente: "e por operador".
    // "(?:é\\s+)?" logo antes da captura (achado testando o lote de
    // perguntas ao vivo, com dados reais): "Tickets CUJO CLIENTE É Vanessa
    // Ventura..." tem o verbo "é" entre a palavra "cliente" e o nome de
    // verdade — sem pular esse verbo, ele virava parte do nome capturado
    // (cliente: "é Vanessa Ventura"). Só o "é" ACENTUADO entra aqui — "e"
    // sem acento é a CONJUNÇÃO já tratada por DIMENSION_CONNECTOR_LEAK_
    // SOURCE logo abaixo ("cliente E POR operador"), que depende do "e"
    // continuar colado à cláusula pra ser reconhecida; aceitar "e" aqui
    // também destruiria essa detecção (consumiria o "e" antes do lookahead
    // enxergar a cláusula inteira).
    new RegExp(
      `\\b${CLIENT_LOOKUP_NOUN_SOURCE}\\s+(?:chamado\\s+|de\\s+nome\\s+)?(?:é\\s+)?`
        + `(?!(?:mais|menos|respons[áa]vel)\\b)(?!${RANKING_CUE_SOURCE})(?!${CONTINUATION_MARKER_SOURCE}\\b)`
        + `(?!${DIMENSION_CONNECTOR_LEAK_SOURCE})(?!${UNSET_VALUE_ADJECTIVE_SOURCE}\\b)(.+)$`,
      "iu",
    ),
    // "ticket QUE A/O <nome> abriu" (achado testando o lote de perguntas ao
    // vivo — Img 12): quem abre um ticket é o cliente/contato, não precisa
    // da palavra "cliente" explícita — "que" como âncora evita capturar
    // qualquer "X abriu" solto fora desse contexto bem específico.
    // CLIENT_ACTIVITY_VERB_SOURCE (não só "abriu" literal), achado testando
    // o lote de perguntas ao vivo: "Tickets que a Ana e o Bruno ABRIRAM
    // essa semana." (plural, igual já aceito nos outros 2 padrões acima
    // deste mesmo extrator) não capturava cliente nenhum — "abriu" sozinho
    // só cobria o singular, perdendo o filtro (e a checagem de união com
    // "e", mais abaixo em routeTicketQuestionCore) por completo.
    new RegExp(
      `\\bque\\s+(?:o\\s+|a\\s+)?(?!(?:mais|menos)\\b)(.+?)\\s+${CLIENT_ACTIVITY_VERB_SOURCE}\\b`,
      "iu",
    ),
    // "Quantos tickets o Carlos e a Ana abriram juntos?" (achado testando o
    // lote de perguntas ao vivo): mesma ideia do padrão "que X abriu"
    // acima, mas SEM a palavra "que" — "quantos tickets <sujeito> abriu/
    // abriram" também identifica quem abre como cliente/contato, igual o
    // padrão irmão "quantos tickets <nome> tem" já aceito pra carga de
    // operador (ver extractOperatorWorkloadName). Sem este padrão, a frase
    // não batia em NENHUM extrator (nem este, nem o de "que X abriu" acima,
    // que exige a palavra "que"), e a união de 2 nomes ("Carlos e a Ana")
    // nunca chegava a ser capturada pra a checagem de união (mais abaixo em
    // routeTicketQuestionCore) perceber o problema — a pergunta caía direto
    // no fallback de listagem sem filtro nenhum, com os 2 nomes perdidos em
    // silêncio.
    new RegExp(
      `\\bquantos\\s+(?:tickets?|chamados?|atendimentos?)\\s+(?:o\\s+|a\\s+)?(.+?)\\s+${CLIENT_ACTIVITY_VERB_SOURCE}\\b`,
      "iu",
    ),
  ]);
}

// Achado testando o lote de perguntas ao vivo: "Quantos tickets o cliente
// Daniel Guimarães DO LAGO tem?" capturava cliente: "Daniel Guimarães do
// Lago" (certo, via extractClientName) E operador: "Lago" (inventado), porque
// o fallback genérico "do/da X" de extractOperatorName roda sobre a frase
// inteira sem saber que "do Lago" já é parte do nome do cliente capturado
// por outro extrator — resultado: listar_tickets falhava tudo com "operador
// 'Lago' não encontrado", ignorando o cliente (certo) que tinha sido
// encontrado. Mesmo problema com qualquer nome de cliente/usuário que tenha
// "do"/"da" no meio (ex.: "Rogerio Da Silva E Souza", do catálogo real).
// Heurística: se o valor capturado como operador é, ele mesmo, um trecho
// contido dentro do valor capturado como cliente, é sinal de que os dois
// vieram do mesmo pedaço de texto (o do cliente) — descarta o operador
// fantasma em vez de deixar os 2 filtros brigarem. Não suprime um operador
// genuinamente independente (ex.: "tickets do cliente Ana do operador
// Rodrigo" já fecha o nome do cliente em "Ana" antes de chegar em "operador
// Rodrigo", então "Rodrigo" não é um trecho de "Ana").
export function isOperadorContidoNoCliente(operador, cliente) {
  if (operador === undefined || cliente === undefined) {
    return false;
  }

  return normalizeText(cliente).includes(normalizeText(operador));
}

// "O cliente X abre muito(s) chamado(s)/ticket(s)?" / "...tem muitos
// tickets?" / "...está com muitos chamados?" (achado testando o lote de
// perguntas ao vivo — Img 7): a tool analisar_atividade_cliente já existia
// (Img 33, versão de comparação entre 2 clientes), mas não tinha rota pra
// UM cliente só, apesar da própria descrição da tool citar esse exemplo de
// pergunta. Exige a palavra "cliente" explícita, mesma cautela de
// extractClientComparisonNames — cliente não tem catálogo/resolveMetaId
// próprio (só substring contra o contact_name real), então um nome
// capturado errado não falha graciosamente como "não encontrado" sozinho.
export function extractClientActivityName(value) {
  return extractByPatterns(value, [
    /^(?:o\s+|a\s+)?cliente\s+(.+?)\s+(?:esta|está|estao|estão)\s+com\s+muito[s]?\s+(?:ticket|chamado|atendimento)/iu,
    /^(?:o\s+|a\s+)?cliente\s+(.+?)\s+tem\s+muito[s]?\s+(?:ticket|chamado|atendimento)/iu,
    new RegExp(
      `^(?:o\\s+|a\\s+)?cliente\\s+(.+?)\\s+${CLIENT_ACTIVITY_VERB_SOURCE}\\s+muito[s]?\\s+(?:ticket|chamado|atendimento)`,
      "iu",
    ),
    // "Analise a atividade do cliente X" (achado testando o lote de
    // perguntas ao vivo): frase natural usando a própria palavra da tool
    // ("atividade"), sem exigir "tem/está com muitos tickets" — ao
    // contrário dos 3 padrões acima, não é anchored no início da frase
    // ("analise"/"qual é" etc. podem vir antes).
    /\batividade\s+(?:d[oa]\s+)?cliente\s+(.+)$/iu,
  ]);
}

// Marcadores de negação não suportada ("diferente de"/"não"/"exceto"/
// "tirando"/"sem contar") — module-level (não só dentro de
// routeTicketQuestionCore, onde foi criada originalmente) porque
// extractTicketStatusName logo abaixo também precisa dela: "status
// DIFERENTE DE Encerrada" sem essa exclusão capturava "diferente de" (ou só
// "não", no caso de "status NÃO Encerrada") como se fosse valor de catálogo
// — a intenção de aberto/fechado já era resolvida certo em outro lugar
// (isNegatedClosed, binário, sem ambiguidade), mas esse valor-lixo
// continuava sobrando em entities.status, quebrando a consulta com um
// "status 'diferente de' não encontrado" mesmo a tool certa já tendo sido
// escolhida. "n[ãa]o" (não só "nao") de propósito, mesmo motivo do acento
// tolerante em TICKET_NOUN_SOURCE acima: contra texto cru, "não" mantém o
// til — sem essa tolerância, "status NÃO Encerrada" ainda vazava "não" (com
// acento) como valor de status, já que "nao" sem acento nunca batia.
// "excluindo" (achado testando o lote de perguntas ao vivo): mesma família
// de "tirando"/"sem contar" — sem essa entrada, "excluindo os cancelados"
// não era reconhecido como negação, e "cancelados" virava filtro POSITIVO
// (o oposto exato do pedido), a mesma classe de inversão silenciosa que
// "tirando"/"sem contar" já foram corrigidos pra evitar.
// "tira"/"tire" (achado testando continuação ao vivo — "e desses, tira os
// cancelados"): forma imperativa/presente de "tirar", tão comum na fala
// quanto o gerúndio "tirando" (já coberto) — mesma classe de verbo informal
// vs. formal já tratada em write-policy.js pros verbos de escrita.
// "menos" + artigo (achado testando o lote de perguntas ao vivo): "Tickets
// com prioridade alta, MENOS OS CANCELADOS." usa "menos" como "exceto"
// (idioma coloquial comum), mas "cancelados" virava filtro POSITIVO (o
// oposto do pedido) porque "menos" sozinho nunca entrou nesta lista — só
// exigindo um artigo plural/singular logo depois ("o/a/os/as"), pra não
// colidir com os outros 2 sentidos já existentes de "menos" no roteador:
// ranking ascendente (ordemRanking, "operador com MENOS tickets") e limiar
// numérico ("MENOS de 30 dias") — nenhum dos dois tem um artigo colado bem
// depois de "menos".
// "sem" SOZINHO, não só "sem contar" (achado testando o lote de perguntas
// ao vivo): "Mostra os tickets abertos da área de Suporte, MAS SEM OS
// CONGELADOS." usava "sem" sem o "contar" — isCongeladoIntent reagia só à
// palavra "congelado" solta, e como "sem" sozinho não era marcador de
// negação reconhecido, a pergunta inteira roteava pro OPOSTO exato do
// pedido (listar só os congelados, em vez de excluí-los). Seguro
// adicionar aqui: os únicos 2 usos de "sem X" que SÃO estado (não
// exclusão) — "sem operador/responsável/atendente" e "sem prioridade
// definida" — já são resolvidos antes de chegar em detectaNegacaoNaoSuportada
// (isSemOperadorIntent tem guard próprio que pula essa função inteira;
// "sem prioridade X" citando um nível real já retorna true direto, sem
// depender desta fonte).
// "ignorando"/"ignore"/"ignora" (achado testando o lote de perguntas ao
// vivo): mesma família de "tirando"/"excluindo"/"sem contar" — "Quantos
// tickets existem no total, IGNORANDO os cancelados?" não batia em nenhum
// marcador reconhecido, e "cancelados" virava filtro POSITIVO (o oposto
// exato do pedido), a mesma classe de inversão silenciosa já corrigida
// várias vezes pros outros sinônimos de exclusão.
const NEGATION_MARKER_SOURCE =
  "(?:n[ãa]o|excet[oa]|diferentes?\\s+de|tirando|tira|tire|sem|excluindo|ignorando|ignor[ae]"
  // "fora da área X"/"fora do departamento X" (achado testando o lote de
  // perguntas ao vivo): "Tickets FORA DA ÁREA de Suporte." capturava area:
  // "Suporte" como filtro POSITIVO — sentido exatamente invertido ("fora
  // de" exclui, não inclui). Exige a palavra de dimensão logo depois de
  // "fora d[ao]" (não só "fora" solto) pra não colidir com "fora do prazo"/
  // "fora do SLA" (OLDEST_PROXY_STATE_SOURCE), que é um sentido totalmente
  // diferente (vencido) e não uma negação de catálogo.
  + `|fora\\s+d[ao]\\s+(?:${AREA_SYNONYM_SOURCE}|departamento|operador|${CLIENT_LOOKUP_NOUN_SOURCE}|status|prioridade)`
  + "|menos\\s+(?:o|a|os|as)\\b)";

export function extractTicketStatusName(value) {
  return extractByPatterns(value, [
    // "(?!e\\s+por\\b)" (achado testando o lote de perguntas ao vivo):
    // "Resumo POR STATUS e por área." usa "status" só como CONECTOR de
    // resumo (a dimensão real pedida é outra, mencionada depois), não como
    // valor de catálogo — sem essa exclusão, "e por área" inteiro virava
    // status: "e por área" (nunca resolve no catálogo real), mesmo a rota
    // certa (resumo_por_area) já tendo sido escolhida em outro lugar.
    new RegExp(
      `\\bstatus\\s+(?:de\\s+)?(?!${DIMENSION_CONNECTOR_LEAK_SOURCE})(?!${NEGATION_MARKER_SOURCE}\\b)(?!${RANKING_CUE_SOURCE})(?!${CONTINUATION_MARKER_SOURCE}\\b)(.+)$`,
      "iu",
    ),
  ]);
}

// Conectores usados pra pedir busca textual (grep no assunto/descrição do
// ticket): "tickets sobre impressora", "chamados relacionados a rede",
// "chamados que falam de VPN".
const SEARCH_TEXT_CONNECTOR_SOURCE =
  "sobre|relacionad[oa]s?\\s+(?:a|com)|mencionando|mencion(?:a|am|e|em|ar)|contendo|falando\\s+(?:de|sobre)|que\\s+fal(?:a|am|e)\\s+(?:de|sobre)";

// Depois que os outros recortes de cleanFreeText comem a frase inteira
// (status/área/operador/data/etc.), pode sobrar só a palavra genérica do
// domínio ("tickets"/"chamados"/...) — não é um termo de busca de verdade,
// só o resíduo de "sobre OS TICKETS abertos pela Fulana" (achado testando o
// lote de perguntas ao vivo — Lote extra 1, pergunta 21): "sobre" sozinho
// sequestrava a intenção pra busca textual mesmo quando a frase já tinha
// filtros reais (operador/situação), e o texto residual virava "tickets",
// que nunca bate em nenhuma descrição real — resultado sempre vazio.
const BARE_TICKET_NOUN_PATTERN = new RegExp(`^${TICKET_CONTEXT_SOURCE}$`, "iu");

export function extractSearchText(value) {
  const texto = extractByPatterns(value, [
    new RegExp(`\\b(?:${SEARCH_TEXT_CONNECTOR_SOURCE})\\s+(.+)$`, "iu"),
  ]);

  if (texto !== undefined && BARE_TICKET_NOUN_PATTERN.test(normalizeText(texto))) {
    return undefined;
  }

  return texto;
}

// Nomes de status reais do sistema (confirmados ao vivo via
// listar_status_tickets) reconhecidos sem exigir a palavra "status" na
// frase — é assim que gestores perguntam ("liste os cancelados", "tem
// ticket aguardando aprovação?"). "Fechado"/"encerrado" ficam de fora
// deliberadamente: já são tratados à parte via situação (closure_date, mais
// confiável que confiar no nome do status). "TODOS" é um status-meta da
// API (não corresponde a tickets reais), por isso também fica de fora.
const STATUS_LITERAL_PATTERNS = [
  [/\baguardando\s+atendimento\b/, "Aguardando atendimento"],
  // "ainda não foram atendidos"/"não atendidos" (achado testando o lote de
  // perguntas ao vivo): jeito comum de pedir "aguardando atendimento" sem
  // usar esse nome literal — sem isso, "Tickets urgentes que ainda não
  // foram atendidos." perdia a cláusula inteira e listava TODOS os urgentes
  // (inclusive já ENCERRADOS, o oposto do que foi pedido).
  [/\b(?:ainda\s+)?nao\s+(?:foi|foram|esta\s+sendo|estao\s+sendo)\s+atendid[oa]s?\b/, "Aguardando atendimento"],
  [/\bnao\s+atendid[oa]s?\b/, "Aguardando atendimento"],
  [/\bem\s+andamento\b/, "Em atendimento"],
  [/\bem\s+atendimento\b/, "Em atendimento"],
  [/\bem\s+estudo\b/, "Em estudo"],
  [/\bagendad[oa]s?\s+com\s+(?:o\s+)?usuario\b/, "Agendado com o usuário"],
  [/\bcancelad[oa]s?\b/, "Cancelado"],
  [/\baguardando\s+feedback(?:\s+do\s+usuario)?\b/, "Aguardando feedback do usuário"],
  [/\bindisponivel\s+para\s+atendimento\b/, "Indisponível para atendimento"],
  [/\bencaminhad[oa]s?\s+para\s+(?:o\s+)?operador\b/, "Encaminhado para operador"],
  [/\binterrompid[oa]s?\s+para\s+atender\s+outro\s+chamado\b/, "Interrompido para atender outro chamado"],
  [/\baguardando\s+retorno\s+do\s+fornecedor\b/, "Aguardando retorno do fornecedor"],
  [/\bcom\s+backup\b/, "Com backup"],
  [/\breservad[oa]s?\s+para\s+(?:o\s+)?operador\b/, "Reservado para operador"],
  [/\baguardando\s+aprovacao\b/, "Aguardando aprovação"],
  [/\baguardando\s+rdm\b/, "Aguardando RDM"],
];

export function extractLiteralStatus(text) {
  for (const [pattern, nome] of STATUS_LITERAL_PATTERNS) {
    if (pattern.test(text)) {
      return nome;
    }
  }

  return undefined;
}

// "baixa/média/alta prioridade" (forma "adjetivo antes do substantivo") —
// só usado pra detectar CONTRADIÇÃO (achado P6 da auditoria end-to-end, ex.:
// "tickets urgentes de baixa prioridade"), nunca pra definir o filtro de
// prioridade sozinho: "baixa"/"média"/"alta" soltas continuam de propósito
// fora de extractPriorityIntent (adjetivos comuns demais, ver comentário
// abaixo) — aqui só entram quando acompanhadas da palavra "prioridade".
// Nível em qualquer ordem natural do português ("alta prioridade" OU
// "prioridade alta", igualmente comuns) — achado testando o lote de
// perguntas ao vivo: só a 1ª ordem (nível antes do substantivo) era
// reconhecida nos 2 grupos de padrão abaixo; "tickets urgentes ou de
// prioridade alta" (substantivo antes do nível) não disparava nem união
// nem contradição nenhuma, e "alta e urgentes"/"alta ou urgentes" inteiro
// vazava como se fosse 1 valor de prioridade só (nunca resolve no catálogo
// real, ou pior, resolve errado por acaso).
function priorityLevelSource(nivel) {
  return `(?:${nivel}\\s+prioridade|prioridade\\s+${nivel})`;
}

const PRIORITY_LEVEL_LITERAL_PATTERNS = [
  [new RegExp(`\\b${priorityLevelSource("baixa")}\\b`), "Baixa"],
  [new RegExp(`\\b${priorityLevelSource("media")}\\b`), "Media"],
  [new RegExp(`\\b${priorityLevelSource("alta")}\\b`), "Alta"],
];

// Achado testando o lote de perguntas ao vivo: "tickets urgentes E de alta
// prioridade" batia na mesma checagem de PRIORITY_LEVEL_LITERAL_PATTERNS
// acima (2 níveis diferentes na mesma frase) e levava a mesma mensagem de
// "contradição" de "tickets urgentes DE baixa prioridade" — mas os dois
// casos não são iguais: com "de", o segundo nível modifica o MESMO ticket
// (contradição de verdade, impossível). Com "e"/"ou", a frase pede a UNIÃO
// de 2 categorias (tickets urgentes + tickets de alta prioridade), não
// descreve 1 ticket com 2 prioridades. Esses padrões (com conector "e"/"ou"
// de qualquer lado) identificam esse segundo caso pra dar uma mensagem que
// explica a limitação real (só filtra 1 prioridade por consulta), em vez
// de dizer que o pedido é logicamente impossível quando não é. "ou" entra
// ao lado de "e" pelo mesmo motivo (achado testando o lote de perguntas ao
// vivo: "urgentes OU de prioridade alta" não disparava nada, só "e" tinha
// suporte). "urgente" ganha entrada própria (não tem a forma "<nível>
// prioridade", é uma palavra solta) pareada com qualquer um dos outros 3
// níveis via conector, nos 2 lados possíveis.
const PRIORITY_UNIAO_CONNECTOR_SOURCE = "(?:e|ou)";

const PRIORITY_LEVEL_UNIAO_PATTERNS = [
  [
    new RegExp(
      `\\b${PRIORITY_UNIAO_CONNECTOR_SOURCE}\\s+(?:de\\s+)?${priorityLevelSource("baixa")}\\b`
        + `|\\b${priorityLevelSource("baixa")}\\s+${PRIORITY_UNIAO_CONNECTOR_SOURCE}\\b`,
    ),
    "Baixa",
  ],
  [
    new RegExp(
      `\\b${PRIORITY_UNIAO_CONNECTOR_SOURCE}\\s+(?:de\\s+)?${priorityLevelSource("media")}\\b`
        + `|\\b${priorityLevelSource("media")}\\s+${PRIORITY_UNIAO_CONNECTOR_SOURCE}\\b`,
    ),
    "Media",
  ],
  [
    new RegExp(
      `\\b${PRIORITY_UNIAO_CONNECTOR_SOURCE}\\s+(?:de\\s+)?${priorityLevelSource("alta")}\\b`
        + `|\\b${priorityLevelSource("alta")}\\s+${PRIORITY_UNIAO_CONNECTOR_SOURCE}\\b`,
    ),
    "Alta",
  ],
  [
    new RegExp(
      `\\burgentes?\\s+${PRIORITY_UNIAO_CONNECTOR_SOURCE}\\s+(?:de\\s+)?`
        + `(?:${priorityLevelSource("baixa")}|${priorityLevelSource("media")}|${priorityLevelSource("alta")})\\b`
        + `|\\b(?:${priorityLevelSource("baixa")}|${priorityLevelSource("media")}|${priorityLevelSource("alta")})`
        + `\\s+${PRIORITY_UNIAO_CONNECTOR_SOURCE}\\s+urgentes?\\b`,
    ),
    "Urgente",
  ],
];

// "Tickets com prioridade Urgente ou Alta." (achado testando o lote de
// perguntas ao vivo): forma COMPACTA de união, com um nível de cada lado do
// conector "e"/"ou" e a palavra "prioridade" dita só 1 vez — testado contra
// o VALOR JÁ CAPTURADO por extractPriorityName (normalizado), não contra a
// frase inteira, por isso não reaproveita priorityLevelSource (que exige a
// palavra "prioridade" adjacente a cada nível).
const PRIORIDADE_NIVEL_PLANO_SOURCE = "(?:baixa|media|alta|urgentes?)";
const PRIORIDADE_UNIAO_COMPACTA_PATTERN = new RegExp(
  `^${PRIORIDADE_NIVEL_PLANO_SOURCE}\\s+(?:e|ou)\\s+(?:de\\s+)?${PRIORIDADE_NIVEL_PLANO_SOURCE}\\b`,
);

// Achado testando o lote de perguntas ao vivo — Complexas 1, pergunta 14:
// "sem prioridade DEFINIDA" não é um nome de prioridade de verdade, é um
// jeito de perguntar se o campo está vazio — mas a captura (.+) gananciosa
// pegava "definida existem" como se fosse um valor real, fazendo o guard de
// negação (mais abaixo) disparar achando que era "sem prioridade Alta" (uma
// EXCLUSÃO de valor, não suportada) e devolvendo um esclarecimento errado. A
// pergunta certa (prioridade sempre preenchida nos dados reais — 0 tickets
// bateriam esse filtro) nem chega a ser uma exclusão.
// Nome genérico (não só "PRIORITY_"): reaproveitado também por extractAreaName
// (achado testando o lote de perguntas ao vivo) — "Quantos tickets SEM ÁREA
// DEFINIDA existem?" tinha o mesmo bug (area: "definida"), mesmo vocabulário
// de adjetivo "vazio" se aplicando a qualquer dimensão, não só prioridade.
const UNSET_VALUE_ADJECTIVE_SOURCE = "(?:definid|atribu[ií]d|informad|especificad)[ao]s?";

export function extractPriorityName(value) {
  return extractByPatterns(value, [
    // "(?!e\\s+por\\b)" (mesmo achado de extractTicketStatusName, achado
    // testando o lote de perguntas ao vivo): "Resumo por prioridade E POR
    // ÁREA." usa "prioridade" só como conector, não valor — sem essa
    // exclusão, "e por área" inteiro virava prioridade: "e por área".
    // "(?!(?:n[ao]\\s+)?(?:AREA_SYNONYM|departamento)\\b)" (achado testando
    // o lote de perguntas ao vivo, com dados reais): "Resumo dos tickets
    // POR PRIORIDADE na área Suporte..." usa "prioridade" como conector
    // BARE (sem nenhum nível dito), seguido do filtro de OUTRA dimensão
    // ("na área Suporte") — sem essa exclusão, "na área Suporte" inteiro
    // virava prioridade: "na área Suporte" (nome-lixo, nunca bate com
    // nenhuma prioridade real), e esse valor não-undefined escapava
    // silencioso porque o branch de resumo_por_prioridade descartava a
    // própria prioridade capturada de qualquer forma — só virou visível
    // depois que esse descarte ganhou uma exceção pra filtro nomeado.
    new RegExp(
      `\\bprioridade\\s+(?:de\\s+)?(?!${DIMENSION_CONNECTOR_LEAK_SOURCE})(?!${UNSET_VALUE_ADJECTIVE_SOURCE}\\b)`
        + `(?!(?:n[ao]\\s+)?(?:${AREA_SYNONYM_SOURCE}|departamento)\\b)(.+)$`,
      "iu",
    ),
    // Ordem substantivo-nível invertida ("alta prioridade", tão natural
    // quanto "prioridade alta") — achado testando o lote de perguntas ao
    // vivo: "Tickets de ALTA PRIORIDADE." não resolvia prioridade nenhuma
    // (só a ordem "prioridade alta" acima era aceita), e sem esse valor
    // resolvido o novo padrão "tickets de <nome>" de extractOperatorName
    // (ver mais abaixo) capturava "alta prioridade" inteiro como se fosse
    // um nome de operador. Só os 3 níveis nomeados (baixa/media/alta) têm
    // essa forma invertida reconhecida — não é uma captura livre genérica
    // como a do padrão principal acima.
    /\b(baixa|media|alta)\s+prioridade\b/iu,
  ]);
}

// "Urgente" é uma prioridade real do sistema (distinta de "Alta"), então a
// palavra solta já é um sinal inequívoco, mesmo sem a palavra "prioridade"
// do lado. "Crítico"/"críticos" é tratado como sinônimo de urgente pelo
// mesmo motivo — "os tickets mais críticos" é um jeito comum de perguntar
// por prioridade alta sem usar o vocabulário exato do sistema. Não
// generalizamos para "alta/média/baixa" soltas: são adjetivos comuns demais
// em português e dariam falso positivo fora do contexto.
export function extractPriorityIntent(value) {
  const text = normalizeText(value);

  return (
    extractPriorityName(value)
    ?? (/\burgente/.test(text) ? "Urgente" : undefined)
    ?? (/\bcritic[oa]s?\b/.test(text) ? "Urgente" : undefined)
  );
}

// "usuário" é a palavra que essas frases de busca de cadastro esperavam
// originalmente, mas "operador"/"responsável"/"atendente" são tratados como
// sinônimos dela em todo o resto do arquivo (ex.: extractOperatorName,
// logo abaixo) — faltava aqui. Sem isso, "Quem é o operador Helpdesk?"
// não batia em nenhum padrão e caía no fallback de listagem (devolvia
// tickets filtrados por operador, não o cadastro da pessoa).
// "técnico" (achado na auditoria de robustez): sinônimo comum de operador
// fora do vocabulário interno do sistema, faltava aqui e em
// extractOperatorName (que tinha uma 2ª cópia quase-igual desta mesma
// lista, inline, sem "usuário" — consolidado numa fonte só agora).
const USER_LOOKUP_NOUN_SOURCE = "usu[áa]rio|operador|respons[áa]vel|atendente|t[ée]cnico";

export function extractUserName(value) {
  return extractByPatterns(value, [
    new RegExp(
      `\\b(?:busque|busca|procure|procura|encontre|encontra)\\s+(?:o\\s+|a\\s+)?(?:${USER_LOOKUP_NOUN_SOURCE})s?\\s+(?:chamados?\\s+|de\\s+nome\\s+)?(.+)$`,
      "iu",
    ),
    new RegExp(`\\b(?:${USER_LOOKUP_NOUN_SOURCE})\\s+(?:chamado\\s+|de\\s+nome\\s+)(.+)$`, "iu"),
    new RegExp(`\\bquem\\s+[ée]\\s+(?:o\\s+|a\\s+)?(?:${USER_LOOKUP_NOUN_SOURCE})\\s+(.+)$`, "iu"),
    new RegExp(`\\binforma[çc][õo]es\\s+(?:do|sobre\\s+o)\\s+(?:${USER_LOOKUP_NOUN_SOURCE})\\s+(.+)$`, "iu"),
    // "Qual é o e-mail do usuário X?" (achado testando o lote de perguntas
    // ao vivo — Img 2): pergunta por um dado específico do cadastro
    // (e-mail), mesma intenção de busca de usuário das outras 4 variantes
    // acima, só com "e-mail" como gatilho em vez de "busque"/"quem é"/
    // "informações".
    new RegExp(`\\be-?mail\\s+(?:do|da|de)\\s+(?:${USER_LOOKUP_NOUN_SOURCE})\\s+(.+)$`, "iu"),
  ]);
}

// "Fábio está com muito ticket na mão?" / "Fábio tem muitos chamados?" /
// "Fábio está sobrecarregado?" — nome solto antes de uma frase de carga de
// trabalho, sem palavra-marcador como "operador". Alimenta a análise de
// carga por operador (analisar_carga_operador), não um filtro de listagem.
//
// O lookahead (OPERATOR_WORKLOAD_EXCLUSION_SOURCE, declarado mais acima,
// perto de extractOperatorName, que também reaproveita) usado só no padrão
// "quantos tickets <nome> tem" evita que outra dimensão já coberta por
// marcador próprio ("quantos tickets a área Suporte tem", "quantos tickets
// o departamento Governança tem") seja capturada como se fosse um nome de
// operador — essas frases já são resolvidas certo mais adiante, na rota de
// resumo por filtro citado; sem essa exclusão, o padrão de carga (que roda
// antes na cascata) venceria primeiro e tentaria (e falharia) resolver
// "área Suporte" como operador.
// "O time de Suporte está sobrecarregado?" (achado testando o lote de
// perguntas ao vivo): os 3 padrões bare abaixo (sem palavra-marcador antes
// do nome, ex. "operador") não tinham NENHUMA exclusão — qualquer texto
// antes de "está sobrecarregado"/"tem muitos tickets" era aceito como
// nome de PESSOA, mesmo quando na verdade é uma dimensão inteira sendo
// perguntada (ex.: "o time de Suporte", "a área de TI"), não um indivíduo.
// "time" não entra no vocabulário geral de área (AREA_SYNONYM_SOURCE) de
// propósito — é uma palavra comum demais fora do domínio de tickets (ex.:
// "o time resolveu trocar de fornecedor", sem relação nenhuma com
// suporte) pra servir de sinal confiável de domínio em outro lugar; aqui o
// risco é baixo porque só entra em jogo quando JÁ combinado com "está
// sobrecarregado"/"tem muitos tickets" (frase que só faz sentido dentro
// deste domínio).
const WORKLOAD_SUBJECT_EXCLUSION_SOURCE = `(?:o\\s+|a\\s+)?(?:time|${AREA_SYNONYM_SOURCE}|departamento)\\s+de\\b`;

export function extractOperatorWorkloadName(value) {
  return extractByPatterns(value, [
    new RegExp(
      `^(?!${WORKLOAD_SUBJECT_EXCLUSION_SOURCE})(.+?)\\s+(?:esta|está|estao|estão)\\s+com\\s+muito[s]?\\s+(?:ticket|chamado|atendimento)`,
      "iu",
    ),
    new RegExp(
      `^(?!${WORKLOAD_SUBJECT_EXCLUSION_SOURCE})(.+?)\\s+(?:esta|está|estao|estão)\\s+sobrecarregad[oa]s?\\b`,
      "iu",
    ),
    new RegExp(
      `^(?!${WORKLOAD_SUBJECT_EXCLUSION_SOURCE})(.+?)\\s+tem\\s+muito[s]?\\s+(?:ticket|chamado|atendimento)`,
      "iu",
    ),
    // "Quantos tickets a Ana Costa tem?" — mesma pergunta de carga, só em
    // ordem de pergunta ("quantos X <nome> tem") em vez de afirmação
    // ("<nome> tem muitos X"). O "$" no final (permitindo só pontuação
    // depois de "tem") exige que "tem" feche a frase — sem isso, frases bem
    // mais complexas tipo "quantos chamados fechados o operador cesar tem
    // no departamento coids desde..." também bateriam nesse "tem" solto no
    // meio da frase, atropelando a rota certa (status fechado + operador +
    // departamento) com uma carga de operador incompleta.
    // Mesmo "cada\\s+" na negação do padrão irmão acima (achado testando o
    // lote de perguntas ao vivo): mesmo gap, mesma correção.
    new RegExp(
      `\\bquantos\\s+(?:tickets?|chamados?|atendimentos?)\\s+(?!(?:a\\s+|o\\s+|cada\\s+)?(?:${OPERATOR_WORKLOAD_EXCLUSION_SOURCE}))(?:a\\s+|o\\s+)?(.+?)\\s+tem\\s*[?!.]*$`,
      "iu",
    ),
    // "Me diga a carga de trabalho do operador Helpdesk." / "Qual a carga
    // do operador X?" — achado ao vivo: pedir a carga usando a palavra
    // "carga" diretamente (em vez de "sobrecarregado"/"tem muitos") caía
    // no filtro genérico de listagem (listar_tickets com operador: X), não
    // na análise de carga. Unanchored (sem "^") porque "carga de trabalho"
    // quase sempre vem depois de um prefixo de pergunta ("me diga a",
    // "qual a") que as outras alternativas acima não têm.
    new RegExp(
      `\\bcarga\\s+(?:de\\s+trabalho\\s+)?d[oa]\\s+(?:${USER_LOOKUP_NOUN_SOURCE}\\s+)?(.+?)[?!.]*$`,
      "iu",
    ),
  ]);
}

// "Compare a carga do X com a do Y" / "diferença de carga entre X e Y" —
// exige a palavra "carga" explicitamente (não generaliza pra "compare X e
// Y" solto, que é ambíguo demais e poderia capturar nomes de área/
// departamento por engano). Cobre só o caso claro de comparação de 2
// operadores, que é o exemplo de "pergunta composta" mais comum. "X está
// com mais tickets que Y"/"X tem mais chamados que Y" é a mesma ideia sem a
// palavra "carga" — mesmo vocabulário comparativo já aceito no singular por
// extractOperatorWorkloadName ("Fulano está com muitos tickets"), só que
// entre 2 nomes em vez de 1.
// "a quantidade de tickets"/"o volume de tickets" (achado testando o lote
// de perguntas ao vivo): "Compare A QUANTIDADE DE TICKETS do operador Ana
// com o operador Bruno." usa outro jeito comum de dizer "carga", mas só a
// palavra literal "carga" era aceita no 1º padrão abaixo — a comparação
// inteira caía no fallback genérico, perdendo o 2º nome por completo.
const CARGA_SYNONYM_SOURCE = "(?:carga|quantidade\\s+de\\s+tickets?|volume\\s+de\\s+tickets?)";

// "vs"/"x" como conector de comparação (achado testando o lote de
// perguntas ao vivo): "Compare a área WEB X área Suporte." usa "x"
// (jeito informal comum de dizer "versus"), mas só "com"/"e" eram
// aceitos em todos os extratores de comparação (operador/cliente/área/
// departamento) — sem isso, "WEB x área Suporte" vazava inteiro pro 1º
// nome capturado (ex.: area: "WEB x Suporte"), já que nenhuma alternativa
// batia e a captura genérica de 1 nome só (fallback) tomava a frase
// inteira. "(?:com|e|vs|x)" é reaproveitado em todos os 6 lugares que
// precisam reconhecer essa conexão (ver ocorrências abaixo).
export function extractOperatorComparisonNames(value) {
  const text = String(value ?? "");

  const patterns = [
    new RegExp(
      `\\bcompar[ae]\\s+a\\s+${CARGA_SYNONYM_SOURCE}\\s+(?:d[oa]\\s+)?(.+?)\\s+(?:com|e|vs|x)\\s+`
        + `(?:a\\s+(?:${CARGA_SYNONYM_SOURCE}\\s+)?d[oa]\\s+)?(.+)$`,
      "iu",
    ),
    // "Compare o operador X com o operador Y" (achado testando o lote de
    // perguntas ao vivo): forma BARE, sem a palavra "carga"/"quantidade de
    // tickets" — já existia pra área/departamento ("compare a área X com a
    // área Y"), faltava pra operador. Exige a palavra "operador" explícita
    // nos 2 lados (mesma cautela das comparações irmãs), senão "Compare
    // Fulano com Beltrano" (sem nenhuma palavra de dimensão) seria ambíguo
    // demais pra generalizar.
    // USER_LOOKUP_NOUN_SOURCE em vez de "operador" literal (achado testando
    // o lote de perguntas ao vivo): "Compare o TÉCNICO X com o ATENDENTE Y."
    // não batia, porque só a palavra "operador" era aceita aqui — os outros
    // sinônimos de operador (técnico/atendente/responsável/usuário) já são
    // reconhecidos em todo o resto do arquivo via essa mesma constante, só
    // faltava aqui. Os 2 lados não precisam usar o MESMO sinônimo.
    new RegExp(
      // 2º sinônimo de dimensão OPCIONAL (achado testando o lote de
      // perguntas ao vivo): "Compare o operador Ana VS Bruno." (sem
      // repetir "operador" no 2º lado, jeito comum na fala quando o
      // conector já deixa claro que é a mesma dimensão) não batia — a
      // palavra era exigida nos 2 lados, perdendo "Bruno" por completo
      // (vazava junto do 1º nome). Mesma ideia aplicada aqui e nos outros
      // 3 pares de comparação (cliente/área/departamento) abaixo.
      `\\bcompar[ae]\\s+(?:o\\s+)?(?:${USER_LOOKUP_NOUN_SOURCE})\\s+(.+?)\\s+(?:com|e|vs|x)\\s+(?:(?:o\\s+)?(?:${USER_LOOKUP_NOUN_SOURCE})\\s+)?(.+)$`,
      "iu",
    ),
    // "Compare os operadores X e Y" (achado testando o lote de perguntas ao
    // vivo): palavra no PLURAL ("operadores", não "operador") seguida pelos
    // 2 nomes direto, sem repetir a palavra de dimensão — forma mais curta e
    // comum do que a forma BARE acima (que repete "operador" 2x). Sem este
    // padrão, a comparação inteira caía no fallback genérico sem filtro
    // nenhum (os 2 nomes perdidos). Plurais dos outros sinônimos (técnicos/
    // atendentes) junto pelo mesmo motivo da forma singular acima.
    new RegExp(
      `\\bcompar[ae]\\s+(?:os\\s+)?(?:operadores|t[ée]cnicos|atendentes|usu[áa]rios|respons[áa]veis)\\s+(.+?)\\s+e\\s+(.+)$`,
      "iu",
    ),
    /\bdiferen[cç]a\s+de\s+carga\s+entre\s+(.+?)\s+e\s+(.+)$/iu,
    /^(.+?)\s+(?:esta|está|estao|estão)\s+com\s+mais\s+(?:tickets?|chamados?|atendimentos?)\s+(?:do\s+)?que\s+(?:o\s+|a\s+)?(.+)$/iu,
    /^(.+?)\s+tem\s+mais\s+(?:tickets?|chamados?|atendimentos?)\s+(?:do\s+)?que\s+(?:o\s+|a\s+)?(.+)$/iu,
    // "atende(m) mais tickets/chamados que" (achado testando o lote de
    // perguntas ao vivo — Img 28): mesma ideia comparativa de "tem"/"está
    // com", só que com o verbo "atender", também comum na fala natural.
    /^(.+?)\s+atendem?\s+mais\s+(?:tickets?|chamados?|atendimentos?)\s+(?:do\s+)?que\s+(?:o\s+|a\s+)?(.+)$/iu,
    // "Quem tem mais tickets: o operador X ou o operador Y?" (achado
    // testando o lote de perguntas ao vivo): mesmo formato "X ou Y" já
    // aceito pras comparações irmãs de cliente/área/departamento
    // (extractClientComparisonNames/extractAreaComparisonNames/
    // extractDepartmentComparisonNames), faltava pra operador — a frase
    // inteira caía em resumo_por_operador com um nome quebrado ("Ana Lima
    // ou o operador Bruno Costa"), que nunca resolve no catálogo real.
    // Exige a palavra "operador" explícita nos dois lados, mesma cautela
    // das comparações irmãs (evita generalizar "quem tem mais: X ou Y?"
    // solto, ambíguo demais sem a palavra de dimensão).
    new RegExp(
      `\\bquem\\s+tem\\s+mais\\s+(?:tickets?|chamados?|atendimentos?)`
        + `\\s*(?:${COMPARISON_NOUN_QUALIFIER_SOURCE})?\\s*:?\\s*`
        + `(?:o\\s+)?operador\\s+(.+?)\\s+ou\\s+(?:o\\s+)?operador\\s+(.+)$`,
      "iu",
    ),
    // "Compare os tickets do Fabio Gali com os do Diego Mota." (achado
    // testando o lote de perguntas ao vivo, com dados reais): forma BARE
    // mencionando só "tickets", sem NENHUMA palavra de dimensão (operador/
    // carga) nos 2 lados — mesmo raciocínio já aplicado às formas BARE
    // acima ("X tem mais tickets que Y"): default pra comparação de
    // OPERADOR, a menos que os guards de cliente/área/departamento mais
    // abaixo (mencionaClienteNoMatch/mencionaAreaOuDepartamentoNoMatch)
    // rejeitem o match por citar outra dimensão explicitamente — nesse
    // caso cai pro extrator certo (extractClientComparisonNames etc.) mais
    // adiante. Sem este padrão, os 2 nomes inteiros eram engolidos como um
    // nome-lixo só pelo fallback genérico de operador ("Fabio Gali com os
    // do Diego Mota"), que nunca resolve no catálogo e descarta a
    // comparação pedida por completo.
    // "(?:os\\s+|as\\s+)?" antes de "d[oa]" do lado direito (sem repetir
    // "tickets/chamados/atendimentos"): cobre "com os DO Y" (plural restante
    // de "tickets", sem repetir o substantivo) — sem isso "os do Diego Mota"
    // vazava inteiro pro nome2 ("os do Diego Mota", já que nem o grupo do
    // substantivo nem o "d[oa]" sozinho bate em "os").
    new RegExp(
      `\\bcompar[ae]\\s+(?:os\\s+|as\\s+)?(?:tickets?|chamados?|atendimentos?)\\s+(?:d[oa]\\s+)?(.+?)\\s+(?:com|e|vs|x)\\s+`
        + `(?:(?:os\\s+|as\\s+)?(?:tickets?|chamados?|atendimentos?)\\s+)?(?:os\\s+|as\\s+)?(?:d[oa]\\s+)?(.+)$`,
      "iu",
    ),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    // "Compare a carga do Fábio com a atividade do cliente Acme." (achado
    // testando o lote de perguntas ao vivo — Complexas, pergunta 15): o 1º
    // padrão acima (carga ... com ... carga) também casa quando o 2º lado é
    // na verdade uma cláusula de ATIVIDADE DE CLIENTE, não a carga de outro
    // operador — sem este guard, "atividade do cliente Acme" virava um nome
    // de operador ("atividade", depois que TRAILING_CLIENT_ACTIVITY_CLAUSE_
    // PATTERN podava "do cliente Acme" dentro de cleanFreeText), perdendo
    // "Acme" por completo e misturando duas dimensões diferentes numa
    // comparação só. A mistura de dimensão em si é tratada à parte, mais
    // abaixo em routeTicketQuestionCore (clarification dedicada) — aqui só
    // recusamos o match pra essa frase não virar uma comparação de operador
    // errada.
    const mencionaClienteNoMatch =
      new RegExp(`\\b${CLIENT_LOOKUP_NOUN_SOURCE}\\b`, "u").test(match[1])
      || new RegExp(`\\b${CLIENT_LOOKUP_NOUN_SOURCE}\\b`, "u").test(match[2]);

    if (mencionaClienteNoMatch) {
      continue;
    }

    // "Área WEB tem mais tickets que a área de Redes, Segurança e
    // Infraestrutura?" (achado testando o lote de perguntas ao vivo):
    // mesma ideia do guard de cliente acima, mas pra ÁREA/DEPARTAMENTO —
    // o padrão BARE "X tem mais tickets que Y" (sem exigir a palavra
    // "operador" nos 2 lados, pensado pro caso ambíguo "Fulano tem mais
    // chamados que Beltrano") também batia quando os 2 lados mencionam
    // "área"/"departamento" explicitamente, roubando o match ANTES de
    // extractAreaComparisonNames/extractDepartmentComparisonNames (que
    // rodam depois, na rota certa) conseguirem resolver a comparação de
    // verdade — virava operador: "Área WEB" / "área de Redes" (nome-lixo,
    // nunca bate no catálogo real de operadores).
    // normalizeText() antes de testar (não direto contra match[1]/match[2]
    // crus) — achado testando esta própria correção: "\\b" do JS nunca
    // reconhece "á"/"Á" como caractere de palavra (mesmo com as flags "iu"),
    // então "\\bárea\\b" nunca bate contra o texto CRU desta função
    // (diferente do resto do arquivo, que testa contra texto já normalizado
    // — ver mesmo cuidado em extractOperatorName, comentário sobre
    // TICKET_NOUN_SOURCE tolerante a acento). AREA_SYNONYM_SOURCE sem
    // acento (só "area", não "[áa]rea") basta aqui porque normalizeText já
    // removeu o acento de "área".
    const AREA_OU_DEPARTAMENTO_NORMALIZADO_SOURCE = "\\b(?:areas?|categorias?|equipes?|setores?)\\b|\\bdepartamentos?\\b";
    const mencionaAreaOuDepartamentoNoMatch =
      new RegExp(AREA_OU_DEPARTAMENTO_NORMALIZADO_SOURCE, "u").test(normalizeText(match[1]))
      || new RegExp(AREA_OU_DEPARTAMENTO_NORMALIZADO_SOURCE, "u").test(normalizeText(match[2]));

    if (mencionaAreaOuDepartamentoNoMatch) {
      continue;
    }

    const nome1 = cleanFreeText(match[1]);
    const nome2 = cleanFreeText(match[2]);

    if (nome1 !== undefined && nome2 !== undefined) {
      return [nome1, nome2];
    }
  }

  return undefined;
}

// Mesma ideia de extractOperatorComparisonNames, mas pra 2 CLIENTES em vez
// de 2 operadores (achado testando o lote de perguntas ao vivo — Img 33):
// "Quem abriu mais chamados: o cliente X ou o cliente Y?" não tinha nenhum
// suporte, caía sempre no fallback genérico sem comparação nenhuma. Exige a
// palavra "cliente" explícita nos dois lados (não generaliza pra "compare X
// e Y" solto, que já é reservado pra operador).
export function extractClientComparisonNames(value) {
  const text = String(value ?? "");

  const patterns = [
    // "Compare a atividade do cliente X com a do cliente Y" (achado testando
    // o lote de perguntas ao vivo — Lote extra 2, pergunta 13): mesmo jeito
    // de pedir comparação já aceito pra carga de operador ("compare a carga
    // do X com a do Y", ver extractOperatorComparisonNames), só que não
    // existia versão pra atividade de cliente — a frase caía sem suporte
    // nenhum em extractClientActivityName (pensado pra 1 cliente só), que
    // capturava "Acme com a do cliente Beta" inteiro e, depois de uma
    // limpeza de cláusula final que não esperava um 2º "cliente" no meio,
    // sobrava só "Acme com a" — o "Beta" sumia por completo. Captura não
    // gulosa (.+?) pra nome1 parar exatamente no conector "com"/"e", igual
    // ao padrão irmão de carga de operador.
    // CLIENT_LOOKUP_NOUN_SOURCE (não "cliente" literal) em todos os
    // padrões abaixo (achado testando o lote de perguntas ao vivo):
    // "solicitante" já é sinônimo aceito em todo o resto do arquivo, só
    // faltava aqui — "Compare os SOLICITANTES Ana e Beto." não batia em
    // nenhum padrão e caía em fora_do_dominio.
    new RegExp(
      `\\bcompar[ae]\\s+a\\s+atividade\\s+(?:d[oa]\\s+)?${CLIENT_LOOKUP_NOUN_SOURCE}\\s+(.+?)\\s+(?:com|e|vs|x)\\s+(?:(?:a\\s+)?(?:atividade\\s+)?(?:d[oa]\\s+)?${CLIENT_LOOKUP_NOUN_SOURCE}\\s+)?(.+)$`,
      "iu",
    ),
    // "Compare o cliente X com o cliente Y" (achado testando o lote de
    // perguntas ao vivo): forma BARE, sem a palavra "atividade" — mesmo gap
    // já corrigido pra operador acima ("compare o operador X com o
    // operador Y"), aqui pro espelho de cliente.
    new RegExp(
      `\\bcompar[ae]\\s+(?:o\\s+)?${CLIENT_LOOKUP_NOUN_SOURCE}\\s+(.+?)\\s+(?:com|e|vs|x)\\s+(?:(?:o\\s+)?${CLIENT_LOOKUP_NOUN_SOURCE}\\s+)?(.+)$`,
      "iu",
    ),
    // "Compare os clientes X e Y" (achado testando o lote de perguntas ao
    // vivo): mesmo espelho plural já corrigido pra operador acima
    // ("compare os operadores X e Y").
    new RegExp(
      `\\bcompar[ae]\\s+(?:os\\s+)?${CLIENT_LOOKUP_NOUN_PLURAL_SOURCE}\\s+(.+?)\\s+e\\s+(.+)$`,
      "iu",
    ),
    // "abr(?:e|em|iu|iram)" (achado testando o lote de perguntas ao vivo):
    // só o passado "abriu" era aceito — "O cliente Acme ABRE mais chamados
    // que o cliente Beta...?" (presente, tão comum quanto o passado) não
    // batia em nenhum padrão, e a comparação inteira caía no fallback
    // genérico de resumo por cliente, perdendo o 2º nome ("Beta") por
    // completo.
    new RegExp(
      `\\bquem\\s+abr(?:e|em|iu|iram)\\s+mais\\s+(?:tickets?|chamados?|atendimentos?)\\s*:?\\s*(?:o\\s+)?${CLIENT_LOOKUP_NOUN_SOURCE}\\s+(.+?)\\s+ou\\s+(?:o\\s+)?${CLIENT_LOOKUP_NOUN_SOURCE}\\s+(.+)$`,
      "iu",
    ),
    new RegExp(
      `^(?:o\\s+)?${CLIENT_LOOKUP_NOUN_SOURCE}\\s+(.+?)\\s+abr(?:e|em|iu|iram)\\s+mais\\s+(?:tickets?|chamados?|atendimentos?)\\s+(?:do\\s+)?que\\s+(?:o\\s+)?${CLIENT_LOOKUP_NOUN_SOURCE}\\s+(.+)$`,
      "iu",
    ),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const nome1 = cleanFreeText(match[1]);
    const nome2 = cleanFreeText(match[2]);

    if (nome1 !== undefined && nome2 !== undefined) {
      return [nome1, nome2];
    }
  }

  return undefined;
}

// Adjetivo de estado opcional entre o substantivo de ticket e o ":"/nome da
// 1ª opção em "quem tem mais <substantivo> [adjetivo]: X ou Y?" (achado
// testando o lote de perguntas ao vivo: "Quem tem mais CHAMADOS VENCIDOS: o
// departamento de Suporte ou...?" não batia em nenhum padrão de comparação
// de área/departamento por faltar esse qualificador) — compartilhado pelos
// 2, em vez de duplicar o mesmo vocabulário.
const COMPARISON_NOUN_QUALIFIER_SOURCE =
  `${OLDEST_PROXY_STATE_SOURCE}|${OPEN_STATE_ADJECTIVE_SOURCE}|${CLOSURE_VERB_SOURCE}`;

// Mesma ideia de extractOperatorComparisonNames/extractClientComparisonNames,
// mas pra 2 ÁREAS (achado testando o lote de perguntas ao vivo — Médias 1,
// pergunta 14): "Quem tem mais tickets: a área de Suporte ou a área WEB?"
// não tinha nenhum suporte — isOperatorRankingIntent assumia cegamente que
// "quem tem mais" era sobre operador, mesmo a frase citando "área" duas
// vezes, e extractAreaName capturava a string inteira quebrada "Suporte ou
// a área WEB" como um nome só. Exige a palavra de área (AREA_SYNONYM_SOURCE)
// explícita nos dois lados, igual extractClientComparisonNames exige
// "cliente" — evita colidir com comparação de operador/cliente.
export function extractAreaComparisonNames(value) {
  const text = String(value ?? "");

  const patterns = [
    // "Compare a área X com a área Y" (achado testando o lote de perguntas
    // ao vivo): faltava aqui, apesar de ser o 1º padrão já aceito pelas
    // comparações irmãs de operador/cliente — sem ele, "Compare a área de
    // Suporte com a área de Redes e Segurança." caía no fallback genérico,
    // perdendo a 2ª área por completo.
    // "(?:o\\s+|a\\s+)?" em vez de só "(?:a\\s+)?" (achado testando o lote
    // de perguntas ao vivo): AREA_SYNONYM_SOURCE mistura sinônimos
    // femininos (área/categoria/equipe) com um masculino ("setor") — só o
    // artigo feminino era aceito antes da palavra, então "Compare O SETOR
    // de TI com o setor de Redes." não batia em nenhuma das 3 alternativas
    // abaixo (todas tinham essa mesma lacuna), caindo no fallback genérico
    // de extractAreaName e perdendo a 2ª área por completo.
    new RegExp(
      `\\bcompar[ae]\\s+(?:o\\s+|a\\s+)?${AREA_SYNONYM_SOURCE}\\s+(?:de\\s+)?(.+?)\\s+(?:com|e|vs|x)\\s+`
        + `(?:(?:o\\s+|a\\s+)?${AREA_SYNONYM_SOURCE}\\s+(?:de\\s+)?)?(.+)$`,
      "iu",
    ),
    // "Quem tem mais CHAMADOS VENCIDOS: X ou Y?" (achado testando o lote de
    // perguntas ao vivo): adjetivo de estado (vencido/atrasado/aberto/
    // fechado/...) entre o substantivo e o ":"/nome da 1ª área — sem esse
    // qualificador opcional, a pergunta inteira não batia em nenhum padrão.
    new RegExp(
      `\\bquem\\s+tem\\s+mais\\s+(?:tickets?|chamados?|atendimentos?)`
        + `\\s*(?:${COMPARISON_NOUN_QUALIFIER_SOURCE})?\\s*:?\\s*`
        + `(?:o\\s+|a\\s+)?${AREA_SYNONYM_SOURCE}\\s+(?:de\\s+)?(.+?)\\s+ou\\s+`
        + `(?:o\\s+|a\\s+)?${AREA_SYNONYM_SOURCE}\\s+(?:de\\s+)?(.+)$`,
      "iu",
    ),
    new RegExp(
      `^(?:o\\s+|a\\s+)?${AREA_SYNONYM_SOURCE}\\s+(?:de\\s+)?(.+?)\\s+tem\\s+mais\\s+`
        + `(?:tickets?|chamados?|atendimentos?)\\s+(?:do\\s+)?que\\s+`
        + `(?:o\\s+|a\\s+)?${AREA_SYNONYM_SOURCE}\\s+(?:de\\s+)?(.+)$`,
      "iu",
    ),
    // "Quantos tickets a área X fechou COMPARADO COM a área Y?" (achado
    // testando o lote de perguntas ao vivo): forma comparativa afirmativa,
    // sem a palavra "compare" — sem este padrão, a 2ª área citada era
    // descartada em silêncio (a resposta só considerava a 1ª). O verbo
    // entre a 1ª área e "comparado" (fechou/teve/abriu/...) é podado depois
    // por cleanFreeText, que já reconhece esses verbos como cauda — por
    // isso a captura aqui é só "até a palavra comparado", sem listar verbo
    // nenhum explicitamente.
    new RegExp(
      `\\b(?:o\\s+|a\\s+)?${AREA_SYNONYM_SOURCE}\\s+(?:de\\s+)?(.+?)\\s+comparad[oa]\\s+(?:com|a)\\s+`
        + `(?:o\\s+|a\\s+)?${AREA_SYNONYM_SOURCE}\\s+(?:de\\s+)?(.+)$`,
      "iu",
    ),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const nome1 = cleanFreeText(match[1]);
    const nome2 = cleanFreeText(match[2]);

    if (nome1 !== undefined && nome2 !== undefined) {
      return [nome1, nome2];
    }
  }

  return undefined;
}

// Mesma ideia de extractAreaComparisonNames, mas pra 2 DEPARTAMENTOS em vez
// de 2 áreas (achado testando o lote de perguntas ao vivo): "Quem tem mais
// chamados vencidos: o departamento de Suporte ou o departamento de Redes e
// Segurança?" e "Compare o departamento de Governança com o departamento
// Coids..." não tinham suporte nenhum — a pergunta inteira caía no
// extrator genérico de departamento (extractDepartmentName), que capturava
// só o 1º departamento citado (e ainda vazava o resto da frase junto,
// "Suporte ou o departamento de Redes e Segurança") e perdia o 2º
// departamento por completo, sem nunca avisar que a comparação não foi
// feita de verdade. "Departamento" não tem sinônimo comum (diferente de
// área/categoria/equipe), por isso a palavra é literal, sem fonte própria.
export function extractDepartmentComparisonNames(value) {
  const text = String(value ?? "");

  const patterns = [
    /\bcompar[ae]\s+(?:o\s+)?departamento\s+(?:de\s+)?(.+?)\s+(?:com|e|vs|x)\s+(?:(?:o\s+)?departamento\s+(?:de\s+)?)?(.+)$/iu,
    new RegExp(
      `\\bquem\\s+tem\\s+mais\\s+(?:tickets?|chamados?|atendimentos?)`
        + `\\s*(?:${COMPARISON_NOUN_QUALIFIER_SOURCE})?\\s*:?\\s*`
        + `(?:o\\s+)?departamento\\s+(?:de\\s+)?(.+?)\\s+ou\\s+(?:o\\s+)?departamento\\s+(?:de\\s+)?(.+)$`,
      "iu",
    ),
    /^(?:o\s+)?departamento\s+(?:de\s+)?(.+?)\s+tem\s+mais\s+(?:tickets?|chamados?|atendimentos?)\s+(?:do\s+)?que\s+(?:o\s+)?departamento\s+(?:de\s+)?(.+)$/iu,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const nome1 = cleanFreeText(match[1]);
    const nome2 = cleanFreeText(match[2]);

    if (nome1 !== undefined && nome2 !== undefined) {
      return [nome1, nome2];
    }
  }

  return undefined;
}

export function extractDateRange(value) {
  const text = String(value ?? "");

  // "de" sozinho (sem "entre"/"período de") também abre um intervalo
  // quando é seguido, mais adiante na mesma frase, por uma data de
  // fechamento ("de X até Y") — achado testando o lote de perguntas ao
  // vivo (Nível Complexo, item 8): "Resumo operacional de 01/01/2020 até
  // 02/01/2020" só capturava dataFim (via fimMatch mais abaixo), porque
  // "de" não abria intervalo nenhum — dataInicio ficava de fora. Seguro
  // porque exige as DUAS datas na mesma frase (não é um "de X" solto, que
  // continua caindo no fallback de dia único/fim aberto mais abaixo).
  const rangeMatch = text.match(
    new RegExp(
      `\\b(?:entre|per[íi]odo\\s+de|de)\\s+(${DATE_TOKEN_SOURCE})\\s+(?:e|a|at[ée])\\s+(${DATE_TOKEN_SOURCE})\\b`,
      "iu",
    ),
  );

  if (rangeMatch) {
    return {
      dataInicio: parseDateToken(rangeMatch[1]),
      dataFim: parseDateToken(rangeMatch[2]),
    };
  }

  const inicioMatch = text.match(
    new RegExp(`\\b(?:desde|a\\s+partir\\s+de)\\s+(${DATE_TOKEN_SOURCE})\\b`, "iu"),
  );

  const fimMatch = text.match(
    new RegExp(`\\bat[ée]\\s+(${DATE_TOKEN_SOURCE})\\b`, "iu"),
  );

  const absoluto = compactEntities({
    dataInicio: inicioMatch ? parseDateToken(inicioMatch[1]) : undefined,
    dataFim: fimMatch ? parseDateToken(fimMatch[1]) : undefined,
  });

  if (absoluto.dataInicio !== undefined || absoluto.dataFim !== undefined) {
    return absoluto;
  }

  const diaMatch = text.match(
    new RegExp(`\\b(?:em|no\\s+dia)\\s+(${DATE_TOKEN_SOURCE})\\b`, "iu"),
  );

  if (diaMatch) {
    const data = parseDateToken(diaMatch[1]);
    return { dataInicio: data, dataFim: data };
  }

  return extractRelativeDateRange(normalizeText(value)) ?? {};
}

export function extractPage(value) {
  const text = normalizeText(value);
  const matches = [...text.matchAll(/\bpagina\s+(\d+)\b/g)];

  if (matches.length === 0) {
    return undefined;
  }

  const pagina = Number(matches[matches.length - 1][1]);

  return Number.isSafeInteger(pagina) && pagina > 0 && pagina <= 2147483647
    ? pagina
    : undefined;
}

// Usado pelos branches de mais_antigos/mais_recentes/sla_vencido pra achar
// um número solto na frase e usar como `limite` (ex.: "10 tickets mais
// antigos"). Precisa descartar ANTES tipos de número que não são um
// limite: "página N" (já tratado por extractPage), "nos últimos N dias/
// semanas/..." (achado testando o lote de perguntas ao vivo — esse número é
// quantidade de um intervalo de DATA, já capturado por extractDateRange/
// extractRelativeDateRange; sem descartar aqui, "nos últimos 30 dias"
// também virava limite: 30, truncando a listagem em vez de só filtrar por
// data), e uma DATA explícita DD/MM/AAAA ou AAAA-MM-DD (achado testando o
// lote de perguntas ao vivo — Básico/Médio/Complexo, item 3 do nível
// complexo): o texto já chega normalizado aqui (barras/hífens viram espaço,
// "01/01/2026" vira "01 01 2026"), então o primeiro "01" de uma data em
// "...aberto ENTRE 01/01/2026 e 30/06/2026..." batia como se fosse um
// pedido de "top 1", truncando a lista em 1 resultado só.
const LOOSE_NUMBER_NOISE_PATTERN =
  /\bpagina\s+\d+\b|\b(?:n[oa]s\s+)?[úu]ltim[oa]s\s+\d+\s+(?:dias?|semanas?|mes|meses|anos?)\b|\b\d{1,2}\s+\d{1,2}\s+\d{4}\b|\b\d{4}\s+\d{1,2}\s+\d{1,2}\b/giu;

// "dez tickets mais antigos" (achado testando o lote de perguntas ao vivo):
// número por extenso sem nenhum gatilho específico ("primeiros"/"top"/"com
// mais") — extractLimit nunca chega a tentar, só este fallback solto é
// usado pelos branches de mais_antigos/mais_recentes/sla_vencido. Mesma
// substituição de extractLimit, reaproveitada em vez de duplicada.
function extractLooseNumberMatch(text) {
  return substituiNumerosPorExtenso(text).replace(LOOSE_NUMBER_NOISE_PATTERN, "").match(/\b(\d+)\b/);
}

// Pedido explícito de visualização — troca a visão padrão da resposta
// (texto/tabela/gráfico) no FRONTEND, sem mudar qual tool é chamada nem o
// texto que o backend gera; mesmo padrão de decision.synthesize, só que pro
// lado do "como mostrar" em vez do "como resumir". Lista de gatilhos
// deliberadamente pequena: perder um caso só mantém o comportamento de hoje
// (abre em texto), um falso positivo só troca a view inicial.
// Achado na auditoria de robustez (lote de perguntas "OS/sinônimos"): faltavam
// verbos comuns ("visualizar", "transformar", "gerar") e TABELA tinha uma
// assimetria estrutural com GRÁFICO — GRÁFICO já aceitava "verbo + gráfico"
// puro (sem "em"), mas TABELA só aceitava "verbo + EM tabela", nunca "verbo +
// tabela" direto ("consegue gerar uma tabela com esses dados?" não batia em
// nenhum dos dois). Adicionada uma alternativa nova pra TABELA espelhando essa
// forma, em vez de mexer na que já funcionava.
// "isso"/"isto" cobria só o pronome solto — "transforme ESSES DADOS em uma
// tabela"/"faça um gráfico com ESSE RESULTADO" (jeito comum de se referir
// aos dados já consultados) não batiam, só o pronome.
const OBJECT_REFERENCE_SOURCE = "(?:isso|isto|esses?\\s+dados?|ess[ae]s?\\s+resultados?)\\s+";
// "coloc[ae]" nunca bateria com "coloque" (o imperativo mais comum de
// "colocar") — "c" vira "qu" antes de "e" pra manter o som (regra
// ortográfica do português, mesma classe de troca de "fazer"/"faça" já
// tratada acima), achado testando "Coloque isso em uma tabela.".
const PLACE_VERB_SOURCE = "colo(?:c|qu)[ae]";
// "planilha" (achado testando o lote de perguntas ao vivo): sinônimo comum
// de "tabela" no vocabulário de escritório (Excel/Sheets) — mesmo conceito
// pro usuário final, mas a palavra nunca entrava em nenhuma alternativa de
// FORMATO_TABELA_SOURCE abaixo.
const TABLE_WORD_SOURCE = "(?:tabelas?|planilhas?)";
// "ger[ae]" em vez de "gera" literal (achado testando o lote de perguntas
// ao vivo, junto da correção de "planilha" acima): só a forma indicativa
// ("gera uma tabela") era aceita — "GERE uma planilha com esses dados"
// (imperativo, tão comum quanto "gera" num pedido) não batia em nenhuma
// das 2 alternativas que usam esse verbo. Mesmo motivo de "faça"/"faz" já
// tratado 2 linhas abaixo (2 formas verbais comuns do mesmo verbo).
// "num"/"numa" (contração de "em um"/"em uma", tão comum quanto a forma sem
// contração na fala/escrita cotidiana) — achado testando o lote de
// perguntas ao vivo: "Mostra isso NUM gráfico de pizza."/"Bota isso NUMA
// tabela." não batiam em nenhum dos dois pedidos de formato, porque as 2
// alternativas "em (uma?) X" abaixo exigem a palavra "em" por extenso.
const EM_UMA_OPCIONAL_SOURCE = "(?:em\\s+(?:uma\\s+)?|numa\\s+)";

const FORMATO_TABELA_SOURCE =
  `(?:mostr[ae]|exib[ae]|apresent[ae]|${PLACE_VERB_SOURCE}|p[oõ]e|visualiz[ae]|transform[ae]|ger[ae])\\w*\\s+(?:${OBJECT_REFERENCE_SOURCE})?${EM_UMA_OPCIONAL_SOURCE}${TABLE_WORD_SOURCE}`
  + `|(?:mostr[ae]|exib[ae]|ger[ae]|monta|crie)\\w*\\s+(?:uma\\s+)?${TABLE_WORD_SOURCE}\\b`
  // Espelha a forma solta de gráfico logo abaixo ("em gráfico" sem verbo
  // logo antes): achado ao vivo que "mostre quantos tickets tem por
  // departamento em tabelas" não batia em nenhuma alternativa acima porque
  // todas exigem o verbo IMEDIATAMENTE antes de "em tabela" — qualquer
  // texto no meio (bem comum: "mostre <conteúdo> em tabela") já quebrava.
  + `|\\b${EM_UMA_OPCIONAL_SOURCE}(?:formato\\s+de\\s+)?${TABLE_WORD_SOURCE}\\b`
  + `|\\b${TABLE_WORD_SOURCE}\\s*,?\\s*por\\s+favor\\b`
  + `|\\bformato\\s+de\\s+${TABLE_WORD_SOURCE}\\b`
  // "arquivo excel"/"em excel" (achado testando o lote de perguntas ao
  // vivo): "Excel" é tão comum quanto "tabela"/"planilha" pra pedir o
  // mesmo formato, mas numa construção diferente ("um ARQUIVO excel",
  // não "em/formato de tabela") — nenhuma alternativa acima cobria.
  // Palavra bare "excel" é segura o bastante pra não precisar de uma
  // palavra de ligação antes (baixo risco de colisão com outro sentido
  // dentro do domínio de tickets).
  + "|\\bexcel\\b";
// "faça" chega aqui já normalizado (normalizeText despe a cedilha via NFD),
// virando "faca" — por isso o padrão usa fa[cz], não fa[çz], senão "faça um
// gráfico" (bem comum) nunca bateria, só a forma "faz".
const FORMATO_GRAFICO_SOURCE =
  "\\b(?:fa[cz]|crie|ger[ae]|monta|visualiz[ae]|transform[ae])\\w*\\s+(?:um\\s+)?gr[áa]ficos?\\b"
  // "em um gráfico" (achado na mesma auditoria): o "um/uma" opcional faltava
  // aqui — só "em gráfico"/"em forma de gráfico" batiam, sem artigo. "num"/
  // "numa" (achado testando o lote de perguntas ao vivo) são a mesma
  // contração de EM_UMA_OPCIONAL_SOURCE acima, só que tolerando os 2
  // gêneros ("numa?") igual o resto desta alternativa já fazia com "uma?".
  + "|\\b(?:em\\s+(?:uma?\\s+)?|numa?\\s+)(?:forma\\s+de\\s+)?gr[áa]ficos?\\b"
  + "|\\bformato\\s+de\\s+gr[áa]ficos?\\b"
  + "|\\bgraficamente\\b"
  + "|\\bde\\s+forma\\s+(?:gr[áa]fica|visual)\\b";
const FORMATO_TABELA_PATTERN = new RegExp(FORMATO_TABELA_SOURCE, "iu");
const FORMATO_GRAFICO_PATTERN = new RegExp(FORMATO_GRAFICO_SOURCE, "iu");

// "Resumo por área, mostra em gráfico." → "agora mostra em tabela" (achado
// testando continuação ao vivo): o texto mesclado (turno 1 + turno 2) fica
// com os 2 pedidos de formato ao mesmo tempo — antes, gráfico SEMPRE vencia
// (checado primeiro, incondicionalmente), então o pedido mais recente do
// usuário (tabela) era ignorado em silêncio. Mesma classe do bug já
// corrigido pra dimensão de resumo (ultimaDimensaoPorConector) — quando os
// 2 aparecem, vence o que foi mencionado MAIS TARDE no texto, não uma
// prioridade fixa.
function detectFormatoPreferido(text) {
  const matchGrafico = FORMATO_GRAFICO_PATTERN.exec(text);
  const matchTabela = FORMATO_TABELA_PATTERN.exec(text);

  if (matchGrafico && matchTabela) {
    return matchGrafico.index > matchTabela.index ? "grafico" : "tabela";
  }

  if (matchGrafico) {
    return "grafico";
  }

  if (matchTabela) {
    return "tabela";
  }

  return undefined;
}

// F4 (auditoria de robustez): "Faça um gráfico." / "Coloque isso em uma
// tabela." sozinhos (sem nenhuma outra palavra do domínio de tickets) não
// tinham como ser roteados standalone — falham o portão de domínio
// (TICKET_DOMAIN_VOCABULARY_PATTERN) e devolvem "não entendi", mesmo
// quando é claramente um pedido de reformatar a resposta anterior. Usado
// por agent/continuation.js como mais um sinal de continuação (ao lado dos
// marcadores de texto livre), reaproveitando o mesmo vocabulário de
// tabela/gráfico em vez de duplicá-lo numa 3ª lista.
export function isBareFormatoRequest(pergunta) {
  const text = normalizeText(pergunta);
  return detectFormatoPreferido(text) !== undefined && !TICKET_DOMAIN_VOCABULARY_PATTERN.test(text);
}

// Nível de detalhe pedido explicitamente — só tem efeito nos branches de
// LISTAGEM (cada um chama formatTicket por ticket; "detalhado" mostra o
// comentário de abertura, "resumido" garante que não mostra, mesmo nas
// tools que já mostram por padrão como buscar_tickets_por_texto). Não
// colide com isResumoTicketIntent (branch de ticket único): "resumido"
// nunca casa com /\bresum[ao]\b/, e de qualquer forma esse flag só é lido
// nos branches de listagem, nunca no de número.
const DETALHADO_PATTERN = /\bdetalhad[oa]s?\b|\bcom\s+detalhes?\b|\bna\s+[íi]ntegra\b/iu;
const RESUMIDO_PATTERN = /\bresumid[oa]s?\b|\bde\s+forma\s+(?:breve|resumida)\b|\bs[óo]\s+o\s+essencial\b/iu;

function detectVerbosidade(text) {
  if (DETALHADO_PATTERN.test(text)) {
    return "detalhado";
  }

  if (RESUMIDO_PATTERN.test(text)) {
    return "resumido";
  }

  return undefined;
}

// "quais (são) (os/as) X" — o artigo entre "quais" e o substantivo é opcional
// na fala real ("quais OS canais", "quais AS áreas") e faltava em todos os
// gatilhos abaixo, que só casavam a forma sem artigo (achado ao vivo: "Quais
// os canais de atendimento disponíveis?" não batia em nenhum META_INTENTS e
// caía no fallback genérico de listar_tickets). "são" entre "quais" e o
// artigo também é opcional ("Quais são as prioridades disponíveis?" tem
// "sao" entre os dois e não batia sem essa peça).
const QUAIS_ARTIGO_SOURCE = "(?:quais\\s+(?:sao\\s+)?(?:a|as|o|os)?\\s*)";

const META_INTENTS = [
  {
    tool: "listar_areas_tickets",
    patterns: [
      new RegExp(`\\b${QUAIS_ARTIGO_SOURCE}areas\\b`),
      /\bliste\s+(?:todas\s+)?as\s+areas\b/,
      /\blistar\s+areas\b/,
      /\bareas\s+existem\b/,
    ],
  },
  {
    tool: "listar_prioridades_tickets",
    patterns: [
      new RegExp(`\\b${QUAIS_ARTIGO_SOURCE}prioridades\\b`),
      /\bliste\s+(?:todas\s+)?as\s+prioridades\b/,
      /\blistar\s+prioridades\b/,
      /\bprioridades\s+existem\b/,
    ],
  },
  {
    tool: "listar_canais_tickets",
    patterns: [
      new RegExp(`\\b${QUAIS_ARTIGO_SOURCE}canais\\b`),
      /\bliste\s+(?:todos\s+)?os\s+canais\b/,
      /\blistar\s+canais\b/,
      /\bcanais\s+existem\b/,
      /\bcanais\s+de\s+entrada\b/,
    ],
  },
  {
    tool: "listar_status_tickets",
    patterns: [
      new RegExp(`\\b${QUAIS_ARTIGO_SOURCE}status\\b`),
      /\bliste\s+(?:todos\s+)?os\s+status\b/,
      /\blistar\s+status\b/,
      /\bstatus\s+existem\b/,
      /\bstatus\s+possiveis\b/,
    ],
  },
  {
    tool: "listar_departamentos_tickets",
    patterns: [
      new RegExp(`\\b${QUAIS_ARTIGO_SOURCE}departamentos\\b`),
      /\bliste\s+(?:todos\s+)?os\s+departamentos\b/,
      /\blistar\s+departamentos\b/,
      /\bdepartamentos\s+existem\b/,
    ],
  },
  {
    tool: "listar_usuarios_tickets",
    patterns: [
      new RegExp(`\\b${QUAIS_ARTIGO_SOURCE}usuarios\\b`),
      /\bliste\s+(?:todos\s+)?os\s+usuarios\b/,
      /\blistar\s+usuarios\b/,
      /\busuarios\s+existem\b/,
      new RegExp(`\\b${QUAIS_ARTIGO_SOURCE}operadores\\b`),
      /\boperadores\s+existem\b/,
    ],
  },
];

function createTicketDecision(intent, toolName, entities) {
  return {
    entity: "ticket",
    intent,
    toolNames: [toolName],
    entities,
    fallback: false,
  };
}

// Nenhuma tool é chamada — a pergunta é honestamente ambígua ou pede algo
// que as tools disponíveis não sustentam (negação/exclusão), então a
// resposta certa é pedir esclarecimento, não adivinhar ou ignorar em
// silêncio (itens 3 e 4 do plano de correção da auditoria).
function createClarificationDecision(intent, mensagem) {
  return {
    entity: "ticket",
    intent,
    toolNames: [],
    entities: {},
    fallback: false,
    clarification: mensagem,
  };
}

// "Compare X e Y" — a MESMA tool roda duas vezes (uma por lado), decidido
// aqui de forma totalmente determinística (nenhuma escolha do LLM), mesma
// garantia do caminho de 1 tool só que generalizada pra 2 chamadas fixas.
function createCompareDecision(intent, comparisons) {
  return {
    entity: "ticket",
    intent,
    toolNames: [comparisons[0].toolName],
    entities: {},
    compare: comparisons,
    fallback: false,
  };
}

function routeTicketQuestionCore(pergunta) {
  const text = normalizeText(pergunta);

  // Checado logo aqui, antes de qualquer outra coisa usar `numero` ou cair
  // no fallback de listagem: uma referência de ticket que PARECE um número
  // (tem a palavra ticket/chamado/número/nº do lado) mas não é um número
  // de ticket válido (negativo ou absurdamente grande) merece um aviso
  // explícito, não um silêncio que mostra o ticket errado ou despeja a
  // base inteira sem filtro.
  if (detectaReferenciaDeTicketInvalida(pergunta)) {
    return createClarificationDecision(
      "esclarecimento_numero_invalido",
      "Esse número de ticket não parece válido (negativo, ou grande demais pra existir). Pode conferir o número e perguntar de novo?"
        + "\n\nExemplos:\n"
        + "- Detalhe o ticket 1050.\n"
        + "- Busque o ticket 4830.",
    );
  }

  const numero = extractTicketNumber(pergunta);
  const formatoPreferido = detectFormatoPreferido(text);
  const verbosidadePreferida = detectVerbosidade(text);

  const status =
    extractTicketStatusName(pergunta)
    ?? extractLiteralStatus(text);

  // "Tickets com status Em estudo OU Em atendimento." (achado testando o
  // lote de perguntas ao vivo): status é texto livre de catálogo (não tem
  // um conjunto fixo pequeno como baixa/media/alta de prioridade), então
  // extractTicketStatusName captura a frase INTEIRA depois de "status",
  // incluindo o "ou" e o 2º valor — "Em estudo ou Em atendimento" nunca
  // resolve como status real nenhum, só falha silenciosamente como "não
  // encontrado" sem explicar o motivo real (são 2 valores, não 1). Mesma
  // limitação de "só filtro 1 valor por vez" já avisada pra prioridade,
  // aqui detectada genericamente pelo conector "ou" dentro do valor
  // capturado (não dá pra listar os status reais, catálogo é dinâmico).
  if (status !== undefined && /\bou\b/.test(normalizeText(status))) {
    return createClarificationDecision(
      "esclarecimento_uniao_status",
      "Essa pergunta parece pedir mais de um status ao mesmo tempo — hoje só consigo filtrar por um status de cada vez. Pode perguntar sobre cada status separadamente?"
        + "\n\nExemplos:\n"
        + "- Tickets com status Em estudo.\n"
        + "- Tickets com status Em atendimento.",
    );
  }

  // "Tickets que a Ana NÃO abriu essa semana." (achado testando o lote de
  // perguntas ao vivo): nega a AÇÃO (quem NÃO fez algo), não o VALOR de uma
  // dimensão já capturada — diferente de todas as negações tratadas em
  // detectaNegacaoNaoSuportada (mais abaixo), que exigem um valor JÁ
  // extraído pra negar. Checado ANTES de extractClientName/extractOperatorName
  // de propósito: o padrão "que X abriu"/"que X tratou/atendeu/fechou" (ver
  // esses extratores) usa captura NÃO-gulosa até o verbo, então "não" ficava
  // PRESO dentro do próprio nome capturado ("Ana não"), que nunca bate por
  // substring com nenhum contact_name/operador real — a negação nunca era
  // detectada porque o "não" não ficava ANTES do valor capturado (como os
  // outros casos esperam), ficava DENTRO dele. Não dá pra inverter com
  // segurança (precisaria do conjunto de TODOS que não fizeram, não existe
  // essa tool), então recusa honestamente, igual as outras negações sem
  // suporte. "tem" fica de fora do verbo de operador de propósito — "que
  // não tem operador" já é a intenção isSemOperadorIntent (estado), tratada
  // à parte, não entra aqui.
  const ACAO_NEGAVEL_SOURCE = `${CLIENT_ACTIVITY_VERB_SOURCE}|trat(?:ou|aram)|atend(?:eu|eram)|fech(?:ou|aram)`;
  const mencionaAcaoNegada = new RegExp(
    `\\bque\\s+(?:o\\s+|a\\s+)?.+?\\s+n[ãa]o\\s+(?:${ACAO_NEGAVEL_SOURCE})\\b`,
    "u",
  ).test(text);

  if (mencionaAcaoNegada) {
    return createClarificationDecision(
      "esclarecimento_negacao",
      "Não consigo filtrar por quem NÃO fez uma ação (abrir/tratar/atender/fechar) — as consultas disponíveis só filtram por quem FEZ. Pode reformular dizendo o que você quer ver diretamente?"
        + "\n\nExemplos:\n"
        + "- Tickets que a Ana abriu essa semana.\n"
        + "- Tickets sem operador atribuído.",
    );
  }

  const area = extractAreaName(pergunta);
  const departamento = extractDepartmentName(pergunta);
  const operadorExtraido = extractOperatorName(pergunta);
  const cliente = extractClientName(pergunta);
  // Todo branch abaixo que monta `entities` deve usar ESTA variável (não
  // chamar extractOperatorName(pergunta) de novo) — achado testando o lote
  // de perguntas ao vivo (Lote extra 1, pergunta 21): vários branches
  // recomputavam o operador bruto direto, sem passar pelo guard abaixo, e
  // "tickets abertos pela Wanilene Cassiano" (cliente, não operador) virava
  // operador E cliente com o MESMO nome brigando no filtro (zerava o
  // resultado) — mesma classe do bug "Daniel Guimarães DO LAGO" já
  // documentado em isOperadorContidoNoCliente, só que não aplicado aqui
  // ainda.
  const operador = isOperadorContidoNoCliente(operadorExtraido, cliente) ? undefined : operadorExtraido;
  const prioridade = extractPriorityIntent(pergunta);
  const limite = extractLimit(pergunta);
  const pagina = extractPage(pergunta);
  const { dataInicio, dataFim } = extractDateRange(pergunta);

  // "dia 31 de abril" (achado testando o lote de perguntas ao vivo): data
  // de calendário impossível — checado logo aqui, antes de qualquer branch
  // usar dataInicio/dataFim, pra nunca devolver uma listagem "vazia" como
  // se a pergunta fosse válida e só não tivesse resultado.
  if (isDataCalendarInvalida(dataInicio) || isDataCalendarInvalida(dataFim)) {
    return createClarificationDecision(
      "esclarecimento_data_invalida",
      "Essa data não existe no calendário (confira o dia e o mês). Pode conferir e perguntar de novo?"
        + "\n\nExemplos:\n"
        + "- Tickets abertos no dia 30 de abril.\n"
        + "- Tickets abertos entre 01/04/2026 e 30/04/2026.",
    );
  }

  const entities = compactEntities({
    status,
    area,
    departamento,
    operador,
    cliente,
    prioridade,
    numero,
    dataInicio,
    dataFim,
    limite,
    pagina,
  });

  // "Compare a área de Suporte, a área WEB e a área de Redes e Segurança."
  // (achado testando o lote de perguntas ao vivo): comparação de 3+ itens
  // da mesma dimensão — nenhuma tool de comparação suporta mais de 2 de
  // cada vez (analisar_carga_operador/analisar_atividade_cliente/
  // listar_tickets são sempre chamadas em pares) — sem este guard, os
  // extratores de 2 itens só (mais abaixo) capturavam 2 dos 3 nomes e
  // descartavam o 3º (ou o do meio) em silêncio, sem avisar que a
  // comparação de verdade não foi feita. Checado ANTES de qualquer
  // extrator de 2 itens, pra nunca chegar a uma captura parcial enganosa.
  function contaMencoesDimensao(dimensionSource) {
    const matches = text.match(new RegExp(`\\b(?:${dimensionSource})\\b`, "gu"));

    return matches === null ? 0 : matches.length;
  }

  // "Detalhe os tickets do Fabio Gali, do Diego Mota e do Cesar." (achado
  // testando o lote de perguntas ao vivo): mesma ideia do guard acima
  // (3+ itens, nenhuma tool suporta), mas pra uma ENUMERAÇÃO de nomes
  // próprios via "do/da X, do/da Y e do/da Z" — contaMencoesDimensao não
  // pega esse caso porque a palavra "operador"/"cliente" nunca aparece,
  // só os nomes soltos (ver TRES_OU_MAIS_NOMES_DO_DA_PATTERN acima).
  const mencionaTresOuMaisNomesProprios =
    new RegExp(`\\b${TICKET_NOUN_SOURCE}s?\\b`, "iu").test(pergunta)
    && TRES_OU_MAIS_NOMES_DO_DA_PATTERN.test(pergunta);

  const mencionaComparacaoDe3OuMais =
    (/\bcompar[ae]\b/.test(text)
      && [
        contaMencoesDimensao(AREA_SYNONYM_SOURCE),
        contaMencoesDimensao("departamento"),
        contaMencoesDimensao(USER_LOOKUP_NOUN_SOURCE),
        contaMencoesDimensao(CLIENT_LOOKUP_NOUN_SOURCE),
      ].some((contagem) => contagem >= 3))
    || mencionaTresOuMaisNomesProprios;

  if (mencionaComparacaoDe3OuMais) {
    return createClarificationDecision(
      "esclarecimento_comparacao_3_ou_mais",
      "Só consigo comparar 2 de cada vez — não dá pra comparar 3 ou mais itens numa pergunta só. Pode comparar 2 por vez?"
        + "\n\nExemplos:\n"
        + "- Compare a área de Suporte com a área WEB.\n"
        + "- Compare a área WEB com a área de Redes e Segurança.",
    );
  }

  // "Compare a área de TI com o departamento Financeiro e com a área WEB."
  // (achado testando o lote de perguntas ao vivo): mistura de dimensões
  // DIFERENTES (2 áreas + 1 departamento) — checado AQUI, antes de qualquer
  // extrator específico de 2 itens (área/departamento/operador/cliente),
  // não depois. Checar depois (como era antes) deixava a porta aberta pra
  // um bug sutil: extractAreaComparisonNames tem uma captura não-gulosa que
  // consegue "pular" por cima da cláusula "com o departamento Financeiro e"
  // inteira (tratando-a como se fosse parte do nome1, e cleanFreeText então
  // limpa esse nome1 "sujo" de volta pra um valor limpo "TI" via
  // TRAILING_FILTER_CLAUSE_PATTERN) — o resultado parecia uma comparação
  // válida de 2 áreas (TI x WEB), mas descartava o departamento Financeiro
  // em silêncio, sem avisar que a comparação de 3 itens misturados não foi
  // feita de verdade. Calculado cedo, nenhum extrator chega a rodar antes.
  const comparaDimensaoOperador = new RegExp(
    `\\bcarga\\b|\\b(?:${USER_LOOKUP_NOUN_SOURCE})(?:es|s)?\\b`,
    "u",
  ).test(text);
  const comparaDimensaoCliente = new RegExp(
    `\\batividade\\b|\\b${CLIENT_LOOKUP_NOUN_SOURCE}(?:s)?\\b`,
    "u",
  ).test(text);
  const comparaDimensaoArea = new RegExp(`\\b${AREA_SYNONYM_SOURCE}(?:s)?\\b`, "u").test(text);
  const comparaDimensaoDepartamento = /\bdepartamentos?\b/u.test(text);
  const quantasDimensoesComparadas = [
    comparaDimensaoOperador,
    comparaDimensaoCliente,
    comparaDimensaoArea,
    comparaDimensaoDepartamento,
  ].filter(Boolean).length;

  const mencionaComparacaoDimensoesMisturadas =
    /\bcompar[ae]\b/.test(text) && quantasDimensoesComparadas >= 2;

  if (mencionaComparacaoDimensoesMisturadas) {
    return createClarificationDecision(
      "esclarecimento_comparacao_dimensoes_diferentes",
      "Só consigo comparar dentro da mesma dimensão — dois operadores, dois clientes ou duas áreas — não dá pra comparar a carga de um operador com a atividade de um cliente (ou outra dimensão) diretamente."
        + "\n\nExemplos:\n"
        + "- Compare a carga do operador Fulano com a do operador Beltrano.\n"
        + "- Compare a atividade do cliente X com a do cliente Y.",
    );
  }

  // Comparação entre 2 tickets ou 2 operadores — checado antes de qualquer
  // outra intenção, já que "compare o ticket X com o Y" não deve cair no
  // caminho de número único (buscaria só o primeiro e ignoraria o segundo).
  const comparacaoTickets = extractTicketComparisonNumbers(pergunta);

  if (comparacaoTickets !== undefined) {
    return createCompareDecision("comparar_tickets", [
      { toolName: "buscar_ticket_por_numero", args: { numero: comparacaoTickets[0] } },
      { toolName: "buscar_ticket_por_numero", args: { numero: comparacaoTickets[1] } },
    ]);
  }

  // "Detalhe os tickets 100, 200 e 300." (achado testando o lote de
  // perguntas ao vivo, respondendo decisão explícita do usuário de não
  // ficar limitado a 1 ticket por vez): pedido de detalhe de 2+ tickets
  // SEM "compare"/"diferença entre" (esse caso já é resolvido acima por
  // comparacaoTickets, por isso o "undefined" não é redundante — evita
  // tentar esta rota de novo quando a de cima já teria bastado). Reusa o
  // MESMO mecanismo de "compare" (createCompareDecision/runCompare/
  // formatComparison), que já é genérico pra N itens, não só 2 — só muda
  // o nome da intent, pra não chamar de "comparação" uma frase que não
  // pede nenhuma comparação, só o detalhe de cada um lado a lado.
  const detalheVariosTickets = extractMultipleTicketNumbers(pergunta);

  if (detalheVariosTickets !== undefined) {
    return createCompareDecision(
      "detalhar_varios_tickets",
      detalheVariosTickets.map((numero) => ({ toolName: "buscar_ticket_por_numero", args: { numero } })),
    );
  }

  // "Compare a carga do Fábio Gali com a do Rodrigo Fernandes E COM A DO
  // Carlos." (achado testando o lote de perguntas ao vivo): comparação de
  // operador/cliente usa "a carga/atividade DO X" só na 1ª menção — da 2ª
  // em diante é só "com a do Y"/"e com a do Z", sem repetir a palavra
  // "operador"/"cliente" — então mencionaComparacaoDe3OuMais (que CONTA
  // menções da palavra de dimensão) não pega esse caso. Em vez disso,
  // depois de extrair o par, checa se o 2º nome capturado ainda tem um
  // conector residual ("e com a do"/"e a do") — sinal de que um 3º item
  // (ou mais) ficou preso dentro do que devia ser só o 2º nome.
  function contemConectorResidualDeComparacao(nome) {
    return nome !== undefined && /\be\s+(?:com\s+)?(?:a\s+)?d[oa]\b/u.test(normalizeText(nome));
  }

  const comparacaoOperadores = extractOperatorComparisonNames(pergunta);

  if (comparacaoOperadores !== undefined) {
    if (contemConectorResidualDeComparacao(comparacaoOperadores[1])) {
      return createClarificationDecision(
        "esclarecimento_comparacao_3_ou_mais",
        "Só consigo comparar 2 de cada vez — não dá pra comparar 3 ou mais itens numa pergunta só. Pode comparar 2 por vez?"
          + "\n\nExemplos:\n"
          + "- Compare a área de Suporte com a área WEB.\n"
          + "- Compare a área WEB com a área de Redes e Segurança.",
      );
    }

    return createCompareDecision("comparar_carga_operador", [
      { toolName: "analisar_carga_operador", args: { operador: comparacaoOperadores[0] } },
      { toolName: "analisar_carga_operador", args: { operador: comparacaoOperadores[1] } },
    ]);
  }

  const comparacaoClientes = extractClientComparisonNames(pergunta);

  if (comparacaoClientes !== undefined) {
    if (contemConectorResidualDeComparacao(comparacaoClientes[1])) {
      return createClarificationDecision(
        "esclarecimento_comparacao_3_ou_mais",
        "Só consigo comparar 2 de cada vez — não dá pra comparar 3 ou mais itens numa pergunta só. Pode comparar 2 por vez?"
          + "\n\nExemplos:\n"
          + "- Compare a área de Suporte com a área WEB.\n"
          + "- Compare a área WEB com a área de Redes e Segurança.",
      );
    }

    return createCompareDecision("comparar_atividade_cliente", [
      { toolName: "analisar_atividade_cliente", args: { cliente: comparacaoClientes[0] } },
      { toolName: "analisar_atividade_cliente", args: { cliente: comparacaoClientes[1] } },
    ]);
  }

  // Não existe uma tool de "carga da área" equivalente a analisar_carga_
  // operador/analisar_atividade_cliente — listar_tickets com só o filtro de
  // área já dá o total certo (não afetado por paginação, ver comentário na
  // tool), então é reaproveitada aqui; limite:1 evita buscar tickets demais
  // à toa, já que só o total importa pra comparação.
  const comparacaoAreas = extractAreaComparisonNames(pergunta);

  if (comparacaoAreas !== undefined) {
    return createCompareDecision("comparar_tickets_area", [
      { toolName: "listar_tickets", args: { area: comparacaoAreas[0], limite: 1 } },
      { toolName: "listar_tickets", args: { area: comparacaoAreas[1], limite: 1 } },
    ]);
  }

  // Mesma ideia da comparação de áreas acima, mas pra 2 departamentos (ver
  // extractDepartmentComparisonNames).
  const comparacaoDepartamentos = extractDepartmentComparisonNames(pergunta);

  if (comparacaoDepartamentos !== undefined) {
    return createCompareDecision("comparar_tickets_departamento", [
      { toolName: "listar_tickets", args: { departamento: comparacaoDepartamentos[0], limite: 1 } },
      { toolName: "listar_tickets", args: { departamento: comparacaoDepartamentos[1], limite: 1 } },
    ]);
  }

  // "Compare a carga de tickets entre dois operadores à sua escolha." (achado
  // testando o lote de perguntas ao vivo — Lote extra 3, pergunta 13): pedido
  // de comparação sem nomear ninguém de verdade ("à sua escolha" pede pro
  // sistema decidir sozinho) — nenhum extrator de comparação acima bate
  // (não há nome nenhum pra capturar), e sem este guard a pergunta caía no
  // fallback genérico de listagem sem filtro nenhum (despejando o banco
  // inteiro), em vez de pedir honestamente pra nomear quem comparar — o
  // sistema é 100% determinístico, não "escolhe" ninguém sozinho.
  const mencionaComparacaoSemNome =
    /\bcompar[ae]\b/.test(text)
    && new RegExp(
      // "es?" em vez de "s?" solto: USER_LOOKUP_NOUN_SOURCE tem "operador"
      // (plural "operadorES", não "operadors") misturado com palavras que já
      // terminam em vogal ("usuário"/"técnico", plural com só "s") — "es?"
      // cobre as duas famílias ao mesmo tempo sem precisar separar.
      `\\b(?:carga|atividade)\\b.*\\b(?:${USER_LOOKUP_NOUN_SOURCE}|${CLIENT_LOOKUP_NOUN_SOURCE}|${AREA_SYNONYM_SOURCE})(?:es|s)?\\b`,
      "u",
    ).test(text);

  if (mencionaComparacaoSemNome) {
    return createClarificationDecision(
      "esclarecimento_comparacao_sem_nome",
      "Pra comparar, preciso que você diga quem comparar — não escolho por conta própria."
        + "\n\nExemplos:\n"
        + "- Compare a carga do operador Fulano com a do operador Beltrano.\n"
        + "- Compare a atividade do cliente X com a do cliente Y.",
    );
  }

  // "Compare a prioridade Alta com a prioridade Baixa." (achado testando o
  // lote de perguntas ao vivo): pedido de comparação entre 2 valores de
  // PRIORIDADE (ou STATUS) — nenhum dos 4 extratores de comparação acima
  // (operador/cliente/área/departamento) bate, essa dimensão nunca teve
  // suporte de comparação. Sem este guard, a frase caía mais abaixo em
  // detectaContradicao (que lê "prioridade Alta" + "prioridade Baixa" como
  // 2 valores EXIGIDOS ao mesmo tempo, não como uma comparação pedida) e
  // devolvia uma mensagem de categoria errada ("duas coisas que não podem
  // ser verdade ao mesmo tempo"), confusa pra um pedido que na verdade é
  // uma comparação válida, só que de uma dimensão sem suporte. Checado
  // DEPOIS de todos os extratores reais acima, pra não interceptar uma
  // comparação de operador/cliente/área/departamento que só MENCIONE
  // prioridade/status de passagem como qualificador (ex.: "...considerando
  // só prioridade alta").
  const mencionaComparacaoPrioridadeOuStatus =
    /\bcompar[ae]\b/.test(text) && /\bprioridades?\b|\bstatus\b/.test(text);

  if (mencionaComparacaoPrioridadeOuStatus) {
    return createClarificationDecision(
      "esclarecimento_comparacao_dimensao_nao_suportada",
      "Só consigo comparar operadores, clientes, áreas ou departamentos — não comparo valores de prioridade ou status diretamente. Pode perguntar a contagem de cada valor separadamente?"
        + "\n\nExemplos:\n"
        + "- Quantos tickets têm prioridade Alta?\n"
        + "- Quantos tickets têm prioridade Baixa?",
    );
  }

  // "Liste os tickets do Fábio e da Ana." (achado testando o lote de
  // perguntas ao vivo): união de 2 operadores/clientes com "e" — cada
  // tool só filtra por 1 operador/1 cliente (campo de texto único), então
  // "do Fábio e da Ana" inteiro virava um nome-lixo capturado ("Fábio e da
  // Ana"), que nunca bate por substring com nenhum contact_name/operador
  // real. Checado DEPOIS das comparações de verdade acima (que usam "com a
  // do"/"e com a do", não "e d[oa]" direto — não colide) — mesma ideia do
  // "status X ou Y"/"prioridades X e Y" já recusados honestamente em vez
  // de silenciosamente quebrados.
  // "Quantos tickets o Fábio E O Rodrigo trataram juntos essa semana?"
  // (achado testando o lote de perguntas ao vivo): a checagem original só
  // reconhecia a conexão "e do"/"e da" (a forma mais comum quando se repete
  // "do/da" antes do 2º nome, ex. "do Fábio e da Ana") — "e o"/"e a" (sem
  // repetir "do/da", ex. "o Fábio e o Rodrigo") escapava.
  // NÃO generalizar pra "\be\b" solto (tentado e revertido rodando a suíte):
  // sobrenome composto real do catálogo ("Rogerio Da Silva E Souza") também
  // tem um "e" solto no meio, sem ser união nenhuma — "e" sozinho não é
  // sinal confiável. O que distingue união de sobrenome composto é o que
  // vem DEPOIS do "e": um artigo ("o"/"a"/"do"/"da") introduzindo um 2º
  // nome, nunca mais um pedaço do mesmo nome.
  const operadorPareceUniao = operador !== undefined && /\be\s+(?:o|a|do|da)\b/u.test(normalizeText(operador));
  const clientePareceUniao = cliente !== undefined && /\be\s+(?:o|a|do|da)\b/u.test(normalizeText(cliente));

  if (operadorPareceUniao || clientePareceUniao) {
    return createClarificationDecision(
      "esclarecimento_uniao_operador_cliente",
      "Essa pergunta parece pedir tickets de mais de um operador/cliente ao mesmo tempo — hoje só consigo filtrar por um de cada vez. Pode perguntar sobre cada um separadamente?"
        + "\n\nExemplos:\n"
        + "- Tickets do operador Fulano.\n"
        + "- Tickets do cliente Acme.",
    );
  }

  // "Tickets abertos na área de TI OU DE Redes." (achado testando o lote de
  // perguntas ao vivo): mesma ideia já aplicada a status mais acima — área/
  // departamento/operador/cliente são todos texto livre (sem conjunto fixo
  // pequeno pra listar nos exemplos, por isso a mensagem genérica), então
  // "ou" dentro do valor capturado nunca resolve como 1 valor real, só
  // falha em silêncio. Checado DEPOIS de todas as comparações de verdade
  // acima — "quem tem mais tickets: operador X OU operador Y?" já é uma
  // comparação válida reconhecida antes de chegar aqui, então "ou" só
  // sobra num valor final capturado quando NENHUMA comparação bateu (ou
  // seja, é mesmo uma união ambígua, não uma comparação com "ou" disfarçada
  // de união).
  const uniaoOuPorDimensao = [
    ["área", area],
    ["departamento", departamento],
    ["operador", operador],
    ["cliente", cliente],
  ].find(([, valor]) => valor !== undefined && /\bou\b/u.test(normalizeText(valor)));

  if (uniaoOuPorDimensao !== undefined) {
    const [nomeDimensao] = uniaoOuPorDimensao;

    return createClarificationDecision(
      "esclarecimento_uniao_valor",
      `Essa pergunta parece pedir mais de um(a) ${nomeDimensao} ao mesmo tempo — hoje só consigo filtrar por um valor de cada vez. Pode perguntar sobre cada um separadamente?`
        + "\n\nExemplos:\n"
        + "- Tickets da área Suporte.\n"
        + "- Tickets da área WEB.",
    );
  }

  // "Qual a diferença entre os status/prioridades/áreas/departamentos X e
  // Y?" (achado testando o lote de perguntas ao vivo — Complexas 1,
  // pergunta 17): pergunta CONCEITUAL (pede pra EXPLICAR o que cada valor
  // de catálogo significa), não uma consulta de dados — checado aqui, DEPOIS
  // das comparações de verdade acima (que exigem "carga"/"atividade"/"mais
  // tickets", nunca essa frase), pra não colidir com elas. Sem esse guard, a
  // extração de status tentava colar os dois nomes numa string só ("Em
  // atendimento e Em estudo"), que falhava a busca no catálogo e devolvia
  // "não encontrado" (confuso e duplicado) em vez de reconhecer
  // honestamente que o sistema não explica conceitos, só consulta dados.
  const isConceptualDimensionDiffQuestion = new RegExp(
    `\\bdiferen[cç]a\\s+entre\\s+(?:os\\s+|as\\s+)?(?:status|prioridades?|departamentos?|${AREA_SYNONYM_SOURCE}s?)\\b`,
    "u",
  ).test(text);

  // "O que significa SLA congelado?" (achado testando o lote de perguntas
  // ao vivo): mesma intenção conceitual do "diferença entre" acima, só com
  // outra construção ("o que significa/é X"). Sem este guard, "SLA
  // congelado" batia no gatilho de isCongeladoIntent e devolvia a listagem
  // de tickets congelados — como se a pergunta fosse pedir DADOS, quando na
  // verdade pede uma EXPLICAÇÃO do termo. Vocabulário restrito aos termos
  // de catálogo/domínio conhecidos (sla/congelado/vencido/status/
  // prioridade/área/departamento), pra não capturar "o que é o ticket
  // 1234?" (pergunta de dado de verdade) por engano.
  const isConceptualTermQuestion =
    /\bo\s+que\s+(?:significa|[ée]|quer\s+dizer)\b/.test(text)
    && new RegExp(
      `\\b(?:sla|congelad[oa]s?|vencid[oa]s?|atrasad[oa]s?|status|prioridade|${AREA_SYNONYM_SOURCE}|departamento)\\b`,
      "u",
    ).test(text);

  if (isConceptualDimensionDiffQuestion || isConceptualTermQuestion) {
    return createClarificationDecision(
      "esclarecimento_pergunta_conceitual",
      "Não consigo explicar o significado ou a diferença entre valores de catálogo (status, prioridade, área, departamento) — só consulto dados de tickets já existentes. Pode perguntar sobre tickets com um desses valores específicos?"
        + "\n\nExemplos:\n"
        + "- Quantos tickets estão com status Em atendimento?\n"
        + "- Tickets com status Em estudo.",
    );
  }

  // "Qual o ticket mais caro?" / "Qual o tempo médio de resolução dos
  // tickets?" (achado testando o lote de perguntas ao vivo): pedem um
  // atributo que não existe no sistema (preço/custo de ticket, duração
  // média de resolução) — sem nenhuma entidade forte capturada, a pergunta
  // caía no fallback genérico de listagem (sem filtro nenhum), como se
  // "mais caro"/"tempo médio" tivesse sido entendido e silenciosamente
  // ignorado. Mesma lógica honesta de isConceptualTermQuestion acima, só
  // que pra uma MÉTRICA inexistente em vez de uma definição de termo.
  // Vocabulário restrito a frases específicas (não a palavra "custo"/
  // "preço" solta em qualquer canto), pra não interceptar uma busca de
  // texto livre legítima que mencione esses termos de outro jeito (ex.:
  // "busque tickets sobre o custo do projeto X").
  const isUnsupportedMetricQuestion =
    /\b(?:mais|menos)\s+car[oa]s?\b/.test(text)
    || /\bqual\s+(?:o\s+|a\s+)?(?:pre[çc]o|custo)\b/.test(text)
    || /\bpre[çc]o\s+(?:m[ée]dio|total)\b/.test(text)
    || /\btempo\s+m[ée]dio\b/.test(text)
    || /\bm[ée]dia\s+de\s+tempo\b/.test(text)
    || /\bdura[çc][ãa]o\s+m[ée]dia\b/.test(text)
    || /\bsla\s+m[ée]dio\b/.test(text)
    // "Qual o ticket com mais comentários?" (achado testando o lote de
    // perguntas ao vivo): mesma família de atributo inexistente — não há
    // contagem de comentários exposta em nenhuma tool.
    || /\b(?:mais|menos)\s+coment[áa]rios\b/.test(text);

  if (isUnsupportedMetricQuestion) {
    return createClarificationDecision(
      "esclarecimento_metrica_nao_suportada",
      "Não tenho dados de preço/custo de ticket, nem calculo médias de tempo — só consigo contar e filtrar tickets por status, prioridade, área, departamento, operador, cliente ou período. Pode perguntar usando um desses filtros?"
        + "\n\nExemplos:\n"
        + "- Quantos tickets estão com prioridade Alta?\n"
        + "- Tickets abertos na área Suporte.",
    );
  }

  // "Qual departamento tem o DOBRO de tickets do outro?" (achado testando o
  // lote de perguntas ao vivo): pergunta por uma PROPORÇÃO entre 2 valores
  // (dobro/metade/triplo), não por uma contagem absoluta — nenhuma tool
  // calcula proporção entre 2 entidades (cada uma só devolve sua própria
  // contagem, isolada). Sem este guard, a frase inteira virava um
  // nome-lixo capturado (ex.: departamento: "tem o dobro de tickets do
  // outro"), que nunca resolve no catálogo real — mesma lógica honesta de
  // isUnsupportedMetricQuestion acima, só que pra uma OPERAÇÃO entre 2
  // valores em vez de um atributo que não existe.
  const isRatioComparisonQuestion =
    /\bo\s+dobro\s+de\b/.test(text)
    || /\ba\s+metade\s+de\b/.test(text)
    || /\bo\s+triplo\s+de\b/.test(text);

  if (isRatioComparisonQuestion) {
    return createClarificationDecision(
      "esclarecimento_proporcao_nao_suportada",
      "Não calculo proporção entre dois valores (dobro/metade/triplo) — só consigo dar a contagem absoluta de cada um, separadamente. Pode perguntar o total de cada um, ou pedir uma comparação lado a lado?"
        + "\n\nExemplos:\n"
        + "- Quantos tickets o departamento Suporte tem?\n"
        + "- Compare o departamento Suporte com o departamento Financeiro.",
    );
  }

  // "ainda não fechado"/"não encerrado"/"não resolveu"/"não fechou" (formas
  // adjetiva e verbal) significam aberto, mas contêm palavras que indicariam
  // fechado — tratadas à parte, negando isFechadoIntent e alimentando
  // isAbertoIntent. Calculado cedo (antes do bloco de resumos) porque
  // resumo_tickets_por_operador também usa a situação aberto/fechado.
  // Além de "não" (com estar/foi/foram opcional), "diferente de"/"exceto"
  // antes do verbo de fechamento significam exatamente a mesma coisa
  // ("status diferente de encerrado" = "não encerrado") — fechado/aberto é
  // uma dimensão de 2 valores só, então negar um dos dois SEMPRE resolve
  // pro outro sem ambiguidade (diferente de área/prioridade/operador/status
  // literal, que têm N valores possíveis — ver detectaNegacaoNaoSuportada
  // abaixo, que trata esses casos como "não suportado" em vez de inverter).
  // "sem contar"/"tirando" (achado testando o lote de perguntas ao vivo —
  // Img 13) são a mesma ideia de exclusão em outro idioma comum: "quantos
  // tickets o Fulano tratou, SEM CONTAR os fechados?" também significa
  // "aberto", mas não batia em nenhum marcador antes — o sistema lia
  // "fechados" como filtro POSITIVO (o oposto do pedido), já que só
  // "não"/"diferente de"/"exceto" eram reconhecidos como negação.
  // "sem" SOZINHO, "excluindo", "tira"/"tire" e "menos" + artigo (achado
  // testando o lote de perguntas ao vivo): esta fonte é uma 2ª lista de
  // marcadores de negação, PARALELA a NEGATION_MARKER_SOURCE (module-level,
  // usada por detectaNegacaoNaoSuportada/extractTicketStatusName mais
  // abaixo) — as 2 foram crescendo em momentos diferentes e saíram
  // dessincronizadas: cada sinônimo novo ("excluindo", "tira"/"tire",
  // "menos X") entrava só na outra lista, nunca aqui. Resultado: "Tickets
  // EXCLUINDO OS FECHADOS."/"...MENOS OS FECHADOS?" nunca batiam em
  // NEGATED_CLOSED_SOURCE, e isNegatedClosed ficava false — isFechadoIntent
  // continuava true, roteando pro OPOSTO exato do pedido (lista só os
  // fechados, em vez de excluí-los). Mesmo cuidado do "menos" na outra
  // lista: exige um artigo logo depois, pra não colidir com ranking
  // ascendente ("operador com MENOS tickets") nem limiar numérico ("MENOS
  // de 30 dias").
  const NEGATION_PREFIX_SOURCE =
    "(?:nao\\s+(?:esta\\s+|estao\\s+|foi\\s+|foram\\s+)?"
    + "|diferentes?\\s+de\\s+"
    + "|excet[oa]\\s+(?:o\\s+|os\\s+|a\\s+|as\\s+)?"
    + "|sem\\s+(?:contar\\s+)?(?:o\\s+|os\\s+|a\\s+|as\\s+)?"
    + "|tirando\\s+(?:o\\s+|os\\s+|a\\s+|as\\s+)?"
    + "|tira\\s+(?:o\\s+|os\\s+|a\\s+|as\\s+)?"
    + "|tire\\s+(?:o\\s+|os\\s+|a\\s+|as\\s+)?"
    + "|excluindo\\s+(?:o\\s+|os\\s+|a\\s+|as\\s+)?"
    + "|ignorando\\s+(?:o\\s+|os\\s+|a\\s+|as\\s+)?"
    + "|ignor[ae]\\s+(?:o\\s+|os\\s+|a\\s+|as\\s+)?"
    + "|menos\\s+(?:o\\s+|a\\s+|os\\s+|as\\s+)?)";
  const NEGATED_CLOSED_SOURCE = `${NEGATION_PREFIX_SOURCE}${CLOSURE_VERB_SOURCE}`;
  const isNegatedClosed = new RegExp(`\\b${NEGATED_CLOSED_SOURCE}\\b`).test(text);

  // "foi aberto"/"foram abertos" é voz passiva pra dizer que o ticket foi
  // CRIADO num período (ex.: "quantos tickets foram abertos ano passado?"),
  // não que ele está com status em aberto agora — o período já é resolvido
  // à parte via extractDateRange/extractRelativeDateRange; aqui só evita que
  // isso vire (erradamente) um filtro de situação=aberto (o que faria
  // "aberto ano passado" exigir também estar aberto HOJE, quase sempre 0).
  const isCreationPassive = new RegExp(`\\b${CREATION_VERB_SOURCE}\\b`).test(text);

  const isAbertoIntent =
    (/\babert[oa]s?\b/.test(text) && !isCreationPassive)
    || /\bpendente/.test(text)
    || isNegatedClosed;

  // Item 7 do plano de correção da auditoria (achado B10): "resolveu"/
  // "concluiu"/"finalizou" são verbos genéricos do dia a dia, não exclusivos
  // do domínio de tickets — confirmado ao vivo: "A diretoria resolveu
  // trocar de fornecedor" (frase sem nenhuma relação com tickets) roteava
  // pra listar_tickets_fechados. Só conta como intenção de fechado quando a
  // frase também tem uma pista de que é sobre TICKETS: a palavra
  // ticket/chamado/atendimento/ocorrência/solicitação em qualquer forma, OU
  // outro filtro de ticket já extraído (área/departamento/operador/
  // prioridade/status/cliente/número) — como em "a área Suporte resolveu
  // essa semana" (sem a palavra "chamado", mas com "área" como pista clara).
  const hasTicketDomainContext =
    new RegExp(`\\b${TICKET_CONTEXT_SOURCE}\\b`, "u").test(text)
    || area !== undefined
    || departamento !== undefined
    || operador !== undefined
    || prioridade !== undefined
    || status !== undefined
    || cliente !== undefined
    || numero !== undefined;

  // "já deveriam ter sido resolvidos" (achado na auditoria de robustez,
  // F5): o verbo de fechamento aparece DENTRO do idioma modal de "vencido"
  // (SLA_MODAL_OVERDUE_SOURCE, acima) — sem este guard, isFechadoIntent
  // também bateria aqui e contaminaria `situacaoInequivoca` com "fechado"
  // mais abaixo, restringindo a busca de vencidos só aos JÁ fechados (o
  // oposto do sentido natural da frase, que é sobre os que CONTINUAM em
  // aberto e já deveriam ter sido resolvidos).
  const isModalVencido = new RegExp(`\\b${SLA_MODAL_OVERDUE_SOURCE}\\b`, "u").test(text);

  const isFechadoIntent =
    new RegExp(`\\b${CLOSURE_VERB_SOURCE}\\b`).test(text)
    && !isNegatedClosed
    && !isModalVencido
    && hasTicketDomainContext;

  // Hoisted pra cima do que era a posição original (mais abaixo, cada um no
  // próprio bloco `if`) porque o detector de negação (mais abaixo) e o de
  // termo ambíguo "parado" (item 4 do plano de correção) precisam saber se
  // uma intenção mais específica já resolveu a palavra antes de decidir se
  // vale a pena pedir esclarecimento.
  const isCongeladoIntent =
    /\bcongelad/.test(text)
    || /\btravad/.test(text)
    || /\bparalisad/.test(text)
    // "emperrado" (achado testando o lote de perguntas ao vivo — Lote extra
    // 1, pergunta 23): mesma família coloquial de "travado"/"parado" pra
    // dizer que um ticket está sem progresso — sem esse sinônimo, "Tickets
    // emperrados há muito tempo" não batia em nenhuma entidade e caía no
    // fallback de listar_tickets sem filtro nenhum.
    || /\bemperrad/.test(text)
    || /\b(?:sla|relogio|tempo|prazo)\s+(?:parad[oa]|pausad[oa]|suspens[oa])\b/.test(text);

  const isSemOperadorIntent =
    /\bsem\s+(?:operador|responsavel|atendente|dono)\b/.test(text)
    || /\bsem\s+ninguem\b/.test(text)
    || /\bnao\s+(?:foi\s+|foram\s+|esta\s+|estao\s+)?atribuid/.test(text)
    // "não tem operador"/"não têm responsável" — negação do verbo "ter", não
    // só de "atribuído" (ex.: "quantos tickets não têm operador?").
    || /\bnao\s+tem\s+(?:operador|responsavel|atendente)\b/.test(text)
    || /\bninguem\s+(?:e\s+)?(?:responsavel|pegando|atendendo|cuidando|resolvendo)\b/.test(text)
    // "atendido(s)/resolvido(s)/tratado(s) POR NINGUÉM" (achado testando o
    // lote de perguntas ao vivo — Img 8) é a mesma ideia do padrão acima,
    // só com o verbo antes de "ninguém" em vez de depois — ordem de frase
    // comum que ainda não estava coberta.
    || /\bpor\s+ninguem\b/.test(text)
    || /\baguardando\s+atribuicao\b/.test(text)
    // "nunca foi/foram atendido(s)/tratado(s)" (achado testando o lote de
    // perguntas ao vivo): mesmo sentido de "sem operador"/"ninguém
    // atendendo" (ticket que nunca teve atenção de ninguém), só com outra
    // construção — sem este sinônimo, "Tickets abertos nunca foram
    // atendidos." não batia em nenhuma entidade e caía no filtro genérico
    // de abertos, perdendo o refinamento "nunca atendido" por completo.
    || /\bnunca\s+(?:foi|foram)\s+(?:atendid[oa]s?|tratad[oa]s?)\b/.test(text);

  // "Mais antigo"/"mais velho"/"há mais tempo" pede ordem cronológica —
  // não necessariamente estourou o SLA. Fica separado da intenção de
  // "vencido"/"atrasado" abaixo, que agora usa o SLA real por ticket (ver
  // listar_tickets_vencidos em src/server.js), não mais um proxy.
  const mentionsMaisAntigo =
    /\bmais\s+antig/.test(text)
    || /\bmais\s+velh/.test(text)
    || /\bha\s+mais\s+tempo\b/.test(text);

  // Achado ao vivo + decisão explícita do usuário: "mais antigo" sozinho
  // (SEM a palavra "aberto" na frase) restringia a busca aos ainda não
  // encerrados por padrão — "Quais os tickets mais antigos?" (sem
  // "abertos") deve varrer TODOS os status (listar_tickets_mais_antigos,
  // isOldestOverallIntent mais abaixo), não só os em aberto. Só vira
  // "abertos mais antigos" quando a frase TAMBÉM qualifica com "aberto"
  // ("tickets ABERTOS mais antigos", "mais antigos ainda ABERTOS", "estão
  // ABERTOS há mais tempo").
  const isOldestOpenIntent = mentionsMaisAntigo && isAbertoIntent;

  // "Atrasado"/"vencido"/"estourado" agora usam o SLA real (result_sla_
  // response/result_sla_solution) por ticket, em vez do proxy antigo de
  // "aberto mais antigo" — achado do usuário: um ticket pode estourar o
  // SLA e DEPOIS ser encerrado, então restringir a busca a só os abertos
  // escondia esses casos.
  const isSlaVencidoIntent = new RegExp(`\\b${OLDEST_PROXY_STATE_SOURCE}\\b`, "u").test(text);

  // Item 3 do plano de correção da auditoria: nenhuma tool MCP (nem a API
  // por trás delas) sustenta "excluir X" — hoje "sem prioridade urgente" /
  // "exceto os cancelados" / "diferente de X" filtram pelo valor CITADO,
  // exatamente o oposto do pedido (achado B3/F, confirmado ao vivo). Em vez
  // de inverter o filtro (impossível de fazer com segurança — negar
  // "urgente" não diz se o usuário quer alta+média+baixa, ou só uma delas)
  // ou de ignorar a negação em silêncio, o sistema avisa honestamente que
  // não sustenta isso. NÃO reage aos 2 idiomas que já são tratados como
  // intenção própria e correta: negação de fechado (vira aberto, acima) e
  // "sem operador"/"não atribuído" (vira isSemOperadorIntent).
  // "tirando"/"sem contar" (achado testando o lote de perguntas ao vivo —
  // Img 11): "Quantos tickets tem, TIRANDO os cancelados?" capturava
  // status: "Cancelado" como filtro POSITIVO (o oposto do pedido) e nem
  // caía aqui, porque nenhum marcador reconhecia "tirando" como negação —
  // mesma classe de idioma já coberta em NEGATION_PREFIX_SOURCE acima, só
  // que "cancelado" não é um valor de 2 opções só (status literal tem N
  // valores possíveis), então aqui o tratamento certo é o esclarecimento,
  // não inverter.
  // NEGATION_MARKER_SOURCE agora é module-level (ver extractTicketStatusName
  // acima) — reaproveitada aqui, não redeclarada.
  const NEGATION_MARKER_PATTERN = new RegExp(`\\b${NEGATION_MARKER_SOURCE}\\b`, "u");
  const LEADING_NEGATION_PATTERN = new RegExp(`^${NEGATION_MARKER_SOURCE}\\b`, "iu");

  // true quando existe um marcador de negação nas ~5 palavras ANTES do
  // trecho (needle) dentro do texto normalizado — cobre "que NÃO seja
  // urgente", "NÃO pertencentes ao departamento X", "tickets urgentes NÃO
  // estão atrasados".
  function hasNegationBefore(haystack, needle) {
    if (!needle) {
      return false;
    }

    // Busca por PALAVRA INTEIRA, não substring crua (achado testando o lote
    // de perguntas ao vivo): "Tickets abertos, EXCETO OS DA ÁREA DE TI." nunca
    // detectava a negação porque haystack.indexOf("ti") achava o "ti"
    // escondido dentro da primeira palavra da frase ("TIckets"!), bem antes
    // do "TI" de verdade — a janela calculada a partir desse índice errado
    // ficava vazia (slice(0, 0)), sem nenhuma chance de conter o marcador
    // "exceto" que vem bem mais adiante.
    // "\\b" só no INÍCIO; no fim, "s?(?![\\p{L}\\p{N}])" em vez de "\\b"
    // (achado rodando a suíte depois desta mesma correção): um "\\b" nos 2
    // lados rejeitava "cancelado" dentro de "cancelados" (plural) — mesma
    // forma como "ti" ficava preso dentro de "tickets", a troca/s continua
    // sendo caractere de palavra, sem fronteira — quebrando "Tickets
    // DIFERENTES DE cancelados." (status já resolvido como "Cancelado",
    // singular, contra o texto real no plural). O "s" opcional cobre o
    // plural regular mais comum em português sem abrir mão da proteção
    // contra "ti" dentro de "tickets" (ali não há "s" logo depois, o
    // próximo caractere é "c", que ainda é letra — a verificação final
    // continua rejeitando).
    const needleEscapado = needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const match = new RegExp(`\\b${needleEscapado}s?(?![\\p{L}\\p{N}])`, "u").exec(haystack);

    if (match === null) {
      return false;
    }

    // Janela de 10 palavras (não mais 5) — achado testando o lote de
    // perguntas ao vivo: "sem contar OS QUE JÁ FORAM ATENDIDOS PELO
    // Helpdesk" tem uma oração relativa de 6 palavras entre o marcador de
    // negação e o nome capturado, mais larga que qualquer exemplo visto até
    // então ("que NÃO seja urgente" etc.) — a janela de 5 cortava "sem
    // contar" fora, perdendo a negação por completo.
    const janela = haystack.slice(0, match.index).trim().split(/\s+/u).slice(-10).join(" ");

    return NEGATION_MARKER_PATTERN.test(janela);
  }

  function detectaNegacaoNaoSuportada() {
    // "cliente" faltava nesta lista (achado testando o lote de perguntas ao
    // vivo): "Qual cliente abriu mais chamados, SEM CONTAR o cliente Acme?"
    // já extraía cliente:"Acme" certo (extractClientName), mas a negação
    // nunca era checada pra essa dimensão — a exclusão era descartada em
    // silêncio (resumo_por_cliente de TODOS os clientes, incluindo Acme) em
    // vez de recusada honestamente como as outras 5 dimensões já fazem.
    for (const valor of [area, departamento, operador, prioridade, status, cliente]) {
      if (valor === undefined) {
        continue;
      }

      const valorNormalizado = normalizeText(valor);

      // B1: "diferente de X"/"exceto X" às vezes vaza inteiro pro valor
      // capturado (ex.: operador: "diferente de João") — se o próprio valor
      // COMEÇA com o marcador, já é negação, sem precisar procurar antes.
      if (LEADING_NEGATION_PATTERN.test(valorNormalizado) || hasNegationBefore(text, valorNormalizado)) {
        return true;
      }
    }

    // "sem prioridade X" é negação (excluir X), diferente de "sem operador"
    // (estado — ninguém atribuído). Só conta quando um valor real foi
    // capturado depois de "prioridade" — não é a mesma pergunta que "sem
    // prioridade definida" (sem valor nenhum).
    if (prioridade !== undefined && /\bsem\s+prioridade\b/.test(text)) {
      return true;
    }

    if (isSlaVencidoIntent) {
      const match = new RegExp(`\\b${OLDEST_PROXY_STATE_SOURCE}\\b`, "u").exec(text);

      if (match && hasNegationBefore(text, match[0])) {
        return true;
      }
    }

    // "tirando os congelados" (achado testando o lote de perguntas ao vivo —
    // Lote extra 3, pergunta 14): diferente de fechado (que tem complemento
    // binário limpo — negar vira "aberto") e diferente de prioridade/status/
    // área/operador (já cobertos acima via valorNormalizado), "congelado" não
    // tem catálogo próprio nem complemento óbvio, e isCongeladoIntent reage
    // só à palavra solta, sem olhar se tem negação antes — "tirando os
    // congelados" virava o filtro POSITIVO de congelados (o oposto exato do
    // pedido), em vez de recusar honestamente como as outras exclusões sem
    // inversão segura.
    if (isCongeladoIntent) {
      const match = /\b(?:congelad\w*|travad\w*|paralisad\w*|emperrad\w*)\b/u.exec(text);

      if (match && hasNegationBefore(text, match[0])) {
        return true;
      }
    }

    // "Tickets abertos pela Ana Paula, EXCETO os de hoje." (achado testando
    // o lote de perguntas ao vivo): dataInicio/dataFim vêm de um mecanismo
    // totalmente separado (extractRelativeDateRange), nunca checado contra
    // negação — "exceto os de hoje" resolvia "hoje" normalmente e virava um
    // filtro de data POSITIVO (só hoje), o oposto exato do pedido (tudo,
    // exceto hoje). Vocabulário restrito aos períodos mais comuns de
    // aparecer negados na fala (hoje/ontem/amanhã/essa semana/esse mês/esse
    // ano) — períodos mais raros de negar (ex.: "exceto o mês passado") não
    // estão cobertos aqui, mesma lógica de escopo conservador já usada
    // pelos outros casos especiais acima (SLA vencido, congelado).
    if (dataInicio !== undefined || dataFim !== undefined) {
      const match = /\b(?:hoje|ontem|amanh[ãa]|(?:d|n)?(?:ess[ae]|est[ae])\s+semana|(?:d|n)?(?:esse|este)\s+m[êe]s|(?:d|n)?(?:esse|este)\s+ano)\b/u.exec(
        text,
      );

      if (match && hasNegationBefore(text, match[0])) {
        return true;
      }
    }

    // "Tickets com prioridade Alta, mas SEM CONTAR os urgentes." (achado
    // testando o lote de perguntas ao vivo): "urgente" é tratado como
    // palavra solta (não tem a forma "<nível> prioridade", por isso fica de
    // fora de PRIORITY_LEVEL_LITERAL_PATTERNS — ver detectaContradicao mais
    // abaixo), então o loop de valorNormalizado acima (que só olha o valor
    // JÁ RESOLVIDO, "Alta") nunca percebe a negação em "urgentes". Sem este
    // guard, detectaContradicao tratava a frase como CONTRADIÇÃO (duas
    // prioridades ao mesmo tempo) em vez do que ela realmente pede: excluir
    // um valor — mesma família de "sem operador"/"excluindo cancelados" já
    // tratada aqui, não uma contradição.
    if (prioridade !== undefined && normalizeText(prioridade) !== "urgente") {
      const match = /\burgentes?\b/u.exec(text);

      if (match && hasNegationBefore(text, match[0])) {
        return true;
      }
    }

    return false;
  }

  if (!isNegatedClosed && !isSemOperadorIntent && detectaNegacaoNaoSuportada()) {
    return createClarificationDecision(
      "esclarecimento_negacao",
      "Não consigo filtrar excluindo um valor (\"diferente de\"/\"exceto\"/\"não\" aplicado a status, área, departamento, operador, prioridade ou prazo) — as consultas disponíveis só filtram por um valor específico citado, não por exclusão. Pode reformular dizendo exatamente qual valor você quer ver?"
        + "\n\nExemplos:\n"
        + "- Quantos tickets estão com prioridade Alta?\n"
        + "- Tickets abertos na área Suporte.",
    );
  }

  // "Resumo por cliente, mas sem contar o Fabio Gali e o Diego Mota."
  // (achado testando o lote de perguntas ao vivo): negação de 2+ nomes
  // próprios específicos (ver matchesExclusaoDeNomes acima) — checado à
  // parte de detectaNegacaoNaoSuportada() porque aqui nenhum valor chega a
  // ser capturado em area/departamento/operador/prioridade/status/cliente
  // (os extratores de nome único não esperam "e" no meio), então aquela
  // função não tinha nada pra negar e a exclusão era ignorada por completo.
  if (matchesExclusaoDeNomes(pergunta)) {
    return createClarificationDecision(
      "esclarecimento_negacao",
      "Não consigo excluir 2 ou mais nomes/valores específicos ao mesmo tempo — as consultas disponíveis só filtram por um valor citado, não por exclusão de uma lista. Pode perguntar sobre cada um separadamente?"
        + "\n\nExemplos:\n"
        + "- Quantos tickets o cliente Fabio Gali tem?\n"
        + "- Resumo de tickets por cliente.",
    );
  }

  // Achado P6 da auditoria end-to-end: perguntas com 2 valores mutuamente
  // exclusivos da mesma dimensão (ex.: "tickets urgentes de baixa
  // prioridade", "tickets encerrados que estão em atendimento") eram
  // resolvidas silenciosamente pra um dos dois lados, sem avisar da
  // contradição — confirmado ao vivo nos dois casos.
  function detectaUniaoDePrioridades() {
    if (prioridade === undefined) {
      return false;
    }

    // "Tickets com prioridade Urgente ou Alta." (achado testando o lote de
    // perguntas ao vivo): forma COMPACTA, com a palavra "prioridade" dita
    // só 1 vez — PRIORITY_LEVEL_UNIAO_PATTERNS (abaixo) só reconhece a
    // palavra "prioridade" REPETIDA perto de cada nível (ex.: "urgentes e
    // de alta prioridade"), então essa forma mais curta e comum escapava
    // por completo: extractPriorityName capturava "Urgente ou Alta"
    // inteiro como se fosse 1 valor só (nunca bate no catálogo real,
    // devolvendo silenciosamente "nenhum ticket encontrado"). Checado
    // direto contra o próprio valor JÁ CAPTURADO (não a frase inteira),
    // então não depende de "prioridade" aparecer de novo em lugar nenhum.
    if (PRIORIDADE_UNIAO_COMPACTA_PATTERN.test(normalizeText(prioridade))) {
      return true;
    }

    return PRIORITY_LEVEL_UNIAO_PATTERNS.some(
      ([pattern, nivel]) => pattern.test(text) && normalizeText(nivel) !== normalizeText(prioridade),
    );
  }

  function detectaContradicao() {
    // Prioridade: o valor já resolvido (via "urgente"/"crítico" solto ou
    // "prioridade X" direto) conflita com uma menção explícita "<nível>
    // prioridade" de nível diferente na mesma frase — mas só quando não é o
    // caso de união (conector "e", tratado antes, à parte).
    if (prioridade !== undefined && !detectaUniaoDePrioridades()) {
      for (const [pattern, nivel] of PRIORITY_LEVEL_LITERAL_PATTERNS) {
        if (pattern.test(text) && normalizeText(nivel) !== normalizeText(prioridade)) {
          return true;
        }
      }

      // "urgente" não tem forma "<nível> prioridade" (é uma palavra solta,
      // por isso fica fora de PRIORITY_LEVEL_LITERAL_PATTERNS) — mas
      // precisa do mesmo check simétrico: achado testando o lote de
      // perguntas ao vivo, "Tickets URGENTES de BAIXA prioridade." (prioridade
      // resolvida = "Baixa", via a forma invertida "baixa prioridade" que
      // extractPriorityName agora também reconhece) deixava de disparar
      // contradição nenhuma, porque "urgente" nunca era comparado contra o
      // valor já resolvido quando ELE NÃO é o valor vencedor.
      // Só dispara quando o valor resolvido é EXATAMENTE um dos 3 níveis
      // nomeados (não qualquer string != "urgente") — "prioridade" sozinho
      // depois de "por"/"quantos tickets por prioridade" (conector de
      // dimensão, sem valor nenhum) já é capturado (erradamente, bug à
      // parte, não desta correção) como um valor "sujo" por
      // extractPriorityName; comparar contra ele cegamente geraria falso
      // positivo sempre que "urgente" aparecesse em qualquer lugar da
      // frase (ex.: um marcador de continuação "só os Urgente" no fim).
      if (
        /\burgentes?\b/.test(text)
        && ["baixa", "media", "alta"].includes(normalizeText(prioridade))
      ) {
        return true;
      }
    }

    // Situação: todo status literal reconhecido (STATUS_LITERAL_PATTERNS)
    // representa um estado NÃO fechado (fechado/encerrado é tratado à parte
    // via closure_date, nunca entra nessa lista, ver comentário na
    // declaração) — se a frase também pede "fechado"/"encerrado", as duas
    // coisas nunca podem ser verdade ao mesmo tempo.
    if (isFechadoIntent && status !== undefined) {
      return true;
    }

    return false;
  }

  if (detectaUniaoDePrioridades()) {
    return createClarificationDecision(
      "esclarecimento_uniao_prioridades",
      "Essa pergunta parece pedir tickets de mais de uma prioridade ao mesmo tempo (ex.: \"urgentes e de alta prioridade\") — hoje só consigo filtrar por uma prioridade de cada vez, não várias juntas. Pode perguntar sobre cada prioridade separadamente?"
        + "\n\nExemplos:\n"
        + "- Tickets com prioridade Urgente.\n"
        + "- Tickets com prioridade Alta.",
    );
  }

  if (detectaContradicao()) {
    return createClarificationDecision(
      "esclarecimento_contradicao",
      "Essa pergunta parece pedir duas coisas que não podem ser verdade ao mesmo tempo (por exemplo, duas prioridades diferentes, ou um status que não combina com \"fechado\"/\"encerrado\"). Pode reformular dizendo só o que você quer ver?"
        + "\n\nExemplos:\n"
        + "- Tickets com prioridade Urgente.\n"
        + "- Tickets com status Aguardando cliente.",
    );
  }

  // Item 4 do plano de correção: "parado" sozinho, sem nenhum qualificador
  // por perto, é ambíguo no domínio (pode ser SLA congelado, sem operador,
  // ou só "ticket antigo") — hoje era ignorado em silêncio (virava
  // listar_tickets sem filtro nenhum, sem avisar que a palavra não foi
  // interpretada). Só dispara quando NENHUMA intenção mais específica já
  // resolveu a palavra (SLA parado → congelado; "ninguém... parado" → sem
  // operador).
  const hasAmbiguousParado =
    /\bparad[oa]s?\b/.test(text) && !isCongeladoIntent && !isSemOperadorIntent;

  if (hasAmbiguousParado) {
    return createClarificationDecision(
      "esclarecimento_termo_ambiguo",
      "\"Parado\" pode significar SLA congelado, sem operador atribuído ou só o ticket mais antigo em aberto — pode dizer qual dessas situações você quer ver?"
        + "\n\nExemplos:\n"
        + "- Tickets com SLA congelado.\n"
        + "- Tickets sem operador atribuído.\n"
        + "- Ticket mais antigo em aberto.",
    );
  }

  // Situação só é definida quando a frase menciona aberto/fechado de forma
  // inequívoca — usada tanto no resumo por operador quanto em "mais
  // recentes"; se mencionar as duas, segue sem filtro de situação.
  const situacaoInequivoca =
    isFechadoIntent && !isAbertoIntent
      ? "fechado"
      : isAbertoIntent && !isFechadoIntent
        ? "aberto"
        : undefined;

  // "sem prioridade definida/atribuída/informada/especificada" (achado
  // testando o lote de perguntas ao vivo — Complexas 1, pergunta 14): não é
  // "por X"/"cada X" nem ranking, então mentionsDimension (abaixo) não
  // reconhecia — a pergunta caía num listar_tickets genérico sem filtro
  // nenhum, em vez do resumo por prioridade (que mostraria o balde "não
  // informada", 0 nos dados reais de hoje — todo ticket já tem prioridade).
  const mentionsPriorityUnsetPhrase = new RegExp(
    `\\bsem\\s+prioridade\\s+${UNSET_VALUE_ADJECTIVE_SOURCE}\\b`,
    "u",
  ).test(text);

  // "sem área definida" (achado testando o lote de perguntas ao vivo):
  // mesma ideia do pedido de prioridade "vazia" acima, pra área — resumo_
  // tickets_por_area já devolve um balde "não informada" pros tickets sem
  // área (confirmado ao vivo), então vale rotear pra lá em vez do fallback
  // de listagem sem filtro nenhum.
  const mentionsAreaUnsetPhrase = new RegExp(
    `\\bsem\\s+${AREA_SYNONYM_SOURCE}\\s+${UNSET_VALUE_ADJECTIVE_SOURCE}\\b`,
    "u",
  ).test(text);

  const mentionsStatusDimension = mentionsDimension(text, "status");
  const mentionsPriorityDimension = mentionsDimension(text, "prioridades?") || mentionsPriorityUnsetPhrase;
  const mentionsAreaDimension = mentionsDimension(text, `${AREA_SYNONYM_SOURCE}s?`) || mentionsAreaUnsetPhrase;
  // USER_LOOKUP_NOUN_SOURCE (não só "operador(es)" literal) — achado
  // testando o lote de perguntas ao vivo: "Qual TÉCNICO fechou mais
  // chamados essa semana?" não reconhecia "técnico" como a dimensão de
  // ranking (só "operador"/"operadores" eram aceitos aqui, apesar de
  // técnico/atendente/responsável/usuário já serem sinônimos aceitos em
  // todo o resto do arquivo) — a pergunta caía em listar_tickets_fechados
  // genérico, perdendo o ranking por operador por completo.
  const mentionsOperatorDimension = mentionsDimension(text, `(?:${USER_LOOKUP_NOUN_SOURCE})(?:es|s)?`);
  const mentionsDepartmentDimension = mentionsDimension(text, "departamentos?");
  const mentionsClienteDimension = mentionsDimension(text, `${CLIENT_LOOKUP_NOUN_SOURCE}s?`);

  // "Resumo por área." → "e por operador?" (achado testando continuação
  // multi-turno ao vivo): o marcador "e por X" (agent/continuation.js) existe
  // justamente pra RE-AGRUPAR por outra dimensão em cima do mesmo contexto —
  // mas o texto mesclado fica com os 2 conectores "por área" (turno 1) E
  // "por operador" (turno 2) ao mesmo tempo, e os 6 branches abaixo sempre
  // checam na mesma ordem fixa (status, prioridade, área, operador,
  // departamento, cliente), então "área" (mencionada primeiro) sempre
  // vencia — o oposto exato do que o usuário acabou de pedir no 2º turno.
  // Acha o conector "por/em cada/cada X" mencionado MAIS TARDE no texto (não
  // conta a forma de ranking, só a conectora — um "X com mais tickets" sem
  // "por" não é um pedido explícito de agrupar por X, não compete aqui) e
  // usa ele pra decidir qual branch vence quando há mais de um. Quando só 1
  // conector aparece (o caso comum, de 1 turno só), undefined — todo branch
  // continua exigindo só o mentionsXDimension específico, igual antes.
  function ultimaDimensaoPorConector() {
    const candidatos = [
      ["status", "status"],
      ["prioridade", "prioridades?"],
      ["area", `${AREA_SYNONYM_SOURCE}s?`],
      ["operador", "operador(?:es)?"],
      ["departamento", "departamentos?"],
      ["cliente", `${CLIENT_LOOKUP_NOUN_SOURCE}s?`],
    ];

    let melhor;

    for (const [chave, fonte] of candidatos) {
      const regex = new RegExp(`\\b${DIMENSION_CONNECTOR_SOURCE}\\s+(?:${fonte})\\b`, "gu");
      let match = regex.exec(text);

      while (match !== null) {
        if (melhor === undefined || match.index > melhor.index) {
          melhor = { chave, index: match.index };
        }

        match = regex.exec(text);
      }
    }

    return melhor?.chave;
  }

  const dimensaoResumoMaisRecente = ultimaDimensaoPorConector();

  function permiteDimensaoResumo(chave) {
    return dimensaoResumoMaisRecente === undefined || dimensaoResumoMaisRecente === chave;
  }

  // F2 (auditoria de robustez): "Tickets por área."/"Tickets por status."
  // (sem nenhuma palavra de resumo) caíam no fallback genérico de listagem
  // em vez de resumo_tickets_por_X, porque hasResumoIntent exigia uma
  // palavra-gatilho PRÓPRIA além da frase conectora "por X"/"em cada X" que
  // mentionsDimension já reconhece. A forma de RANKING de mentionsDimension
  // ("área com mais tickets") já era coberta por RANKING_CUE_SOURCE logo
  // abaixo — só faltava a forma CONECTORA. Cada branch de resumo ainda exige
  // também o mentionsXDimension específico (ex.: `hasResumoIntent &&
  // mentionsAreaDimension`), então eles continuam mutuamente exclusivos por
  // construção — isso só evita que a frase conectora precise de uma 2ª
  // palavra-gatilho redundante.
  //
  // Guard necessário (achado rodando a suíte depois dessa mudança): "por X"
  // é ambíguo em português — "tickets POR ÁREA" (sozinho) é pedido de
  // distribuição, mas "tickets abertos POR ÁREA DE REDES" é um FILTRO
  // nomeado (mesma preposição, sentido de "na área chamada Redes"), não
  // pedido de resumo. A frase já extraiu "Redes" como `area` nesse 2º caso
  // — por isso só conta o conector quando a dimensão NÃO capturou um nome
  // específico junto (dimensão "solta" de verdade).
  const mentionsAnyDimensionConnector =
    (mentionsStatusDimension && status === undefined)
    || (mentionsPriorityDimension && prioridade === undefined)
    || (mentionsAreaDimension && area === undefined)
    || (mentionsOperatorDimension && operador === undefined)
    || (mentionsDepartmentDimension && departamento === undefined)
    || (mentionsClienteDimension && cliente === undefined);

  // Achado ao vivo: "Faz um gráfico de tickets por departamento" não tinha
  // nenhuma palavra de resumo (resumo/quantos/distribuição/...) — caía
  // inteiro no fallback genérico (buscar_por_texto/listar_tickets), sem
  // filtro nenhum. "Pedir um gráfico/tabela" de algo já implica, por si só,
  // um pedido de distribuição — por isso formatoPreferido também conta
  // como gatilho de resumo aqui. Só tem efeito quando mentionsXDimension
  // também bate (ex.: "por departamento"), então não hijacka listagens
  // comuns (que filtram por um nome específico, não pela palavra solta da
  // dimensão).
  // "3 piores operadores"/"2 melhores técnicos" (achado testando o lote de
  // perguntas ao vivo): forma ADJETIVO + SUBSTANTIVO ("piores operadores"),
  // ao contrário de mentionsDimension (que exige o substantivo ANTES do cue
  // de ranking, ex.: "operadores com mais tickets") — sem isso, "Lista os 3
  // piores operadores em atendimento esse mês." caía num listar_tickets
  // genérico, perdendo o ranking inteiro (o "3" também era descartado, ver
  // correção irmã em extractLimit/routing-utils.js). "pior" é o mesmo
  // sentido ascendente de "menos"/"menor" (pior = menor volume de tickets
  // atendidos), "melhor" o sentido descendente de "mais"/"maior" — mesma
  // leitura de ordemRanking mais abaixo.
  const isWorstBestOperatorRankingIntent = new RegExp(
    `\\b(?:pior(?:es)?|melhor(?:es)?)\\s+(?:${USER_LOOKUP_NOUN_SOURCE})(?:es|s)?\\b`,
    "u",
  ).test(text);

  // Mesma ideia de isWorstBestOperatorRankingIntent acima, mas pra CLIENTE
  // (achado testando o lote de perguntas ao vivo, com dados reais): "Quais
  // os 2 piores clientes em volume de chamados essa semana?" não batia em
  // nenhum gatilho de resumo (mentionsClienteDimension só reconhece a forma
  // "cliente com mais/menos tickets", substantivo ANTES do cue de ranking —
  // não "piores clientes", adjetivo ANTES) — a pergunta inteira caía num
  // listar_tickets genérico, sem ranking nem filtro de cliente nenhum.
  const isWorstBestClienteRankingIntent = new RegExp(
    `\\b(?:pior(?:es)?|melhor(?:es)?)\\s+(?:${CLIENT_LOOKUP_NOUN_SOURCE})(?:es|s)?\\b`,
    "u",
  ).test(text);

  const hasResumoIntent =
    /\bresumo\b/.test(text)
    || /\bdistribuicao\b/.test(text)
    || /\bquantidade\b/.test(text)
    || /\bquantos\b/.test(text)
    || /\bquantas\b/.test(text)
    || /\bcontagem\b/.test(text)
    || /\btop\s+\d+\b/.test(text)
    || formatoPreferido !== undefined
    || new RegExp(`\\b${RANKING_CUE_SOURCE}\\b`).test(text)
    || mentionsAnyDimensionConnector
    || isWorstBestOperatorRankingIntent
    || isWorstBestClienteRankingIntent;

  // "Quem tem mais chamados...?" / "Quem mais tem...?" (ordem invertida) /
  // "Quem tem menos...?" já implicam ranking por operador nesse domínio,
  // mesmo sem a palavra "operador" (ex.: "...no time"/"na equipe").
  const isOperatorRankingIntent =
    /\bquem\s+(?:tem|possui|esta\s+com)\s+(?:mais|menos)\b/.test(text)
    || /\bquem\s+(?:mais|menos)\s+(?:tem|possui|esta\s+com)\b/.test(text);

  // Direção do ranking pedido: "menos"/"menor" (ascendente, menor primeiro)
  // vs. "mais"/"maior"/nada (descendente, padrão). Exclui "menos de N dias"/
  // "pelo menos N" — não são ranking, são limiar/quantidade mínima. "menor"
  // (achado junto de "tem a menor carga", ver RANKING_CUE_SOURCE acima) é o
  // mesmo sentido ascendente de "menos", só em forma de adjetivo.
  // "do MAIOR pro menor" (achado testando o lote de perguntas ao vivo):
  // frase inteira já descreve ordem DESCENDENTE (do maior valor pro menor),
  // mesmo sentido do padrão (nenhuma mudança necessária) — mas o bare
  // "menor" sozinho acima disparava "asc" só por "menor" aparecer em
  // QUALQUER lugar da frase, mesmo quando é a SEGUNDA metade de "do maior
  // pro menor" (não um pedido de ascendente). Só conta como ascendente
  // quando "menor" NÃO está nessa construção "maior...pro/para...menor".
  const pedidoMaiorParaMenor = /\bmaior\s+(?:pro|para)\s+(?:o\s+)?menor\b/.test(text);
  // "pior(es)" é o mesmo sentido ascendente de "menos"/"menor" (achado
  // junto da correção de isWorstBestOperatorRankingIntent acima): "os 3
  // PIORES operadores" pede o fim da lista (menor volume), não o topo —
  // "melhor(es)" já cai no padrão descendente (mesmo de "mais"/"maior"/
  // nada), por isso não precisa de alternativa própria aqui.
  const ordemRanking =
    (/\bmenos\b(?!\s+de\b)/.test(text) && !/\bpelo\s+menos\b/.test(text))
    || (/\bmenor\b/.test(text) && !pedidoMaiorParaMenor)
    || /\bpior(?:es)?\b/.test(text)
      ? "asc"
      : undefined;

  // Perguntas de "visão geral" da operação — não é uma dimensão específica,
  // é um retrato amplo (total, abertos, fechados, sem operador, congelados,
  // por prioridade, backlog antigo).
  const isDashboardIntent =
    // "resumo operacional"/"resumo geral"/"resumo executivo" é o nome da
    // própria intenção (usado no título da tool e no que o usuário digita
    // na prática) — faltava na lista original, que só cobria frases mais
    // informais tipo "visão geral"/"como está a operação".
    /\bresumo\s+(?:operacional|geral|executivo)\b/.test(text)
    || /\bvisao\s+geral\b/.test(text)
    || /\bsituacao\s+geral\b/.test(text)
    || /\bcomo\s+esta\s+a\s+operacao\b/.test(text)
    || /\bcomo\s+estao\s+as\s+coisas\b/.test(text)
    || /\b(?:algo|alguma\s+coisa)\s+preocupante\b/.test(text)
    || /\bmerece\s+(?:minha\s+)?atencao\b/.test(text)
    || /\bsinal\s+de\s+alerta\b/.test(text)
    || /\bdando\s+conta\s+da\s+demanda\b/.test(text)
    || /\btem\s+algum\s+problema\b/.test(text);

  // "resumo executivo" ou um pedido de texto pra uma audiência de gestão —
  // pede pro modelo transformar os números já calculados por
  // resumo_operacional_tickets num parágrafo corrido, em vez de só exibir
  // os números. Lista de gatilhos deliberadamente conservadora: perder um
  // caso só mantém o comportamento de hoje (números puros, seguro); um
  // falso positivo só gasta 1 chamada extra ao Ollama.
  // "Resumo por Gestão." (achado testando o lote de perguntas ao vivo, com
  // dados reais): "Gestão" é o nome real de uma ÁREA e de um DEPARTAMENTO no
  // catálogo — a palavra "gestao" (normalizada) também era um dos gatilhos
  // de AUDIÊNCIA abaixo, aceita em QUALQUER lugar depois de "resumo"/
  // "parágrafo"/"texto"/"mensagem", sem exigir nenhuma preposição de
  // destinatário no meio — então "Resumo POR Gestão" (pedido de agrupar
  // por essa área/departamento, não uma audiência) disparava o resumo
  // EXECUTIVO do sistema inteiro por engano, sequestrando a intenção certa
  // (group-by) pra uma completamente diferente — não só um "falso positivo
  // barato" como o comentário original previa (aqui troca a TOOL inteira,
  // não só o formato da resposta). Corrigido exigindo a preposição de
  // DESTINATÁRIO de verdade (para/pra/pro/a/à/ao) logo antes da palavra de
  // audiência — "por Gestão" não tem essa preposição, só "pra gestão"/
  // "pro chefe"/"para a diretoria" (frases reais já aceitas, ver teste) têm.
  const AUDIENCIA_PREPOSICAO_SOURCE = "(?:para|pra|pro|a|[àá]|ao)";
  const AUDIENCIA_DESTINATARIO_SOURCE =
    `${AUDIENCIA_PREPOSICAO_SOURCE}\\s+(?:o\\s+|a\\s+)?(?:chefe|diretoria|gestor(?:es)?|gestao|lideranca)\\b`;

  const isResumoExecutivoIntent =
    /\bresumo\s+executivo\b/.test(text)
    || new RegExp(`\\b(?:paragrafo|texto|mensagem)\\b.*\\b${AUDIENCIA_DESTINATARIO_SOURCE}`).test(text)
    || new RegExp(`\\bresumo\\b.*\\b${AUDIENCIA_DESTINATARIO_SOURCE}`).test(text);

  if (isDashboardIntent || isResumoExecutivoIntent) {
    const decision = createTicketDecision(
      "resumo_operacional",
      "resumo_operacional_tickets",
      compactEntities({ area, departamento, dataInicio, dataFim }),
    );

    if (isResumoExecutivoIntent) {
      decision.synthesize = "resumo_executivo";
    }

    return decision;
  }

  // "Quantos tickets vencidos tem o departamento Suporte, agrupados por
  // prioridade?" (achado testando o lote de perguntas ao vivo): nenhuma tool
  // resumo_tickets_por_* sabe filtrar por SLA vencido (só listar_tickets_
  // vencidos faz a checagem real de SLA por ticket, ver comentário acima) —
  // sem este guard, "agrupados por prioridade" vencia e a palavra "vencidos"
  // era descartada em silêncio, devolvendo a contagem de TODOS os tickets
  // por prioridade (não só os vencidos) como se fosse a resposta certa. Com
  // o guard, a pergunta cai no branch de isSlaVencidoIntent mais abaixo —
  // honesto mesmo sem conseguir agrupar (lista os vencidos de verdade, só
  // não agrupados por prioridade).
  // "status === undefined" (achado testando o lote de perguntas ao vivo):
  // resumo_tickets_por_status não tem parâmetro "status" no próprio schema
  // (agrupar POR status e também filtrar por UM status só seria degenerado
  // — 1 linha só). Sem este guard, "Resumo por status Cancelado." disparava
  // esse branch do mesmo jeito (mentionsStatusDimension só olha o conector
  // "por status", não se um valor específico foi dito), e "Cancelado" era
  // descartado em silêncio — o usuário recebia a distribuição de TODOS os
  // status, achando que era a resposta certa pro que pediu. Com o guard,
  // cai no fallback mais abaixo (hasExplicitResumoWord), que já trata esse
  // caso certo (resumo por OUTRA dimensão, filtrado pelo status pedido).
  if (hasResumoIntent && mentionsStatusDimension && status === undefined && !isSlaVencidoIntent && permiteDimensaoResumo("status")) {
    const decision = createTicketDecision(
      "resumo_por_status",
      "resumo_tickets_por_status",
      compactEntities({
        area,
        departamento,
        operador,
        prioridade,
        situacao: situacaoInequivoca,
        limite,
        dataInicio,
        dataFim,
        ordem: ordemRanking,
      }),
    );

    return decision;
  }

  // "prioridade === undefined" — mesma correção irmã da de status acima,
  // pro mesmo bug ("Resumo por prioridade Alta." descartava "Alta" em
  // silêncio).
  if (hasResumoIntent && mentionsPriorityDimension && prioridade === undefined && !isSlaVencidoIntent && permiteDimensaoResumo("prioridade")) {
    const decision = createTicketDecision(
      "resumo_por_prioridade",
      "resumo_tickets_por_prioridade",
      compactEntities({
        status,
        area,
        departamento,
        operador,
        situacao: situacaoInequivoca,
        limite,
        dataInicio,
        dataFim,
        ordem: ordemRanking,
      }),
    );

    return decision;
  }

  // "area === undefined" — mesma correção irmã de status/prioridade acima
  // (achado testando o lote de perguntas ao vivo: "Resumo por área Suporte."
  // descartava "Suporte" em silêncio, devolvendo a distribuição de TODAS as
  // áreas).
  if (hasResumoIntent && mentionsAreaDimension && area === undefined && !isSlaVencidoIntent && permiteDimensaoResumo("area")) {
    const decision = createTicketDecision(
      "resumo_por_area",
      "resumo_tickets_por_area",
      compactEntities({
        status,
        departamento,
        operador,
        prioridade,
        situacao: situacaoInequivoca,
        limite,
        dataInicio,
        dataFim,
        ordem: ordemRanking,
      }),
    );

    return decision;
  }

  if (hasResumoIntent && (mentionsOperatorDimension || isOperatorRankingIntent || isWorstBestOperatorRankingIntent) && !isSlaVencidoIntent && permiteDimensaoResumo("operador")) {
    const decision = createTicketDecision(
      "resumo_por_operador",
      "resumo_tickets_por_operador",
      compactEntities({
        status,
        area,
        departamento,
        operador,
        prioridade,
        situacao: situacaoInequivoca,
        limite,
        dataInicio,
        dataFim,
        ordem: ordemRanking,
      }),
    );

    return decision;
  }

  // "departamento === undefined" — mesma correção irmã de status/prioridade/
  // área acima (achado testando o lote de perguntas ao vivo: "Resumo por
  // departamento Marketing." descartava "Marketing" em silêncio — pior
  // ainda aqui, já que "Marketing" nem existe no catálogo real, e o usuário
  // recebia a distribuição por TODOS os departamentos como se fosse a
  // resposta certa, sem nenhum aviso de "departamento não encontrado").
  if (hasResumoIntent && mentionsDepartmentDimension && departamento === undefined && !isSlaVencidoIntent && permiteDimensaoResumo("departamento")) {
    const decision = createTicketDecision(
      "resumo_por_departamento",
      "resumo_tickets_por_departamento",
      // dataInicio/dataFim faltavam aqui (achado B13/item 6 do plano de
      // correção): "Quantos tickets por departamento entre 2026-01-01 e
      // 2026-02-01?" descartava o período em silêncio, diferente de todo
      // branch irmão (status/prioridade/área/operador/cliente), que já
      // repassa a data extraída no topo da função.
      compactEntities({ status, area, operador, limite, dataInicio, dataFim, ordem: ordemRanking }),
    );

    return decision;
  }

  // "cliente === undefined" — mesma correção irmã de status/prioridade/
  // área/departamento acima (achado testando o lote de perguntas ao vivo).
  // Diferente dos outros 4, não existe um fallback de "resumo por OUTRA
  // dimensão filtrado por cliente" mais abaixo (hasExplicitResumoWord não
  // olha cliente) — aqui o guard simplesmente deixa a pergunta continuar
  // até o fallback final de listagem comum, filtrada pelo cliente, que já é
  // uma resposta honesta e útil (cliente não tem um catálogo pequeno fixo
  // como os outros, então "agrupar por outra dimensão" não seria natural).
  if (hasResumoIntent && (mentionsClienteDimension || isWorstBestClienteRankingIntent) && cliente === undefined && !isSlaVencidoIntent && permiteDimensaoResumo("cliente")) {
    const decision = createTicketDecision(
      "resumo_por_cliente",
      "resumo_tickets_por_cliente",
      compactEntities({
        status,
        area,
        departamento,
        operador,
        prioridade,
        situacao: situacaoInequivoca,
        limite,
        dataInicio,
        dataFim,
        ordem: ordemRanking,
      }),
    );

    return decision;
  }

  // "Mostra os tickets por canal de atendimento." (achado testando o lote
  // de perguntas ao vivo): nenhuma tool resumo_tickets_por_* agrupa por
  // canal, e nenhum filtro de listagem aceita canal (só listar_canais_
  // tickets lista o catálogo de canais existentes — ver TICKET_NOUN_
  // SOURCE/exclusões de "canal" nos extratores de operador/dimensão mais
  // acima, que já descartam a palavra honestamente em vez de inventar um
  // filtro errado). Sem este guard, a cláusula virava um fallback de
  // listagem SEM FILTRO NENHUM e sem avisar — como se "canal" tivesse sido
  // entendido e ignorado, em vez de reconhecer que não há suporte.
  // Vocabulário restrito a "canal" usado como DIMENSÃO/FILTRO (por/cada/
  // pelo/do/no canal, ou "canal de atendimento" — a forma mais comum na
  // prática), não "canal" solto em qualquer lugar da frase — uma busca de
  // texto livre que mencione "canal" incidentalmente (ex.: "busque tickets
  // sobre problema no canal de pagamentos") ainda deve seguir pra
  // extractSearchText, mais abaixo, sem ser hijackada por este guard.
  const mencionaCanalComoFiltroOuDimensao =
    /\bpor\s+canal\b|\bcada\s+canal\b|\bpelo\s+canal\b|\bdo\s+canal\b|\bno\s+canal\b|\bcanal\s+de\s+atendimento\b/.test(
      text,
    );

  if (mencionaCanalComoFiltroOuDimensao) {
    return createClarificationDecision(
      "esclarecimento_canal_nao_suportado",
      "Não consigo filtrar nem agrupar tickets por canal de atendimento hoje — só consigo listar os canais que existem no catálogo. Pode perguntar usando outro filtro (status, área, departamento, operador, cliente ou período)?"
        + "\n\nExemplos:\n"
        + "- Quais canais de ticket existem?\n"
        + "- Tickets abertos na área Suporte.",
    );
  }

  if (numero !== undefined) {
    // "resuma"/"resumo do ticket"/"o que foi feito no ticket X" pede pro
    // modelo ler a descrição+comentários do ticket já buscado e escrever um
    // resumo curto, em vez de só devolver o detalhe cru.
    const isResumoTicketIntent =
      /\bresum[ao]\b|\bresumir\b|\bresumindo\b|\bsintetiz\w*\b/.test(text)
      || /\bo\s+que\s+(?:foi\s+feito|aconteceu|houve|rolou)\b/.test(text)
      || /\bconte\s+o\s+que\s+(?:foi\s+feito|aconteceu|houve|rolou)\b/.test(text);

    const decision = createTicketDecision(
      "buscar_por_numero",
      "buscar_ticket_por_numero",
      { numero },
    );

    if (isResumoTicketIntent) {
      decision.synthesize = "resumo_ticket";
    }

    return decision;
  }

  if (isCongeladoIntent) {
    const decision = createTicketDecision(
      "listar_congelados",
      "listar_tickets_congelados",
      compactEntities({ status, area, departamento, operador, cliente, prioridade, dataInicio, dataFim, limite, pagina }),
    );

    if (verbosidadePreferida) {
      decision.verbosidade = verbosidadePreferida;
    }

    return decision;
  }

  // Checado ANTES da busca textual de propósito (item 2 do plano de
  // correção da auditoria de interpretação): "informações sobre o usuário
  // X" / "quem é o usuário X" e "tickets sobre impressora" competem pela
  // mesma palavra "sobre", mas extractUserName tem padrões mais
  // específicos — se ele bater, é sempre a intenção certa (busca de
  // usuário), não busca textual genérica.
  const nomeUsuario = extractUserName(pergunta);

  if (nomeUsuario !== undefined) {
    return createTicketDecision(
      "buscar_usuario_por_nome",
      "buscar_usuarios_por_nome",
      { nome: nomeUsuario },
    );
  }

  const textoBusca = extractSearchText(pergunta);

  if (textoBusca !== undefined) {
    const decision = createTicketDecision(
      "buscar_por_texto",
      "buscar_tickets_por_texto",
      compactEntities({
        texto: textoBusca,
        status,
        area,
        departamento,
        operador,
        cliente,
        prioridade,
        situacao: situacaoInequivoca,
        dataInicio,
        dataFim,
        limite,
        pagina,
      }),
    );

    if (verbosidadePreferida) {
      decision.verbosidade = verbosidadePreferida;
    }

    return decision;
  }

  if (isOldestOpenIntent) {
    // Ignora o número de "página N" ao procurar um número solto pra usar
    // como limite (ex.: "10 tickets mais antigos, página 2" não pode virar
    // limite: 2).
    const numeroSolto = extractLooseNumberMatch(text);

    const decision = createTicketDecision(
      "listar_abertos_mais_antigos",
      "listar_tickets_abertos_mais_antigos",
      compactEntities({
        area,
        departamento,
        operador,
        cliente,
        prioridade,
        limite: limite ?? (numeroSolto ? Number(numeroSolto[1]) : undefined),
        pagina,
      }),
    );

    if (verbosidadePreferida) {
      decision.verbosidade = verbosidadePreferida;
    }

    return decision;
  }

  if (isSlaVencidoIntent) {
    const numeroSolto = extractLooseNumberMatch(text);

    const decision = createTicketDecision(
      "listar_vencidos",
      "listar_tickets_vencidos",
      compactEntities({
        status,
        area,
        departamento,
        operador,
        cliente,
        prioridade,
        situacao: situacaoInequivoca,
        dataInicio,
        dataFim,
        limite: limite ?? (numeroSolto ? Number(numeroSolto[1]) : undefined),
        pagina,
      }),
    );

    if (verbosidadePreferida) {
      decision.verbosidade = verbosidadePreferida;
    }

    return decision;
  }

  // "Quantos tickets o X tratou no departamento Y?"/"atividade do cliente X
  // na área Y" (achado testando o lote de perguntas ao vivo, com dados
  // reais): analisar_carga_operador/analisar_atividade_cliente dão um
  // retrato da PESSOA inteira (todos os departamentos/áreas juntos), por
  // desenho — nenhuma das 2 tools aceita filtro de área/departamento (só
  // operador/cliente + período), diferente de toda tool de listagem/resumo.
  // Sem este guard, "no departamento SYSADMIN"/"na área Y" era descartado
  // em silêncio, e a resposta vinha com a atividade da pessoa em TODA a
  // operação, não só no recorte pedido — parecendo completa quando não é.
  const mencionaDimensaoNaoSuportadaNaAnalise =
    departamento !== undefined || area !== undefined;

  const operadorCarga = extractOperatorWorkloadName(pergunta);

  if (operadorCarga !== undefined) {
    if (mencionaDimensaoNaoSuportadaNaAnalise) {
      return createClarificationDecision(
        "esclarecimento_analise_sem_filtro_de_dimensao",
        "A carga de um operador que eu consigo mostrar é sempre da pessoa inteira (todos os departamentos e áreas juntos) — não dá pra restringir a um departamento ou área específico. Pode perguntar pela carga geral dele, ou filtrar por departamento/área numa listagem comum?"
          + "\n\nExemplos:\n"
          + `- Qual a carga do operador ${operadorCarga}?\n`
          + `- Tickets do operador ${operadorCarga} no departamento ${departamento ?? area}.`,
      );
    }

    return createTicketDecision(
      "analisar_carga_operador",
      "analisar_carga_operador",
      { operador: operadorCarga },
    );
  }

  // "O cliente X abre muito(s) chamado(s)?" (Img 7) — mesma ideia de
  // operadorCarga acima, só que pra atividade de UM cliente só.
  const clienteAtividade = extractClientActivityName(pergunta);

  if (clienteAtividade !== undefined) {
    if (mencionaDimensaoNaoSuportadaNaAnalise) {
      return createClarificationDecision(
        "esclarecimento_analise_sem_filtro_de_dimensao",
        "A atividade de um cliente que eu consigo mostrar é sempre da pessoa inteira (todos os departamentos e áreas juntos) — não dá pra restringir a um departamento ou área específico. Pode perguntar pela atividade geral dele, ou filtrar por departamento/área numa listagem comum?"
          + "\n\nExemplos:\n"
          + `- Qual a atividade do cliente ${clienteAtividade}?\n`
          + `- Tickets do cliente ${clienteAtividade} no departamento ${departamento ?? area}.`,
      );
    }

    return createTicketDecision(
      "analisar_atividade_cliente",
      "analisar_atividade_cliente",
      compactEntities({ cliente: clienteAtividade, dataInicio, dataFim }),
    );
  }

  // Item 9 do plano de correção (achado B12): "primeiro"/"primeira" sozinho,
  // no domínio de tickets, é mais comumente o CONTRÁRIO de "mais recente" (o
  // mais antigo/o 1º cronológico) — confirmado ao vivo: "Qual foi o primeiro
  // ticket aberto?" (pergunta pelo mais antigo) roteava pra mais_recentes,
  // sentido invertido. "primeiros N tickets" (com número) tinha sido restrito
  // a esse mesmo gatilho de "mais recentes" pra dar uma ordem previsível
  // qualquer — mas é o mesmo sentido invertido do caso singular, só
  // confirmado depois ao vivo pelo usuário: "primeiros N" lido naturalmente
  // também significa os N cronologicamente primeiros (mais antigos), não os
  // mais recentes. Por isso tem rota própria (mais_antigos, entre TODOS os
  // tickets — abertos e fechados, ao contrário de
  // listar_tickets_abertos_mais_antigos, que é só sobre os ainda abertos).
  // Aceita as 2 ordens naturais em português: "primeiros 5" e "5 primeiros"
  // (ex.: "os 5 primeiros tickets fechados") — achado ao vivo: só a primeira
  // ordem estava coberta, a segunda caía no fallback de aberto/fechado sem
  // limite nem ordenação nenhuma.
  const isOldestOverallWithCountIntent = /\bprimeir[oa]s?\s+\d+\b|\b\d+\s+primeir[oa]s?\b/.test(text);

  // "primeiro"/"primeira" SOZINHO, sem número (achado testando o lote de
  // perguntas ao vivo — Img 12): "Primeiro ticket que a Sabrina Mariotto
  // abriu" não batia no padrão acima (não tem dígito nenhum) e caía inteiro
  // no fallback de listagem sem filtro nenhum. Mesmo sentido (mais antigo,
  // não mais recente) do caso com número, só que pedindo exatamente 1.
  // "(?!\\s+trimestres?\\b)" (achado testando o lote de perguntas ao vivo,
  // com dados reais): "Tickets abertos no PRIMEIRO TRIMESTRE de 2025." usa
  // "primeiro" como ORDINAL DE TRIMESTRE (ver trimestreNumeradoMatch em
  // extractDateRange), não como pedido de "só o 1º ticket" — sem essa
  // exclusão, a pergunta inteira era sequestrada pra isOldestOverallIntent
  // (limite:1, TODOS os status, ignorando o filtro "abertos"), perdendo o
  // recorte de trimestre e o filtro de situação por completo.
  const isBareOldestOverallIntent =
    !isOldestOverallWithCountIntent && /\bprimeir[oa]\b(?!\s+trimestres?\b)/.test(text);

  // "mais antigo" SEM "aberto" (ver mentionsMaisAntigo/isOldestOpenIntent
  // acima) também entra aqui — é o mesmo pedido de "TODOS os status" que o
  // resto desse branch já busca, só com outro vocabulário de gatilho.
  const isOldestOverallIntent =
    isOldestOverallWithCountIntent
    || isBareOldestOverallIntent
    || (mentionsMaisAntigo && !isAbertoIntent);

  // "ultimo" também ganhou o \b de fechamento que faltava (bug de regex
  // simples, evita casar como prefixo de outra palavra). "por ultimo" no
  // início da frase é conectivo de discurso ("por último, me diz..."), não
  // pedido de ordenação por recência — mesma classe de falso positivo do
  // item 8 (cortesia/discurso não é nome), confirmado ao vivo: "Por último,
  // me diz quantos tickets tem no total" roteava pra mais_recentes, ignorando
  // a pergunta real (quantidade total).
  // "ultimo(s)" sozinho pede ordenação por recência, mas "nos ÚLTIMOS 30
  // DIAS" é um intervalo de data (já coberto por extractDateRange), não um
  // pedido de ordenação — achado testando o lote de perguntas ao vivo:
  // "atividade do cliente X nos últimos 30 dias" disparava mais_recentes e
  // ainda lia o "30" como limite de resultados (ver extractLooseNumberMatch),
  // quando o pedido real era só filtrar por data.
  // "último mês"/"última semana"/"último ano" (SEM número, achado testando o
  // lote de perguntas ao vivo) é a mesma ideia, só na forma singular que
  // extractRelativeDateRange passou a reconhecer também — sem essa exclusão,
  // "o cliente Acme abriu no ÚLTIMO MÊS" disparava mais_recentes com
  // limite:1 (via isBareMostRecentIntent, mais abaixo), quando "último"
  // aqui qualifica o MÊS, não pede "o ticket mais recente".
  // "último trimestre"/"última quinzena" (achado testando o lote de
  // perguntas ao vivo) são a mesma exclusão de "último mês/semana/ano" —
  // extractRelativeDateRange já sabe calcular o período real pra essas 2
  // formas agora, então "último" aqui qualifica o PERÍODO, não pede "o
  // ticket mais recente".
  const mentionsUltimoComoRecencia =
    /\bultimos?\b/.test(text)
    && !/\bultim[oa]s\s+\d+\s+(?:dias?|semanas?|mes|meses|anos?)\b/.test(text)
    && !/\bultim[oa]\s+(?:semana|mes|ano|trimestre|quinzena)\b/.test(text)
    // "último dia do mês" (achado testando o lote de perguntas ao vivo):
    // mesma exclusão de "último mês" acima, pro caso mais específico de dia
    // de calendário que extractRelativeDateRange passou a reconhecer.
    && !/\bultimo\s+dia\s+(?:d[oe]\s+)?mes\b/.test(text);

  const isMostRecentIntent =
    (/\brecent/.test(text)
      || mentionsUltimoComoRecencia
      || /\bmais\s+nov[oa]/.test(text)
      || /\brecem\b/.test(text))
    && !/\bpor\s+ultimo\b/.test(text);

  // "ultimo"/"ultima" SOZINHO (singular, sem número nenhum na frase) pede só
  // 1 resultado — mesmo raciocínio do "primeiro" sozinho (isBareOldestOverallIntent
  // acima), só que no sentido oposto (mais recente). Achado testando o lote de
  // perguntas ao vivo (Lote extra 1, pergunta 16): "Qual foi o último ticket
  // registrado no sistema?" não tinha nenhum número na frase, então caía no
  // default do schema da tool (10) em vez da resposta única esperada.
  const isBareMostRecentIntent =
    isMostRecentIntent && /\bultim[oa]\b/.test(text) && !/\bultim[oa]s\b/.test(text);

  if (isOldestOverallIntent) {
    const numeroSolto = extractLooseNumberMatch(text);

    const decision = createTicketDecision(
      "listar_mais_antigos",
      "listar_tickets_mais_antigos",
      compactEntities({
        status,
        area,
        departamento,
        operador,
        cliente,
        prioridade,
        situacao: situacaoInequivoca,
        dataInicio,
        dataFim,
        limite: limite ?? (numeroSolto ? Number(numeroSolto[1]) : (isBareOldestOverallIntent ? 1 : undefined)),
        pagina,
      }),
    );

    if (verbosidadePreferida) {
      decision.verbosidade = verbosidadePreferida;
    }

    return decision;
  }

  if (isMostRecentIntent) {
    // Ignora o número de "página N" ao procurar um número solto pra usar
    // como limite (mesmo cuidado do branch de mais antigos).
    const numeroSolto = extractLooseNumberMatch(text);

    const decision = createTicketDecision(
      "listar_mais_recentes",
      "listar_tickets_mais_recentes",
      compactEntities({
        status,
        area,
        departamento,
        operador,
        cliente,
        prioridade,
        situacao: situacaoInequivoca,
        dataInicio,
        dataFim,
        limite: limite ?? (numeroSolto ? Number(numeroSolto[1]) : (isBareMostRecentIntent ? 1 : undefined)),
        pagina,
      }),
    );

    if (verbosidadePreferida) {
      decision.verbosidade = verbosidadePreferida;
    }

    return decision;
  }

  // "Quantos tickets estão abertos? E quantos fechados?" (achado testando o
  // lote de perguntas ao vivo): 2 perguntas concatenadas na mesma mensagem
  // — isAbertoIntent e isFechadoIntent ficam os 2 true (situacaoInequivoca
  // undefined), e nenhum dos 2 branches abaixo (que exigem UM dos dois, não
  // os 2 juntos) bate — a pergunta caía no fallback de listagem sem filtro
  // nenhum, perdendo os 2 números pedidos. resumo_operacional_tickets já
  // devolve abertos/fechados (entre outros) juntos numa resposta só — mais
  // útil que escolher arbitrariamente 1 dos 2 lados ou que devolver a
  // listagem crua sem filtro.
  // "Quantos tickets abertos e fechados tem o Fabio Gali?" (achado testando
  // o lote de perguntas ao vivo): resumo_operacional_tickets não aceita
  // filtro de operador/cliente nenhum (só área/departamento/período, ver
  // schema da tool em src/server.js) — sem este guard, esse redirecionamento
  // disparava do mesmo jeito e IGNORAVA silenciosamente o cliente/operador
  // pedido, devolvendo os totais do sistema inteiro como se fosse a
  // resposta certa pra UMA pessoa. Com operador/cliente presente, cai pro
  // fallback de listagem comum mais abaixo (sem filtro de situação, já que
  // "aberto e fechado" = sem restrição nenhuma de status = exatamente o
  // total certo da pessoa).
  if (isAbertoIntent && isFechadoIntent && operador === undefined && cliente === undefined) {
    return createTicketDecision(
      "resumo_operacional",
      "resumo_operacional_tickets",
      compactEntities({ area, departamento, dataInicio, dataFim }),
    );
  }

  if (isAbertoIntent && !isFechadoIntent) {
    const decision = createTicketDecision(
      "listar_abertos",
      "listar_tickets_abertos",
      // status entra aqui (achado Img 31): "tickets abertos aguardando
      // atendimento" tinha o status literal extraído no topo da função, mas
      // esse branch descartava em silêncio — mesma classe do B13/item 6 do
      // plano de correção, só que faltando nesta dupla específica em vez
      // das de resumo. Seguro aqui porque detectaContradicao já barra a
      // combinação equivalente do lado fechado (status literal nunca é um
      // status de fechamento).
      compactEntities({
        status,
        area,
        departamento,
        operador,
        cliente,
        prioridade,
        dataInicio,
        dataFim,
        limite,
        pagina,
      }),
    );

    if (verbosidadePreferida) {
      decision.verbosidade = verbosidadePreferida;
    }

    return decision;
  }

  if (isFechadoIntent && !isAbertoIntent) {
    const decision = createTicketDecision(
      "listar_fechados",
      "listar_tickets_fechados",
      compactEntities({
        status,
        area,
        departamento,
        operador,
        cliente,
        prioridade,
        dataInicio,
        dataFim,
        limite,
        pagina,
      }),
    );

    if (verbosidadePreferida) {
      decision.verbosidade = verbosidadePreferida;
    }

    return decision;
  }

  if (isSemOperadorIntent) {
    const decision = createTicketDecision(
      "listar_sem_operador",
      "listar_tickets_sem_operador",
      compactEntities({ status, area, departamento, cliente, prioridade, dataInicio, dataFim, limite, pagina }),
    );

    if (verbosidadePreferida) {
      decision.verbosidade = verbosidadePreferida;
    }

    return decision;
  }


  for (const metaIntent of META_INTENTS) {
    if (metaIntent.patterns.some((pattern) => pattern.test(text))) {
      return createTicketDecision(
        metaIntent.tool,
        metaIntent.tool,
        {},
      );
    }
  }

  // "Resumo dos tickets da área X" / "do departamento X" / "de prioridade X"
  // pede um resumo, mas menciona a dimensão como FILTRO ("da"/"do/de"), não
  // como conector de agrupamento ("por área") — nenhum dos 6 branches acima
  // bate. Sem isso, cairia na listagem simples e ignoraria a palavra
  // "resumo". Já que nenhuma outra intenção mais específica (congelados,
  // texto, mais antigos/recentes, aberto/fechado, sem operador) bateu antes
  // de chegar aqui, tratamos como pedido de resumo por status (a quebra
  // mais informativa por padrão), filtrado pelo que foi extraído — exceto
  // quando o único filtro extraído já é o próprio status (nesse caso
  // agrupar por status seria degenerado, então agrupamos por área).
  //
  // Achado testando o lote de perguntas ao vivo: usar hasResumoIntent aqui
  // (em vez de uma palavra explícita de resumo) over-triggerava — "Quantos
  // tickets estão em atendimento?" e "Quantos tickets a área WEB tem?" não
  // pedem NENHUMA quebra por dimensão, só uma contagem com um filtro simples,
  // mas hasResumoIntent já vira true com a palavra solta "quantos" (gatilho
  // legítimo quando combinado com um conector "por X"/"em cada X", mas não
  // sozinho). Resultado: toda pergunta "quantos tickets [filtro] tem/estão em
  // [status]?" devolvia uma quebra por área/status que ninguém pediu, em vez
  // da contagem direta que listar_tickets/listar_tickets_abertos já dão no
  // cabeçalho da resposta. Esse fallback específico (filtro sem conector)
  // só deveria disparar pela palavra explícita de resumo citada no comentário
  // acima — os outros gatilhos de hasResumoIntent (quantos/ranking/formato)
  // não têm essa frase de filtro-sem-conector como alvo.
  const hasExplicitResumoWord =
    /\bresumo\b/.test(text)
    || /\bdistribuicao\b/.test(text)
    || /\bcontagem\b/.test(text);

  if (hasExplicitResumoWord && (area || departamento || prioridade || status)) {
    if (!area && !departamento && !prioridade && status) {
      return createTicketDecision(
        "resumo_por_area",
        "resumo_tickets_por_area",
        compactEntities({
          status,
          departamento,
          operador,
          prioridade,
          limite,
          dataInicio,
          dataFim,
          ordem: ordemRanking,
        }),
      );
    }

    return createTicketDecision(
      "resumo_por_status",
      "resumo_tickets_por_status",
      compactEntities({
        area,
        departamento,
        operador,
        prioridade,
        limite,
        dataInicio,
        dataFim,
        ordem: ordemRanking,
      }),
    );
  }

  // Chegou até aqui sem nenhuma entidade "forte" extraída e sem nenhuma
  // palavra do vocabulário de tickets no texto — provavelmente a pergunta
  // não é sobre tickets (achado P1 da auditoria end-to-end). "operador"
  // sozinho não conta como entidade forte aqui: desde a unificação com
  // extractOperatorName (achado P5), esse campo pode vir de um "do/da"/
  // "por/pelo" bem genérico (ex.: "previsão DO TEMPO" capturava operador:
  // "tempo") — sem outro sinal de domínio, isso não é evidência confiável
  // de que a pergunta é sobre tickets. Número solto (ex.: "1002") fica de
  // fora de propósito: é ambíguo, mas plausivelmente uma referência a um
  // ticket, não claramente fora do domínio.
  const isBareNumber = /^\d+$/.test(text);
  const { operador: _operadorIgnoradoParaEsseCheck, ...entidadesFortes } = entities;

  if (
    Object.keys(entidadesFortes).length === 0
    && !isBareNumber
    && !TICKET_DOMAIN_VOCABULARY_PATTERN.test(text)
  ) {
    return createClarificationDecision(
      "fora_do_dominio",
      "Não entendi essa pergunta como algo relacionado aos tickets do sistema. "
        + "Você pode perguntar sobre status, prioridade, área, departamento, "
        + "operador, cliente, período ou número de um ticket, por exemplo."
        + "\n\nExemplos:\n"
        + "- Quantos tickets estão abertos na área Suporte?\n"
        + "- Qual o resumo dos tickets por prioridade este mês?\n"
        + "- Detalhe o ticket 1050.",
    );
  }

  // "Aquele ticket lá, você sabe qual" produz entidades:{} igual a "Liste
  // os tickets" (pedido deliberado de listagem sem filtro) — as duas não
  // dão pra distinguir só pela ausência de entidade forte. O sinal extra é
  // a combinação demonstrativo + substantivo de ticket + o próprio usuário
  // admitindo não saber qual é (VAGUE_TICKET_REFERENCE_PATTERN). Checado
  // DEPOIS do portão fora_do_dominio (que já teria barrado aqui se não
  // houvesse nenhuma palavra de ticket) e ANTES do fallback de listagem
  // genérica, pra não despejar os 5000+ tickets sem filtro quando o próprio
  // usuário já sinalizou que não sabe a qual ticket se refere.
  if (Object.keys(entidadesFortes).length === 0 && VAGUE_TICKET_REFERENCE_PATTERN.test(text)) {
    return createClarificationDecision(
      "esclarecimento_termo_ambiguo",
      "Não consegui identificar a qual ticket você está se referindo. Pode informar o número do ticket, ou descrever um filtro (status, área, operador, cliente, período)?"
        + "\n\nExemplos:\n"
        + "- Detalhe o ticket 1050.\n"
        + "- Tickets abertos na área Suporte.",
    );
  }

  const decisaoListar = createTicketDecision(
    "listar",
    "listar_tickets",
    entities,
  );

  if (verbosidadePreferida) {
    decisaoListar.verbosidade = verbosidadePreferida;
  }

  return decisaoListar;
}

// Achado ao vivo: "pedido explícito de visualização" (detectFormatoPreferido,
// mais acima) só era aplicado nos 7 branches de resumo/operacional — mas
// web/shapes.js (frontend) passou a reconhecer tabela/gráfico pra TODAS as
// tools (catálogos, listagens, ticket único, carga/atividade individual),
// então "liste os tickets em tabela" ou "mostra as áreas em tabela" não
// abriam a view certa, mesmo a view existindo. Em vez de espalhar mais um
// "if (formatoPreferido) decision.formato = ..." em cada um dos ~20 branches
// que faltavam (era exatamente esse tipo de duplicação que os 7 branches de
// resumo/operacional já tinham), aplica num lugar só, depois do roteamento
// decidir qual tool usar.
const TOOLS_SEM_GRAFICO = new Set([
  "listar_tickets",
  "listar_tickets_sem_operador",
  "listar_tickets_abertos_mais_antigos",
  "listar_tickets_vencidos",
  "listar_tickets_mais_recentes",
  "listar_tickets_mais_antigos",
  "listar_tickets_congelados",
  "listar_tickets_abertos",
  "listar_tickets_fechados",
  "buscar_tickets_por_texto",
  "buscar_ticket_por_numero",
  "listar_areas_tickets",
  "listar_prioridades_tickets",
  "listar_canais_tickets",
  "listar_status_tickets",
  "listar_departamentos_tickets",
  "listar_usuarios_tickets",
  "buscar_usuarios_por_nome",
]);

const TOOLS_COM_GRAFICO = new Set([
  "resumo_tickets_por_status",
  "resumo_tickets_por_prioridade",
  "resumo_tickets_por_area",
  "resumo_tickets_por_operador",
  "resumo_tickets_por_departamento",
  "resumo_tickets_por_cliente",
  "resumo_operacional_tickets",
  "analisar_carga_operador",
  "analisar_atividade_cliente",
]);

function applyFormatoPreferido(decision, pergunta) {
  // "compare X e Y" chama a mesma tool 2x — o frontend intencionalmente não
  // oferece tabela/gráfico nesse caso (ver web/shapes.js), então não há
  // view nenhuma pra abrir por padrão. Esclarecimento (toolNames: []) também
  // não tem o que mostrar.
  if (decision.formato !== undefined || decision.compare || decision.toolNames.length !== 1) {
    return decision;
  }

  const formatoPreferido = detectFormatoPreferido(normalizeText(pergunta));

  if (!formatoPreferido) {
    return decision;
  }

  const [toolName] = decision.toolNames;

  if (TOOLS_COM_GRAFICO.has(toolName)) {
    decision.formato = formatoPreferido;
  } else if (TOOLS_SEM_GRAFICO.has(toolName)) {
    // Pediu "gráfico" de algo que só tem tabela (listagem/catálogo/ticket
    // único, sem quantidade nenhuma pra plotar) — cai pra tabela em vez de
    // ignorar o pedido em silêncio: ainda é uma view a mais que texto puro.
    decision.formato = "tabela";
  }

  return decision;
}

export function routeTicketQuestion(pergunta) {
  return applyFormatoPreferido(routeTicketQuestionCore(pergunta), pergunta);
}
