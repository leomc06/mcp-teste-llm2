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
