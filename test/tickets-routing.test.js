import assert from "node:assert/strict";
import test from "node:test";

import {
  extractAreaName,
  extractClientName,
  extractDateRange,
  extractDepartmentName,
  extractOperatorName,
  extractOperatorWorkloadName,
  extractPage,
  extractPriorityIntent,
  extractPriorityName,
  extractRelativeDateRange,
  extractTicketNumber,
  extractTicketStatusName,
  extractUserName,
  routeTicketQuestion,
} from "../agent/tickets-routing.js";

test("extrai número de ticket", () => {
  assert.equal(extractTicketNumber("Busque o ticket 1001."), 1001);
  assert.equal(extractTicketNumber("Detalhe do ticket número 42."), 42);
  assert.equal(extractTicketNumber("Nenhum número aqui."), undefined);
});

test("extrai nome de área, departamento, operador e status de ticket", () => {
  assert.equal(extractAreaName("Liste os tickets da área de Redes."), "Redes");
  assert.equal(
    extractDepartmentName("Tickets do departamento Financeiro."),
    "Financeiro",
  );
  assert.equal(
    extractOperatorName("Tickets do operador João Silva."),
    "João Silva",
  );
  assert.equal(
    extractTicketStatusName("Tickets com status Aguardando atendimento."),
    "Aguardando atendimento",
  );
});

test("roteia busca de ticket por número", () => {
  const route = routeTicketQuestion("Busque o ticket 1001.");

  assert.deepEqual(route.toolNames, ["buscar_ticket_por_numero"]);
  assert.equal(route.entities.numero, 1001);
});

test("roteia resumo de tickets por status", () => {
  const route = routeTicketQuestion("Resumo dos tickets por status.");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_status"]);
});

test("roteia resumo de tickets por prioridade", () => {
  const route = routeTicketQuestion("Quantos tickets por prioridade?");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_prioridade"]);
});

test("roteia resumo de tickets por área", () => {
  const route = routeTicketQuestion("Resumo de tickets por área.");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_area"]);
});

test("roteia resumo de tickets por operador", () => {
  const route = routeTicketQuestion("Quantos tickets por operador?");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_operador"]);
});

test("roteia resumo de tickets por departamento", () => {
  const route = routeTicketQuestion("Quantos tickets por departamento?");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_departamento"]);
});

test("resumo por operador com filtro de área não é capturado pela dimensão de área", () => {
  const route = routeTicketQuestion("Quantos tickets por operador na área de Suporte?");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_operador"]);
  assert.equal(route.entities.area, "Suporte");
});

test("pergunta sobre um operador específico não vira resumo por operador", () => {
  const route = routeTicketQuestion("Quantos tickets abertos existem do operador Ana?");

  assert.deepEqual(route.toolNames, ["listar_tickets_abertos"]);
  assert.equal(route.entities.operador, "Ana");
});

test("roteia listagem de tickets congelados", () => {
  const route = routeTicketQuestion("Quais tickets estão congelados?");

  assert.deepEqual(route.toolNames, ["listar_tickets_congelados"]);
});

test("roteia listagem de áreas de ticket", () => {
  const route = routeTicketQuestion("Quais áreas de ticket existem?");

  assert.deepEqual(route.toolNames, ["listar_areas_tickets"]);
});

test("roteia listagem de status de ticket", () => {
  const route = routeTicketQuestion("Liste os status de ticket.");

  assert.deepEqual(route.toolNames, ["listar_status_tickets"]);
});

test("'usuário' funciona como sinônimo de operador na listagem genérica", () => {
  const route = routeTicketQuestion("me mostre os chamadas do usuario paulo");

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.operador, "paulo");
});

test("roteia listagem genérica de tickets com filtros extraídos", () => {
  const route = routeTicketQuestion(
    "Liste os tickets da área de Redes com status Aguardando atendimento.",
  );

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.area, "Redes");
  assert.equal(route.entities.status, "Aguardando atendimento");
});

test("extrai nome de prioridade", () => {
  assert.equal(extractPriorityName("Liste os tickets com prioridade Alta."), "Alta");
  assert.equal(extractPriorityName("Liste os tickets."), undefined);
});

test("roteia listagem de tickets filtrada por prioridade", () => {
  const route = routeTicketQuestion("Liste os tickets com prioridade Alta.");

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.prioridade, "Alta");
});

test("extrai número de página", () => {
  assert.equal(extractPage("Liste os tickets (página 2)."), 2);
  assert.equal(extractPage("Mostre a página 15 dos tickets abertos."), 15);
  assert.equal(extractPage("Liste os tickets."), undefined);
});

test("quando há mais de uma menção de página, usa a última (permite sobrescrever)", () => {
  assert.equal(
    extractPage("Mostre a página 3 dos tickets abertos (página 4)."),
    4,
  );
});

test("roteia listagem de tickets com número de página", () => {
  const route = routeTicketQuestion("Liste os tickets (página 2).");

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.pagina, 2);
});

test("o sufixo de página não vaza para o nome da área quando não há pontuação antes dele", () => {
  const route = routeTicketQuestion(
    "Liste os tickets da área web (página 2)",
  );

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.area, "web");
  assert.equal(route.entities.pagina, 2);
});

test("extrai nome de usuário de diferentes frases de busca", () => {
  assert.equal(
    extractUserName("Busque o usuário João Silva."),
    "João Silva",
  );
  assert.equal(
    extractUserName("Procure o usuário chamado Ana Costa."),
    "Ana Costa",
  );
  assert.equal(
    extractUserName("Quem é o usuário Carlos Souza?"),
    "Carlos Souza",
  );
  assert.equal(
    extractUserName("Informações do usuário Fernanda."),
    "Fernanda",
  );
  assert.equal(
    extractUserName("Quais usuários de ticket existem?"),
    undefined,
  );
});

test("roteia busca de usuário por nome", () => {
  const route = routeTicketQuestion("Busque o usuário João Silva.");

  assert.deepEqual(route.toolNames, ["buscar_usuarios_por_nome"]);
  assert.equal(route.entities.nome, "João Silva");
});

test("pergunta genérica sobre usuários continua indo para listar_usuarios_tickets", () => {
  const route = routeTicketQuestion("Quais usuários de ticket existem?");

  assert.deepEqual(route.toolNames, ["listar_usuarios_tickets"]);
});

test("roteia contagem de tickets abertos com operador extraído de 'por <nome>'", () => {
  const route = routeTicketQuestion("Quantos chamados estão abertos por Cesar?");

  assert.deepEqual(route.toolNames, ["listar_tickets_abertos"]);
  assert.equal(route.entities.operador, "Cesar");
});

test("roteia listagem de tickets abertos mais antigos", () => {
  const route = routeTicketQuestion("Quais os 5 tickets mais antigos ainda abertos?");

  assert.deepEqual(route.toolNames, ["listar_tickets_abertos_mais_antigos"]);
  assert.equal(route.entities.limite, 5);
});

test("roteia listagem de tickets sem operador atribuído", () => {
  const route = routeTicketQuestion("Quantos tickets estão sem operador atribuído?");

  assert.deepEqual(route.toolNames, ["listar_tickets_sem_operador"]);
});

test("roteia listagem de tickets mais recentes ('últimos N')", () => {
  const route = routeTicketQuestion("Liste os últimos 5 tickets da área de Suporte.");

  assert.deepEqual(route.toolNames, ["listar_tickets_mais_recentes"]);
  assert.equal(route.entities.area, "Suporte");
  assert.equal(route.entities.limite, 5);
});

test("roteia listagem de tickets mais recentes com 'mais recentes'", () => {
  const route = routeTicketQuestion("Quais os tickets mais recentes do operador Cesar?");

  assert.deepEqual(route.toolNames, ["listar_tickets_mais_recentes"]);
  assert.equal(route.entities.operador, "Cesar");
});

test("'por <nome>' funciona como operador na intenção de mais recentes", () => {
  const route = routeTicketQuestion("Quais os últimos tickets abertos por Cesar?");

  assert.deepEqual(route.toolNames, ["listar_tickets_mais_recentes"]);
  assert.equal(route.entities.operador, "Cesar");
});

test("roteia listagem de tickets não atribuídos", () => {
  const route = routeTicketQuestion("Liste os tickets não atribuídos na área de Suporte.");

  assert.deepEqual(route.toolNames, ["listar_tickets_sem_operador"]);
  assert.equal(route.entities.area, "Suporte");
});

test("roteia listagem de tickets fechados", () => {
  const route = routeTicketQuestion("Quais tickets estão fechados na área de Redes?");

  assert.deepEqual(route.toolNames, ["listar_tickets_fechados"]);
  assert.equal(route.entities.area, "Redes");
});

test("'no máximo N' aplica limite em tickets fechados", () => {
  const route = routeTicketQuestion("Liste no máximo 10 tickets fechados.");

  assert.deepEqual(route.toolNames, ["listar_tickets_fechados"]);
  assert.equal(route.entities.limite, 10);
});

test("'no máximo N' aplica limite em tickets abertos", () => {
  const route = routeTicketQuestion("Liste no máximo 3 tickets abertos.");

  assert.deepEqual(route.toolNames, ["listar_tickets_abertos"]);
  assert.equal(route.entities.limite, 3);
});

test("filtro de período chega em tickets fechados", () => {
  const route = routeTicketQuestion(
    "Liste os tickets fechados do departamento COIDS desde dia 1 de fevereiro de 2026.",
  );

  assert.deepEqual(route.toolNames, ["listar_tickets_fechados"]);
  assert.equal(route.entities.departamento, "COIDS");
  assert.equal(route.entities.dataInicio, "2026-02-01");
});

test("filtro de período chega em tickets abertos, congelados e sem operador", () => {
  const abertos = routeTicketQuestion(
    "Liste os tickets abertos entre 2026-01-01 e 2026-06-30.",
  );
  assert.deepEqual(abertos.toolNames, ["listar_tickets_abertos"]);
  assert.equal(abertos.entities.dataInicio, "2026-01-01");
  assert.equal(abertos.entities.dataFim, "2026-06-30");

  const congelados = routeTicketQuestion(
    "Quais tickets estão congelados desde 2026-01-01?",
  );
  assert.deepEqual(congelados.toolNames, ["listar_tickets_congelados"]);
  assert.equal(congelados.entities.dataInicio, "2026-01-01");

  const semOperador = routeTicketQuestion(
    "Tickets sem operador atribuído até 2026-06-30.",
  );
  assert.deepEqual(semOperador.toolNames, ["listar_tickets_sem_operador"]);
  assert.equal(semOperador.entities.dataFim, "2026-06-30");
});

test("'por <nome>' não captura operador quando seguido de uma dimensão conhecida", () => {
  const route = routeTicketQuestion("Liste os tickets abertos por área de Redes.");

  assert.deepEqual(route.toolNames, ["listar_tickets_abertos"]);
  assert.equal(route.entities.area, "Redes");
  assert.equal(route.entities.operador, undefined);
});

test("frase com 'operador' explícito continua tendo prioridade sobre 'por <nome>'", () => {
  const route = routeTicketQuestion("Quantos tickets abertos existem do operador Ana?");

  assert.deepEqual(route.toolNames, ["listar_tickets_abertos"]);
  assert.equal(route.entities.operador, "Ana");
});

test("'operador X tem no departamento Y' não vaza o verbo/preposição para o nome do operador", () => {
  const route = routeTicketQuestion(
    "Quantos chamados fechados o operador cesar tem no departamento coids desde dia 1 de fevereiro de 2026?",
  );

  assert.deepEqual(route.toolNames, ["listar_tickets_fechados"]);
  assert.equal(route.entities.operador, "cesar");
  assert.equal(route.entities.departamento, "coids");
});

test("'operador X possui/está na área Y' também não vaza o verbo/preposição para o nome", () => {
  const route = routeTicketQuestion("Quantos tickets abertos o operador cesar possui na área de suporte?");

  assert.deepEqual(route.toolNames, ["listar_tickets_abertos"]);
  assert.equal(route.entities.operador, "cesar");
  assert.equal(route.entities.area, "suporte");
});

test("extrai período de datas em diferentes frases", () => {
  assert.deepEqual(
    extractDateRange("Liste os tickets entre 2026-01-01 e 2026-01-31."),
    { dataInicio: "2026-01-01", dataFim: "2026-01-31" },
  );
  assert.deepEqual(
    extractDateRange("Liste os tickets no período de 2026-01-01 até 2026-01-31."),
    { dataInicio: "2026-01-01", dataFim: "2026-01-31" },
  );
  assert.deepEqual(
    extractDateRange("Liste os tickets desde 2026-01-01."),
    { dataInicio: "2026-01-01" },
  );
  assert.deepEqual(
    extractDateRange("Liste os tickets a partir de 2026-01-01."),
    { dataInicio: "2026-01-01" },
  );
  assert.deepEqual(
    extractDateRange("Liste os tickets até 2026-01-31."),
    { dataFim: "2026-01-31" },
  );
  assert.deepEqual(extractDateRange("Liste os tickets."), {});
});

test("extrai período de datas por extenso (dia D de MÊS de AAAA)", () => {
  assert.deepEqual(
    extractDateRange("Liste os tickets desde dia 2 de agosto de 2026."),
    { dataInicio: "2026-08-02" },
  );
  assert.deepEqual(
    extractDateRange("Liste os tickets a partir de 2 de agosto de 2026."),
    { dataInicio: "2026-08-02" },
  );
  assert.deepEqual(
    extractDateRange("Liste os tickets até dia 2 de março de 2026."),
    { dataFim: "2026-03-02" },
  );
  assert.deepEqual(
    extractDateRange(
      "Liste os tickets entre dia 2 de agosto de 2026 e 15 de setembro de 2026.",
    ),
    { dataInicio: "2026-08-02", dataFim: "2026-09-15" },
  );
});

test("data por extenso combinada com outros filtros na listagem genérica", () => {
  const route = routeTicketQuestion(
    "Liste os tickets da área de Suporte desde dia 2 de agosto de 2026.",
  );

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.area, "Suporte");
  assert.equal(route.entities.dataInicio, "2026-08-02");
});

test("roteia listagem de tickets filtrada por período", () => {
  const route = routeTicketQuestion(
    "Liste os tickets da área de Redes entre 2026-01-01 e 2026-01-31.",
  );

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.area, "Redes");
  assert.equal(route.entities.dataInicio, "2026-01-01");
  assert.equal(route.entities.dataFim, "2026-01-31");
});

test("extrai nome de cliente", () => {
  assert.equal(
    extractClientName("Liste os tickets do cliente Diego Mota."),
    "Diego Mota",
  );
  assert.equal(extractClientName("Liste os tickets."), undefined);
});

test("roteia listagem de tickets filtrada por cliente", () => {
  const route = routeTicketQuestion("liste os tickets do cliente diego mota");

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.cliente, "diego mota");
});

test("cliente combinado com outros filtros na listagem genérica", () => {
  const route = routeTicketQuestion(
    "Liste os tickets da área de Suporte do cliente Diego Mota.",
  );

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.cliente, "Diego Mota");
  assert.equal(route.entities.area, "Suporte");
});

// --- Variações de linguagem natural (sinônimos, singular/plural, negação) ---

test("extrai número de ticket com sinônimos de 'ticket' (chamado/atendimento/solicitação/ocorrência)", () => {
  assert.equal(extractTicketNumber("Busque o chamado 123."), 123);
  assert.equal(extractTicketNumber("Quero ver o atendimento 456."), 456);
  assert.equal(
    extractTicketNumber("Me dê os detalhes da solicitação número 789."),
    789,
  );
  assert.equal(extractTicketNumber("O que aconteceu com a ocorrência 42?"), 42);
});

test("busca por número tem prioridade mesmo com outros filtros na frase", () => {
  const route = routeTicketQuestion("Como está o chamado 123 da área de Suporte?");

  assert.deepEqual(route.toolNames, ["buscar_ticket_por_numero"]);
  assert.equal(route.entities.numero, 123);
});

test("'em cada X' e 'quais X têm/possuem mais' também acionam resumo por dimensão", () => {
  assert.deepEqual(
    routeTicketQuestion("Quantos tickets existem em cada departamento?").toolNames,
    ["resumo_tickets_por_departamento"],
  );
  assert.deepEqual(
    routeTicketQuestion("Quais operadores possuem mais tickets?").toolNames,
    ["resumo_tickets_por_operador"],
  );
  assert.deepEqual(
    routeTicketQuestion("Quais operadores têm mais chamados?").toolNames,
    ["resumo_tickets_por_operador"],
  );
  assert.deepEqual(
    routeTicketQuestion("Quantos tickets cada área tem?").toolNames,
    ["resumo_tickets_por_area"],
  );
});

test("perguntas de contagem simples (sem dimensão) continuam indo para listar_tickets_fechados/abertos, não resumo", () => {
  assert.deepEqual(
    routeTicketQuestion("Quantos tickets estão fechados?").toolNames,
    ["listar_tickets_fechados"],
  );
  assert.deepEqual(
    routeTicketQuestion("Mostrar os tickets da área de TI.").toolNames,
    ["listar_tickets"],
  );
});

test("sinônimos de 'aberto': pendente e negação de fechado/encerrado", () => {
  assert.deepEqual(
    routeTicketQuestion("Quais solicitações continuam pendentes?").toolNames,
    ["listar_tickets_abertos"],
  );
  assert.deepEqual(
    routeTicketQuestion("Mostre os chamados que ainda não foram fechados.").toolNames,
    ["listar_tickets_abertos"],
  );
  assert.deepEqual(
    routeTicketQuestion("Quero ver os tickets que ainda não foram encerrados.").toolNames,
    ["listar_tickets_abertos"],
  );
});

test("sinônimos de 'fechado': encerrado, concluído, finalizado", () => {
  assert.deepEqual(
    routeTicketQuestion("Liste os chamados encerrados.").toolNames,
    ["listar_tickets_fechados"],
  );
  assert.deepEqual(
    routeTicketQuestion("Mostre os atendimentos concluídos.").toolNames,
    ["listar_tickets_fechados"],
  );
  assert.deepEqual(
    routeTicketQuestion("Liste os chamados finalizados.").toolNames,
    ["listar_tickets_fechados"],
  );
});

test("'recentemente fechados/encerrados' vai para mais_recentes com situação=fechado (não lista tudo sem ordem)", () => {
  const primeira = routeTicketQuestion("Liste os tickets recentemente encerrados.");
  assert.deepEqual(primeira.toolNames, ["listar_tickets_mais_recentes"]);
  assert.equal(primeira.entities.situacao, "fechado");

  const segunda = routeTicketQuestion("Quais tickets foram fechados recentemente?");
  assert.deepEqual(segunda.toolNames, ["listar_tickets_mais_recentes"]);
  assert.equal(segunda.entities.situacao, "fechado");
});

test("'primeiros N tickets' é tratado como 'mais recentes N' (ordem garantida)", () => {
  const route = routeTicketQuestion("Liste os primeiros 5 tickets da área de Suporte.");

  assert.deepEqual(route.toolNames, ["listar_tickets_mais_recentes"]);
  assert.equal(route.entities.area, "Suporte");
  assert.equal(route.entities.limite, 5);
  assert.equal(route.entities.situacao, undefined);
});

test("'primeiros N tickets fechados' combina com situação=fechado", () => {
  const route = routeTicketQuestion("Liste os primeiros 5 tickets fechados.");

  assert.deepEqual(route.toolNames, ["listar_tickets_mais_recentes"]);
  assert.equal(route.entities.limite, 5);
  assert.equal(route.entities.situacao, "fechado");
});

test("'em andamento' mapeia para o status real EM ATENDIMENTO, não para aberto genérico", () => {
  const route = routeTicketQuestion("Quais tickets estão em andamento?");

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.status, "Em atendimento");
});

test("sinônimos de 'sem operador': responsável, atendente, ninguém responsável, aguardando atribuição, não foram atribuídos", () => {
  assert.deepEqual(
    routeTicketQuestion("Mostre os chamados sem responsável.").toolNames,
    ["listar_tickets_sem_operador"],
  );
  assert.deepEqual(
    routeTicketQuestion("Tem ticket que ninguém é responsável?").toolNames,
    ["listar_tickets_sem_operador"],
  );
  assert.deepEqual(
    routeTicketQuestion("Quais chamados estão aguardando atribuição?").toolNames,
    ["listar_tickets_sem_operador"],
  );
  assert.deepEqual(
    routeTicketQuestion("Quais solicitações ainda não foram atribuídas?").toolNames,
    ["listar_tickets_sem_operador"],
  );
});

test("sinônimos de SLA congelado: SLA pausado, relógio parado, tempo suspenso", () => {
  assert.deepEqual(
    routeTicketQuestion("Quais tickets estão com o SLA pausado?").toolNames,
    ["listar_tickets_congelados"],
  );
  assert.deepEqual(
    routeTicketQuestion("Tem algum ticket com o relógio parado?").toolNames,
    ["listar_tickets_congelados"],
  );
});

test("'estão' (plural, com til) no fim da captura não vaza pro nome extraído", () => {
  const congelados = routeTicketQuestion(
    "Quais tickets do departamento COIDS estão com o SLA pausado?",
  );
  assert.deepEqual(congelados.toolNames, ["listar_tickets_congelados"]);
  assert.equal(congelados.entities.departamento, "COIDS");

  const maisAntigos = routeTicketQuestion(
    "Quais chamados do departamento COIDS estão abertos há mais tempo?",
  );
  assert.deepEqual(maisAntigos.toolNames, ["listar_tickets_abertos_mais_antigos"]);
  assert.equal(maisAntigos.entities.departamento, "COIDS");
});

test("'há mais tempo' é sinônimo de 'mais antigos' (tickets abertos há mais tempo)", () => {
  assert.deepEqual(
    routeTicketQuestion("Quais chamados estão abertos há mais tempo?").toolNames,
    ["listar_tickets_abertos_mais_antigos"],
  );
});

test("'recém-abertos' e 'tickets recentes' são sinônimos de mais recentes", () => {
  assert.deepEqual(
    routeTicketQuestion("Mostre os tickets recém-abertos.").toolNames,
    ["listar_tickets_mais_recentes"],
  );
  assert.deepEqual(
    routeTicketQuestion("Mostre os tickets recentes.").toolNames,
    ["listar_tickets_mais_recentes"],
  );
});

// --- Correções reportadas pelo usuário (7 perguntas gerenciais) ---

test("datas relativas: essa semana, semana passada, hoje, ontem, esse mês, mês passado", () => {
  const agora = new Date(2026, 8, 2); // quarta-feira, 2026-09-02

  assert.deepEqual(extractRelativeDateRange("essa semana", agora), {
    dataInicio: "2026-08-31",
    dataFim: "2026-09-04",
  });
  assert.deepEqual(extractRelativeDateRange("semana passada", agora), {
    dataInicio: "2026-08-24",
    dataFim: "2026-08-28",
  });
  assert.deepEqual(extractRelativeDateRange("hoje", agora), {
    dataInicio: "2026-09-02",
    dataFim: "2026-09-02",
  });
  assert.deepEqual(extractRelativeDateRange("ontem", agora), {
    dataInicio: "2026-09-01",
    dataFim: "2026-09-01",
  });
  assert.deepEqual(extractRelativeDateRange("esse mes", agora), {
    dataInicio: "2026-09-01",
    dataFim: "2026-09-30",
  });
  assert.deepEqual(extractRelativeDateRange("mes passado", agora), {
    dataInicio: "2026-08-01",
    dataFim: "2026-08-31",
  });
  assert.equal(extractRelativeDateRange("nenhuma data aqui", agora), undefined);
});

test("bug 1: 'quantos chamados abrimos essa semana?' aplica filtro de data (não cai sem filtro)", () => {
  const decisao = routeTicketQuestion("Quantos chamados abrimos essa semana?");
  assert.deepEqual(decisao.toolNames, ["listar_tickets"]);
  assert.equal(decisao.entities.dataInicio !== undefined, true);
  assert.equal(decisao.entities.dataFim !== undefined, true);
});

test("bug 2: 'sem ninguém pegando' é reconhecido como sinônimo de sem operador", () => {
  assert.deepEqual(
    routeTicketQuestion("Tem ticket parado sem ninguém pegando?").toolNames,
    ["listar_tickets_sem_operador"],
  );
});

test("bug 3: 'atrasados'/'vencidos'/'estourados' usam o proxy de mais antigos em aberto", () => {
  assert.deepEqual(
    routeTicketQuestion("Quais tickets estão atrasados?").toolNames,
    ["listar_tickets_abertos_mais_antigos"],
  );
  assert.deepEqual(
    routeTicketQuestion("Tem ticket com o prazo vencido?").toolNames,
    ["listar_tickets_abertos_mais_antigos"],
  );
});

test("bug 4: 'urgente' sozinho vira filtro de prioridade, combinado com aberto", () => {
  const decisao = routeTicketQuestion("Me mostra os tickets mais urgentes em aberto.");
  assert.deepEqual(decisao.toolNames, ["listar_tickets_abertos"]);
  assert.equal(decisao.entities.prioridade, "Urgente");
});

test("extractPriorityIntent: 'urgente' solto vira prioridade, mas 'alta'/'baixa' soltas não", () => {
  assert.equal(extractPriorityIntent("tickets urgentes"), "Urgente");
  assert.equal(extractPriorityIntent("prioridade alta"), "alta");
  assert.equal(extractPriorityIntent("tickets de alta relevância"), undefined);
});

test("bug 5: 'quem tem mais chamados em aberto no time?' vai pra resumo por operador com situação=aberto", () => {
  const decisao = routeTicketQuestion("Quem tem mais chamados em aberto no time?");
  assert.deepEqual(decisao.toolNames, ["resumo_tickets_por_operador"]);
  assert.equal(decisao.entities.situacao, "aberto");
});

test("bug 6: '‹Nome› está com muito ticket na mão' vai pra análise de carga do operador", () => {
  const decisao = routeTicketQuestion("O Fábio está com muito ticket na mão?");
  assert.deepEqual(decisao.toolNames, ["analisar_carga_operador"]);
  assert.equal(decisao.entities.operador, "Fábio");

  assert.deepEqual(
    routeTicketQuestion("A Maria tem muitos chamados?").toolNames,
    ["analisar_carga_operador"],
  );
});

test("bug 7: 'pessoal da área X' e 'resolveu' (sinônimo de fechado) combinados", () => {
  const decisao = routeTicketQuestion(
    "Quantos tickets o pessoal da Infraestrutura Científica resolveu esse mês?",
  );
  assert.deepEqual(decisao.toolNames, ["listar_tickets_fechados"]);
  assert.equal(decisao.entities.area, "Infraestrutura Científica");
  assert.equal(decisao.entities.dataInicio !== undefined, true);
});

test("dashboard: perguntas de visão geral vão pra resumo_operacional_tickets", () => {
  assert.deepEqual(
    routeTicketQuestion("Me dá uma visão geral dos tickets.").toolNames,
    ["resumo_operacional_tickets"],
  );
  assert.deepEqual(
    routeTicketQuestion("Como está a operação hoje?").toolNames,
    ["resumo_operacional_tickets"],
  );
  assert.deepEqual(
    routeTicketQuestion("Tem alguma coisa preocupante?").toolNames,
    ["resumo_operacional_tickets"],
  );
});

test("extractOperatorWorkloadName reconhece as três frases de carga de trabalho", () => {
  assert.equal(extractOperatorWorkloadName("O Fábio está com muito ticket na mão?"), "Fábio");
  assert.equal(extractOperatorWorkloadName("A Maria está sobrecarregada?"), "Maria");
  assert.equal(extractOperatorWorkloadName("O João tem muitos chamados?"), "João");
  assert.equal(extractOperatorWorkloadName("Liste os tickets abertos."), undefined);
});

test("extractOperatorWorkloadName remove a palavra 'operador' antes do nome", () => {
  assert.equal(
    extractOperatorWorkloadName("O operador Fábio Moreira está sobrecarregado?"),
    "Fábio Moreira",
  );
});
