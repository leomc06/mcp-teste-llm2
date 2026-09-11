import assert from "node:assert/strict";
import test from "node:test";

import {
  extractAreaName,
  extractClientName,
  extractDateRange,
  extractDepartmentName,
  extractOperatorComparisonNames,
  extractOperatorName,
  extractOperatorWorkloadName,
  extractPage,
  extractPriorityIntent,
  extractPriorityName,
  extractRelativeDateRange,
  extractSearchText,
  extractTicketComparisonNumbers,
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

test("bug: 'liste todos os status'/'liste todas as areas' com quantificador não caem no fallback de tickets", () => {
  assert.deepEqual(
    routeTicketQuestion("Liste todos os status.").toolNames,
    ["listar_status_tickets"],
  );
  assert.deepEqual(
    routeTicketQuestion("Liste todas as areas.").toolNames,
    ["listar_areas_tickets"],
  );
  assert.deepEqual(
    routeTicketQuestion("Liste todos os canais.").toolNames,
    ["listar_canais_tickets"],
  );
  assert.deepEqual(
    routeTicketQuestion("Liste todas as prioridades.").toolNames,
    ["listar_prioridades_tickets"],
  );
  assert.deepEqual(
    routeTicketQuestion("Liste todos os departamentos.").toolNames,
    ["listar_departamentos_tickets"],
  );
  assert.deepEqual(
    routeTicketQuestion("Liste todos os usuarios.").toolNames,
    ["listar_usuarios_tickets"],
  );
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

test("bug: 'aguardando atendimento' reconhecido como status literal (não mistura com em atendimento)", () => {
  const route = routeTicketQuestion("Liste os tickets aguardando atendimento.");

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.status, "Aguardando atendimento");
});

test("todos os status reais são reconhecidos sem a palavra 'status' na frase", () => {
  const casos = [
    ["Tickets em estudo.", "Em estudo"],
    ["Chamados agendados com o usuário.", "Agendado com o usuário"],
    ["Quais tickets foram cancelados?", "Cancelado"],
    ["Tickets aguardando feedback do usuário.", "Aguardando feedback do usuário"],
    ["Chamados aguardando feedback.", "Aguardando feedback do usuário"],
    ["Tickets indisponível para atendimento.", "Indisponível para atendimento"],
    ["Chamados encaminhados para operador.", "Encaminhado para operador"],
    ["Tickets interrompidos para atender outro chamado.", "Interrompido para atender outro chamado"],
    ["Chamados aguardando retorno do fornecedor.", "Aguardando retorno do fornecedor"],
    ["Tickets com backup.", "Com backup"],
    ["Chamados reservados para operador.", "Reservado para operador"],
    ["Tickets aguardando aprovação.", "Aguardando aprovação"],
    ["Chamados aguardando RDM.", "Aguardando RDM"],
  ];

  for (const [pergunta, statusEsperado] of casos) {
    const route = routeTicketQuestion(pergunta);

    assert.equal(route.entities.status, statusEsperado, pergunta);
  }
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

test("datas relativas: esse ano, ano passado", () => {
  const agora = new Date(2026, 8, 2); // 2026-09-02

  assert.deepEqual(extractRelativeDateRange("esse ano", agora), {
    dataInicio: "2026-01-01",
    dataFim: "2026-12-31",
  });
  assert.deepEqual(extractRelativeDateRange("este ano", agora), {
    dataInicio: "2026-01-01",
    dataFim: "2026-12-31",
  });
  assert.deepEqual(extractRelativeDateRange("ano passado", agora), {
    dataInicio: "2025-01-01",
    dataFim: "2025-12-31",
  });
});

test("bug: 'qual cliente mais abriu chamados este ano' vai pra resumo por cliente com data aplicada (não captura 'mais abriu...' como nome de cliente)", () => {
  const decisao = routeTicketQuestion("Qual cliente mais abriu chamados este ano?");

  assert.deepEqual(decisao.toolNames, ["resumo_tickets_por_cliente"]);
  assert.equal(decisao.entities.cliente, undefined);
  assert.ok(decisao.entities.dataInicio?.endsWith("-01-01"));
  assert.ok(decisao.entities.dataFim?.endsWith("-12-31"));
});

test("bug: 'mais' invertido não polui a extração de área/departamento/operador como nome de filtro", () => {
  assert.equal(
    routeTicketQuestion("Qual área mais tem tickets?").entities.area,
    undefined,
  );
  assert.equal(
    routeTicketQuestion("Qual departamento mais abriu chamados?").entities.departamento,
    undefined,
  );
  assert.equal(
    routeTicketQuestion("Qual operador mais tem tickets?").entities.operador,
    undefined,
  );
});

test("'X com mais Y' aciona ranking, mas 'com mais de N dias' continua sendo limiar de idade", () => {
  assert.deepEqual(
    routeTicketQuestion("Top 5 operadores com mais tickets na área Suporte").toolNames,
    ["resumo_tickets_por_operador"],
  );
  assert.deepEqual(
    routeTicketQuestion("Tickets abertos há mais de 7 dias na área Suporte").toolNames,
    ["listar_tickets_abertos"],
  );
});

test("'menos' (oposto de 'mais') também aciona ranking, sem poluir nome extraído", () => {
  const semOperador = routeTicketQuestion("Qual operador tem menos tickets?");
  assert.deepEqual(semOperador.toolNames, ["resumo_tickets_por_operador"]);
  assert.equal(semOperador.entities.operador, undefined);

  const semArea = routeTicketQuestion("Qual área tem menos chamados?");
  assert.deepEqual(semArea.toolNames, ["resumo_tickets_por_area"]);
  assert.equal(semArea.entities.area, undefined);

  assert.deepEqual(
    routeTicketQuestion("Quem mais tem tickets abertos?").toolNames,
    ["resumo_tickets_por_operador"],
  );
  assert.deepEqual(
    routeTicketQuestion("Quem tem menos tickets?").toolNames,
    ["resumo_tickets_por_operador"],
  );
});

test("verbo no passado (fechou/encerrou/concluiu) conta como fechado, tanto pra situação quanto pro corte de nome extraído", () => {
  const fechouComArea = routeTicketQuestion("Quantos tickets a área Suporte fechou essa semana?");
  assert.deepEqual(fechouComArea.toolNames, ["listar_tickets_fechados"]);
  assert.equal(fechouComArea.entities.area, "Suporte");

  const concluiuComArea = routeTicketQuestion("A área WEB concluiu quantos chamados?");
  assert.deepEqual(concluiuComArea.toolNames, ["listar_tickets_fechados"]);
  assert.equal(concluiuComArea.entities.area, "WEB");

  assert.deepEqual(
    routeTicketQuestion("A área X encerrou quantos tickets essa semana?").toolNames,
    ["listar_tickets_fechados"],
  );
});

test("'não tem operador' e 'sem dono' são sinônimos de sem operador (não só 'não atribuído')", () => {
  assert.deepEqual(
    routeTicketQuestion("Quantos tickets não têm operador?").toolNames,
    ["listar_tickets_sem_operador"],
  );
  assert.deepEqual(
    routeTicketQuestion("Tickets sem dono").toolNames,
    ["listar_tickets_sem_operador"],
  );
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

// --- Fase 2: busca textual, resumo por cliente, ranking/percentual, prioridade extra ---

test("extrai texto de busca de diferentes conectores", () => {
  assert.equal(extractSearchText("Tickets sobre impressora."), "impressora");
  assert.equal(
    extractSearchText("Chamados relacionados a rede."),
    "rede",
  );
  assert.equal(
    extractSearchText("Chamados que falam de VPN."),
    "VPN",
  );
  assert.equal(extractSearchText("Liste os tickets."), undefined);
});

test("roteia busca de tickets por texto", () => {
  const route = routeTicketQuestion("Tickets sobre impressora.");

  assert.deepEqual(route.toolNames, ["buscar_tickets_por_texto"]);
  assert.equal(route.entities.texto, "impressora");
});

test("busca por texto combina com situação (abertos sobre X)", () => {
  const route = routeTicketQuestion("Liste os tickets abertos sobre queda de energia.");

  assert.deepEqual(route.toolNames, ["buscar_tickets_por_texto"]);
  assert.equal(route.entities.texto, "queda de energia");
  assert.equal(route.entities.situacao, "aberto");
});

test("busca por número tem prioridade sobre busca por texto", () => {
  const route = routeTicketQuestion("Ticket 123 sobre impressora.");

  assert.deepEqual(route.toolNames, ["buscar_ticket_por_numero"]);
  assert.equal(route.entities.numero, 123);
});

test("roteia resumo de tickets por cliente", () => {
  const route = routeTicketQuestion("Quantos tickets por cliente?");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_cliente"]);
});

test("'X abre mais' também aciona ranking por dimensão (ex.: cliente que mais abre chamados)", () => {
  const route = routeTicketQuestion("Qual cliente abre mais chamados?");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_cliente"]);
});

test("'top N' aplica limite nas tools de resumo", () => {
  const route = routeTicketQuestion("Resumo de tickets por operador, top 5.");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_operador"]);
  assert.equal(route.entities.limite, 5);
});

test("bug: prioridade não se perde em 'tickets urgentes sem operador'", () => {
  const route = routeTicketQuestion("Tickets urgentes sem operador.");

  assert.deepEqual(route.toolNames, ["listar_tickets_sem_operador"]);
  assert.equal(route.entities.prioridade, "Urgente");
});

test("prioridade chega em tickets congelados, mais antigos e mais recentes", () => {
  const congelados = routeTicketQuestion("Tickets urgentes congelados.");
  assert.deepEqual(congelados.toolNames, ["listar_tickets_congelados"]);
  assert.equal(congelados.entities.prioridade, "Urgente");

  const maisAntigos = routeTicketQuestion("Tickets urgentes mais antigos.");
  assert.deepEqual(maisAntigos.toolNames, ["listar_tickets_abertos_mais_antigos"]);
  assert.equal(maisAntigos.entities.prioridade, "Urgente");

  const maisRecentes = routeTicketQuestion("Tickets urgentes mais recentes.");
  assert.deepEqual(maisRecentes.toolNames, ["listar_tickets_mais_recentes"]);
  assert.equal(maisRecentes.entities.prioridade, "Urgente");
});

test("'crítico(s)' é sinônimo de prioridade Urgente (gap G1)", () => {
  const route = routeTicketQuestion("Quais são os tickets mais críticos?");
  assert.equal(route.entities.prioridade, "Urgente");
});

test("'categoria' é sinônimo de área (gap G2) — tanto como filtro quanto como dimensão de resumo", () => {
  const filtro = routeTicketQuestion("Quais tickets são da categoria Suporte?");
  assert.equal(filtro.entities.area, "Suporte");

  const resumo = routeTicketQuestion("Resumo de tickets por categoria.");
  assert.deepEqual(resumo.toolNames, ["resumo_tickets_por_area"]);
});

test("'menos' pede ordem ascendente no resumo (gap P3) — 'mais' e ausência de direção continuam descendente", () => {
  const menos = routeTicketQuestion("Qual operador tem menos tickets?");
  assert.equal(menos.entities.ordem, "asc");

  const mais = routeTicketQuestion("Qual operador tem mais tickets?");
  assert.equal(mais.entities.ordem, undefined);

  const semDirecao = routeTicketQuestion("Resumo de tickets por operador.");
  assert.equal(semDirecao.entities.ordem, undefined);
});

test("'menos de N dias' e 'pelo menos N' não são lidos como direção de ranking (só limiar/quantidade)", () => {
  const menosDeDias = routeTicketQuestion("Tickets abertos há menos de 7 dias na área Suporte");
  assert.equal(menosDeDias.entities.ordem, undefined);

  const peloMenos = routeTicketQuestion("Resumo de tickets por operador, pelo menos 5 tickets cada.");
  assert.equal(peloMenos.entities.ordem, undefined);
});

// --- G3: comparação entre 2 tickets ou 2 operadores no mesmo turno ---

test("extractTicketComparisonNumbers extrai os 2 números só quando há conector de comparação", () => {
  assert.deepEqual(
    extractTicketComparisonNumbers("Compare o ticket 100 com o ticket 200."),
    [100, 200],
  );
  assert.deepEqual(
    extractTicketComparisonNumbers("Qual a diferença entre os tickets 50 e 75?"),
    [50, 75],
  );
  // sem conector de comparação, não extrai (mesmo com 2 números soltos)
  assert.equal(extractTicketComparisonNumbers("Atualize o ticket 100 e o ticket 200."), undefined);
  // só 1 número, mesmo com conector
  assert.equal(extractTicketComparisonNumbers("Compare o ticket 100 com o estoque."), undefined);
});

test("extractOperatorComparisonNames extrai os 2 nomes só quando menciona 'carga'", () => {
  assert.deepEqual(
    extractOperatorComparisonNames("Compare a carga do Fábio Gali com a do Cesar Augusto de Mello"),
    ["Fábio Gali", "Cesar Augusto de Mello"],
  );
  assert.deepEqual(
    extractOperatorComparisonNames("Qual a diferença de carga entre Bruno e João Pedro?"),
    ["Bruno", "João Pedro"],
  );
  // sem "carga", não extrai (evita capturar comparação de outra coisa, ex. áreas)
  assert.equal(extractOperatorComparisonNames("Compare as áreas Suporte e WEB"), undefined);
});

test("routeTicketQuestion: 'compare os tickets X e Y' vira 2 chamadas de buscar_ticket_por_numero, sem passar pelo caminho de número único", () => {
  const route = routeTicketQuestion("Compare o ticket 4830 com o ticket 4880.");

  assert.equal(route.compare?.length, 2);
  assert.deepEqual(route.compare[0], { toolName: "buscar_ticket_por_numero", args: { numero: 4830 } });
  assert.deepEqual(route.compare[1], { toolName: "buscar_ticket_por_numero", args: { numero: 4880 } });
  assert.deepEqual(route.toolNames, ["buscar_ticket_por_numero"]);
});

test("routeTicketQuestion: 'compare a carga de X com a de Y' vira 2 chamadas de analisar_carga_operador", () => {
  const route = routeTicketQuestion("Compare a carga do Fábio Gali com a do Cesar Augusto de Mello.");

  assert.equal(route.compare?.length, 2);
  assert.deepEqual(route.compare[0], { toolName: "analisar_carga_operador", args: { operador: "Fábio Gali" } });
  assert.deepEqual(
    route.compare[1],
    { toolName: "analisar_carga_operador", args: { operador: "Cesar Augusto de Mello" } },
  );
});

test("perguntas normais (sem comparação) continuam sem o campo 'compare'", () => {
  assert.equal(routeTicketQuestion("Busque o ticket 4830.").compare, undefined);
  assert.equal(routeTicketQuestion("O Fábio está com muito ticket na mão?").compare, undefined);
});
