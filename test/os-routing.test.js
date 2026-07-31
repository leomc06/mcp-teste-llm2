import assert from "node:assert/strict";
import test from "node:test";

import {
  extractDays,
  extractLimit,
  extractOsNumber,
  extractPriority,
  extractRequester,
  extractResponsible,
  extractStatus,
  normalizeText,
  routeOsQuestion,
} from "../agent/os-routing.js";

test("normaliza texto sem remover números", () => {
  assert.equal(
    normalizeText("  OS_CANCELÁDAS -- #1004!!!  "),
    "os canceladas 1004",
  );

  assert.equal(
    normalizeText("Em---ANDAMENTO"),
    "em andamento",
  );
});

const statusCases = {
  aberta: [
    "OS aberta",
    "OS ABERTAS",
    "Chamado aberto",
    "Chamados abertos",
    "Ordens em aberto",
  ],

  em_andamento: [
    "OS em andamento",
    "Chamado sendo atendido",
    "Ordens em execução",
    "OS em processamento",
    "Chamados em atendimento",
  ],

  aguardando: [
    "OS aguardando",
    "Chamados em espera",
    "Ordens esperando",
    "OS aguardando resposta",
    "Chamados pendentes de retorno",
  ],

  concluida: [
    "OS concluída",
    "OS CONCLUIDAS",
    "Chamado concluído",
    "Ordens finalizadas",
    "Chamados resolvidos",
    "OS encerradas",
    "Chamados fechados",
  ],

  cancelada: [
    "OS cancelada",
    "OS CANCELADAS",
    "Chamado cancelado",
    "Chamados anulados",
    "Ordens invalidadas",
    "OS canceládas",
  ],
};

for (const [expectedStatus, questions] of Object.entries(statusCases)) {
  test(`converte aliases para status ${expectedStatus}`, () => {
    for (const question of questions) {
      assert.equal(
        extractStatus(question),
        expectedStatus,
        question,
      );
    }
  });
}

const priorityCases = {
  baixa: [
    "OS de prioridade baixa",
    "Prioridades baixas",
    "Chamado de nível baixo",
  ],

  media: [
    "OS de prioridade média",
    "Prioridades MEDIAS",
    "Chamado de nível médio",
  ],

  alta: [
    "OS de prioridade alta",
    "Prioridades altas",
    "Chamado de nível alto",
  ],

  critica: [
    "OS de prioridade crítica",
    "Prioridades CRITICAS",
    "Chamado de nível crítico",
  ],
};

for (const [expectedPriority, questions] of Object.entries(priorityCases)) {
  test(`converte aliases para prioridade ${expectedPriority}`, () => {
    for (const question of questions) {
      assert.equal(
        extractPriority(question),
        expectedPriority,
        question,
      );
    }
  });
}

test("não converte urgente para prioridade crítica", () => {
  assert.equal(
    extractPriority("Liste as OS urgentes"),
    undefined,
  );
});

test("não converte status negado para o valor negado", () => {
  assert.equal(
    extractStatus("Liste as OS não concluídas"),
    undefined,
  );

  assert.equal(
    extractStatus("Mostre as OS que não foram canceladas"),
    undefined,
  );
});

const numberCases = [
  ["Mostre a OS 1002.", 1002],
  ["Consulte a OS #1002.", 1002],
  ["me mostre a OS com numero 1001", 1001],
  ["Qual a situação da ordem 1002?", 1002],
  ["Consulte a ordem de serviço 1002.", 1002],
  ["Mostre a ordem de serviço de número 1002.", 1002],
  ["Consulte o número da OS 1002.", 1002],
  ["Consulte o chamado 1002.", 1002],
  ["Consulte o protocolo 1002.", 1002],
];

test("extrai números de OS com segurança", () => {
  for (const [question, expectedNumber] of numberCases) {
    assert.equal(
      extractOsNumber(question),
      expectedNumber,
      question,
    );
  }
});

test("não extrai números sem contexto de OS", () => {
  assert.equal(
    extractOsNumber("Mostre os últimos 30 dias"),
    undefined,
  );

  assert.equal(
    extractOsNumber("Limite o resultado a 20 registros"),
    undefined,
  );

  assert.equal(
    extractOsNumber("Consulte a OS 0"),
    undefined,
  );

  assert.equal(
    extractOsNumber("Consulte a OS 99999999999999999999"),
    undefined,
  );
});

test("converte períodos naturais para dias", () => {
  const cases = [
    ["nos últimos 30 dias", 30],
    ["nas últimas 2 semanas", 14],
    ["no último mês", 30],
    ["nos últimos 3 meses", 90],
    ["no último ano", 365],
    ["período de 10 dias", 10],
    ["durante as 2 semanas", 14],
  ];

  for (const [question, expectedDays] of cases) {
    assert.equal(
      extractDays(question),
      expectedDays,
      question,
    );
  }
});

test("rejeita períodos inválidos", () => {
  assert.equal(
    extractDays("nos últimos 0 dias"),
    undefined,
  );

  assert.equal(
    extractDays("nos últimos 11 anos"),
    undefined,
  );

  assert.equal(
    extractDays("Consulte a OS 1002"),
    undefined,
  );
});

test("extrai limites explícitos", () => {
  const cases = [
    ["limite 10", 10],
    ["limite de 20 registros", 20],
    ["no máximo 15 resultados", 15],
    ["mostre as primeiras 5 OS", 5],
    ["mostre até 8 chamados", 8],
  ];

  for (const [question, expectedLimit] of cases) {
    assert.equal(
      extractLimit(question),
      expectedLimit,
      question,
    );
  }
});

test("rejeita limites inválidos ou implícitos", () => {
  assert.equal(
    extractLimit("limite 0"),
    undefined,
  );

  assert.equal(
    extractLimit("limite 101"),
    undefined,
  );

  assert.equal(
    extractLimit("Consulte a OS 1002"),
    undefined,
  );

  assert.equal(
    extractLimit("nos últimos 30 dias"),
    undefined,
  );
});
test("extrai nomes de solicitantes", () => {
  const cases = [
    ["OS solicitadas pela Ana", "Ana"],
    ["Chamados abertos por Bruno", "Bruno"],
    ["Ordens registradas por Carla Souza", "Carla Souza"],
    ["OS criadas pela Érica Lima", "Érica Lima"],
    ["Solicitante: João da Silva", "João da Silva"],
    ["Requerente Maria de Souza", "Maria de Souza"],
  ];

  for (const [question, expectedName] of cases) {
    assert.equal(
      extractRequester(question),
      expectedName,
      question,
    );
  }
});

test("extrai nomes de responsáveis", () => {
  const cases = [
    ["OS do responsável Carlos", "Carlos"],
    ["Responsável: Carlos Lima", "Carlos Lima"],
    ["Chamados atribuídos ao técnico João", "João"],
    ["Ordens designadas a Maria Souza", "Maria Souza"],
    ["Chamados atendidos pela Ana Costa", "Ana Costa"],
    ["Técnico José da Silva", "José da Silva"],
    ["OS atrasadas do Carlos", "Carlos"],
    ["OS críticas atrasadas do João da Silva", "João da Silva"],
    ["Chamados vencidos da Ana Costa", "Ana Costa"],
  ];

  for (const [question, expectedName] of cases) {
    assert.equal(
      extractResponsible(question),
      expectedName,
      question,
    );
  }
});

test("remove filtros posteriores sem alterar o nome", () => {
  assert.equal(
    extractRequester(
      "OS solicitadas pela Ana Costa nos últimos 30 dias",
    ),
    "Ana Costa",
  );

  assert.equal(
    extractResponsible(
      "OS do responsável João da Silva com prioridade crítica",
    ),
    "João da Silva",
  );

  assert.equal(
    extractResponsible(
      "Chamados atendidos pela Maria em andamento",
    ),
    "Maria",
  );
});

test("não inventa pessoas em perguntas sem nome", () => {
  assert.equal(
    extractRequester("Quem solicitou a OS 1002?"),
    undefined,
  );

  assert.equal(
    extractResponsible("Quem é o responsável pela OS 1002?"),
    undefined,
  );

  assert.equal(
    extractResponsible("Liste as OS por prioridade"),
    undefined,
  );

  assert.equal(
    extractResponsible("Liste as OS do Carlos"),
    undefined,
  );

  assert.equal(
    extractResponsible(
      "Liste as OS atrasadas de prioridade alta",
    ),
    undefined,
  );
});

test("inclui pessoas e período na decisão de roteamento", () => {
  const requesterDecision = routeOsQuestion(
    "Liste as OS solicitadas pela Ana Costa nos últimos 30 dias.",
  );

  assert.equal(
    requesterDecision.intent,
    "listar_por_solicitante",
  );

  assert.equal(
    requesterDecision.entities.solicitante,
    "Ana Costa",
  );

  assert.equal(
    requesterDecision.entities.dias,
    30,
  );

  const responsibleDecision = routeOsQuestion(
    "Liste as OS críticas atrasadas do responsável João da Silva.",
  );

  assert.equal(
    responsibleDecision.intent,
    "listar_atrasadas",
  );

  assert.equal(
    responsibleDecision.entities.responsavel,
    "João da Silva",
  );

  assert.equal(
    responsibleDecision.entities.prioridade,
    "critica",
  );
});
