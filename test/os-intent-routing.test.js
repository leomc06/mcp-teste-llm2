import assert from "node:assert/strict";
import test from "node:test";

import {
  routeOsQuestion,
} from "../agent/os-routing.js";

const routingCases = [
  {
    question: "Mostre o histórico da OS 1002.",
    tool: "consultar_historico_os",
    intent: "consultar_historico",
  },
  {
    question: "Quem cancelou a OS 1004?",
    tool: "consultar_historico_os",
    intent: "consultar_historico",
  },
  {
    question: "Mostre a OS 1002.",
    tool: "buscar_os_por_numero",
    intent: "buscar_por_numero",
  },
  {
    question: "Consulte o chamado 1002.",
    tool: "buscar_os_por_numero",
    intent: "buscar_por_numero",
  },
  {
    question: "Quantas OS estão canceladas?",
    tool: "resumo_os_por_status",
    intent: "resumo_por_status",
  },
  {
    question: "Mostre a distribuição das OS por status.",
    tool: "resumo_os_por_status",
    intent: "resumo_por_status",
  },
  {
    question: "Quantas OS críticas existem?",
    tool: "resumo_os_por_prioridade",
    intent: "resumo_por_prioridade",
  },
  {
    question: "Mostre a distribuição das OS por prioridade.",
    tool: "resumo_os_por_prioridade",
    intent: "resumo_por_prioridade",
  },
  {
    question: "Liste as OS atrasadas.",
    tool: "listar_os_atrasadas",
    intent: "listar_atrasadas",
  },
  {
    question: "Quais chamados estão vencidos?",
    tool: "listar_os_atrasadas",
    intent: "listar_atrasadas",
  },
  {
    question: "Liste as OS solicitadas pela Ana.",
    tool: "listar_os_por_solicitante",
    intent: "listar_por_solicitante",
  },
  {
    question: "Quais OS foram abertas pela Ana?",
    tool: "listar_os_por_solicitante",
    intent: "listar_por_solicitante",
  },
  {
    question: "Liste as OS do responsável Carlos.",
    tool: "listar_os_por_responsavel",
    intent: "listar_por_responsavel",
  },
  {
    question: "Mostre os chamados atendidos pela Maria.",
    tool: "listar_os_por_responsavel",
    intent: "listar_por_responsavel",
  },
  {
    question: "Liste as OS canceladas.",
    tool: "listar_os_por_status",
    intent: "listar_por_status",
  },
  {
    question: "Mostre os chamados concluídos.",
    tool: "listar_os_por_status",
    intent: "listar_por_status",
  },
  {
    question: "Quais ordens estão aguardando?",
    tool: "listar_os_por_status",
    intent: "listar_por_status",
  },
  {
    question: "Quais OS estão em atendimento?",
    tool: "listar_os_por_status",
    intent: "listar_por_status",
  },
  {
    question: "Quais chamados estão pendentes?",
    tool: "listar_os_abertas",
    intent: "listar_abertas",
  },
  {
    question: "Mostre as ordens ainda não concluídas.",
    tool: "listar_os_abertas",
    intent: "listar_abertas",
  },
];

for (const {
  question,
  tool,
  intent,
} of routingCases) {
  test(`roteia: ${question}`, () => {
    const decision = routeOsQuestion(question);

    assert.ok(decision, question);
    assert.equal(decision.intent, intent, question);
    assert.deepEqual(decision.toolNames, [tool], question);
    assert.equal(decision.fallback, false, question);
  });
}

test("histórico prevalece sobre busca por número", () => {
  const decision = routeOsQuestion(
    "Mostre as movimentações da OS 1002.",
  );

  assert.equal(
    decision.intent,
    "consultar_historico",
  );

  assert.deepEqual(
    decision.toolNames,
    ["consultar_historico_os"],
  );

  assert.equal(decision.entities.numero, 1002);
});

test("contagem prevalece sobre listagem por status", () => {
  const decision = routeOsQuestion(
    "Quantas OS canceladas existem?",
  );

  assert.equal(
    decision.intent,
    "resumo_por_status",
  );

  assert.deepEqual(
    decision.toolNames,
    ["resumo_os_por_status"],
  );

  assert.equal(
    decision.entities.status,
    "cancelada",
  );
});

test("solicitante prevalece sobre status aberta", () => {
  const decision = routeOsQuestion(
    "Liste as OS abertas pela Ana.",
  );

  assert.equal(
    decision.intent,
    "listar_por_solicitante",
  );

  assert.deepEqual(
    decision.toolNames,
    ["listar_os_por_solicitante"],
  );

  assert.equal(
    decision.entities.status,
    "aberta",
  );
});

test("atraso preserva prioridade canônica", () => {
  const decision = routeOsQuestion(
    "Liste as OS críticas atrasadas.",
  );

  assert.equal(
    decision.intent,
    "listar_atrasadas",
  );

  assert.equal(
    decision.entities.prioridade,
    "critica",
  );
});

test("status e prioridade combinados roteiam para listar_os_por_status", () => {
  const decision = routeOsQuestion(
    "Liste as OS canceladas de prioridade alta.",
  );

  assert.equal(decision.intent, "listar_por_status");
  assert.deepEqual(decision.toolNames, ["listar_os_por_status"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.status, "cancelada");
  assert.equal(decision.entities.prioridade, "alta");
});

test("responsável e solicitante combinados roteiam para listar_os_por_solicitante", () => {
  const decision = routeOsQuestion(
    "Liste as OS do responsável Carlos solicitadas pela Ana.",
  );

  assert.equal(decision.intent, "listar_por_solicitante");
  assert.deepEqual(decision.toolNames, ["listar_os_por_solicitante"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.responsavel, "Carlos");
  assert.equal(decision.entities.solicitante, "Ana");
});

test("reconhece intenção de solicitante mesmo com concordância de gênero cruzada", () => {
  const decision = routeOsQuestion(
    "Liste as OS do responsável Carlos solicitadas pelo Rafael.",
  );

  assert.equal(decision.intent, "listar_por_solicitante");
  assert.deepEqual(decision.toolNames, ["listar_os_por_solicitante"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.responsavel, "Carlos");
  assert.equal(decision.entities.solicitante, "Rafael");
});

test("OS abertas do responsável sem nome ainda funcionam, sem pedir esclarecimento", () => {
  const decision = routeOsQuestion(
    "Liste as OS abertas de prioridade crítica do responsável",
  );

  assert.equal(decision.intent, "listar_abertas");
  assert.deepEqual(decision.toolNames, ["listar_os_abertas"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.status, "aberta");
  assert.equal(decision.entities.prioridade, "critica");
  assert.equal(decision.entities.responsavel, undefined);
});

test("responsável sem nome ainda pede esclarecimento quando não há outro filtro", () => {
  const decision = routeOsQuestion(
    "Liste as OS do responsável",
  );

  assert.equal(decision.intent, "clarification");
  assert.deepEqual(decision.toolNames, []);
  assert.equal(decision.fallback, true);
  assert.match(decision.clarification, /nome do responsável/i);
});

test("atrasadas com solicitante preserva o filtro", () => {
  const decision = routeOsQuestion(
    "Quais OS atrasadas foram solicitadas pela Fernanda?",
  );

  assert.equal(decision.intent, "listar_atrasadas");
  assert.deepEqual(decision.toolNames, ["listar_os_atrasadas"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.solicitante, "Fernanda");
});

test("histórico sem número pede esclarecimento", () => {
  const decision = routeOsQuestion(
    "Mostre o histórico das OS.",
  );

  assert.equal(decision.intent, "clarification");
  assert.deepEqual(decision.toolNames, []);
  assert.equal(decision.fallback, true);
  assert.match(decision.clarification, /número da OS/i);
});

test("histórico de todas as OS roteia para listar_historico_os", () => {
  const decision = routeOsQuestion(
    "Mostre o histórico de todas as OS.",
  );

  assert.equal(decision.intent, "historico_geral");
  assert.deepEqual(decision.toolNames, ["listar_historico_os"]);
  assert.equal(decision.fallback, false);
});

test("prioridade sozinha roteia para listar_os_por_prioridade", () => {
  const decision = routeOsQuestion(
    "Liste as OS críticas.",
  );

  assert.equal(decision.intent, "listar_por_prioridade");
  assert.deepEqual(decision.toolNames, ["listar_os_por_prioridade"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.prioridade, "critica");
});

test("contagem sem dimensão roteia para resumo_geral_os", () => {
  const decision = routeOsQuestion(
    "Quantas OS existem no total?",
  );

  assert.equal(decision.intent, "resumo_geral");
  assert.deepEqual(decision.toolNames, ["resumo_geral_os"]);
  assert.equal(decision.fallback, false);
});

test("contagem com atraso continua indo para listar_os_atrasadas", () => {
  const decision = routeOsQuestion(
    "Quantas OS atrasadas existem?",
  );

  assert.equal(decision.intent, "listar_atrasadas");
  assert.deepEqual(decision.toolNames, ["listar_os_atrasadas"]);
  assert.equal(decision.fallback, false);
});

test("tempo médio de atendimento roteia para tempo_medio_resolucao_os", () => {
  const decision = routeOsQuestion(
    "Qual o tempo médio de atendimento das OS?",
  );

  assert.equal(decision.intent, "tempo_medio_resolucao");
  assert.deepEqual(decision.toolNames, ["tempo_medio_resolucao_os"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.prioridade, undefined);
});

test("tempo médio de resolução com prioridade preserva o filtro sem confundir com prioridade média", () => {
  const decision = routeOsQuestion(
    "Qual o tempo médio de resolução das OS críticas?",
  );

  assert.equal(decision.intent, "tempo_medio_resolucao");
  assert.deepEqual(decision.toolNames, ["tempo_medio_resolucao_os"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.prioridade, "critica");
});

test("pergunta genérica sobre OS não retorna vazio silencioso", () => {
  const decision = routeOsQuestion(
    "Mostre informações sobre as OS.",
  );

  assert.equal(decision.intent, "clarification");
  assert.deepEqual(decision.toolNames, []);
  assert.equal(decision.fallback, true);
  assert.ok(decision.clarification);
});

test("pergunta de contagem por responsável sem nome roteia para resumo_os_por_responsavel em vez de inventar nome", () => {
  const decision = routeOsQuestion(
    "Quantas OS cada responsável tem?",
  );

  assert.equal(decision.intent, "resumo_por_responsavel");
  assert.deepEqual(decision.toolNames, ["resumo_os_por_responsavel"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.responsavel, undefined);
});

test("pergunta de contagem por solicitante sem nome roteia para resumo_os_por_solicitante em vez de inventar nome", () => {
  const decision = routeOsQuestion(
    "Quantas OS cada solicitante tem?",
  );

  assert.equal(decision.intent, "resumo_por_solicitante");
  assert.deepEqual(decision.toolNames, ["resumo_os_por_solicitante"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.solicitante, undefined);
});

test("contagem por responsável com nome específico continua indo para listar_os_por_responsavel", () => {
  const decision = routeOsQuestion(
    "Quantas OS estão com o responsável Carlos?",
  );

  assert.equal(decision.intent, "listar_por_responsavel");
  assert.deepEqual(decision.toolNames, ["listar_os_por_responsavel"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.responsavel, "Carlos");
});

test("pergunta com verbo de conclusão e nome roteia para listar_os_por_responsavel filtrando por concluída", () => {
  const decision = routeOsQuestion(
    "Quantas OS o Marcos já resolveu?",
  );

  assert.equal(decision.intent, "listar_por_responsavel");
  assert.deepEqual(decision.toolNames, ["listar_os_por_responsavel"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.responsavel, "Marcos");
  assert.equal(decision.entities.status, "concluida");
});

test("pergunta casual sem artigo, minúsculas e sem acento também extrai o nome", () => {
  const decision = routeOsQuestion(
    "quantas os marcos ja resolveu",
  );

  assert.equal(decision.intent, "listar_por_responsavel");
  assert.deepEqual(decision.toolNames, ["listar_os_por_responsavel"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.responsavel, "marcos");
  assert.equal(decision.entities.status, "concluida");
});

test("pergunta com verbo de abertura e nome roteia para listar_os_por_solicitante", () => {
  const decision = routeOsQuestion(
    "Quantas OS a Fernanda já abriu?",
  );

  assert.equal(decision.intent, "listar_por_solicitante");
  assert.deepEqual(decision.toolNames, ["listar_os_por_solicitante"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.solicitante, "Fernanda");
});

test("verbo de conclusão sem nome específico continua indo para resumo_os_por_responsavel", () => {
  const decision = routeOsQuestion(
    "Quantas OS cada responsável já resolveu?",
  );

  assert.equal(decision.intent, "resumo_por_responsavel");
  assert.deepEqual(decision.toolNames, ["resumo_os_por_responsavel"]);
  assert.equal(decision.fallback, false);
  assert.equal(decision.entities.responsavel, undefined);
});

test("contagem por status sem nome continua indo para resumo_os_por_status", () => {
  const decision = routeOsQuestion(
    "Quantas OS estão canceladas?",
  );

  assert.equal(decision.intent, "resumo_por_status");
  assert.deepEqual(decision.toolNames, ["resumo_os_por_status"]);
});

test("pergunta de clientes não é classificada como OS", () => {
  assert.equal(
    routeOsQuestion("Liste os clientes cancelados."),
    null,
  );
});

test("solicitante sem nome pede esclarecimento", () => {
  const decision = routeOsQuestion(
    "Liste as OS por solicitante.",
  );

  assert.equal(decision.intent, "clarification");
  assert.deepEqual(decision.toolNames, []);
  assert.equal(decision.fallback, true);
  assert.match(
    decision.clarification,
    /nome do solicitante/i,
  );
});

test("responsável sem nome pede esclarecimento", () => {
  const decision = routeOsQuestion(
    "Liste as OS por responsável.",
  );

  assert.equal(decision.intent, "clarification");
  assert.deepEqual(decision.toolNames, []);
  assert.equal(decision.fallback, true);
  assert.match(
    decision.clarification,
    /nome do responsável/i,
  );
});

test("responsável sem nome combinado com status pede esclarecimento em vez de perder o filtro", () => {
  const decision = routeOsQuestion(
    "Quais OS canceladas do responsável?",
  );

  assert.equal(decision.intent, "clarification");
  assert.deepEqual(decision.toolNames, []);
  assert.equal(decision.fallback, true);
  assert.match(
    decision.clarification,
    /nome do responsável/i,
  );
});

test("OS recentes roteia para listar_os_recentes", () => {
  const decision = routeOsQuestion(
    "Quais são as OS mais recentes?",
  );

  assert.equal(decision.intent, "listar_recentes");
  assert.deepEqual(decision.toolNames, ["listar_os_recentes"]);
  assert.equal(decision.fallback, false);
});

test("OS recentes com prioridade preserva o filtro", () => {
  const decision = routeOsQuestion(
    "Liste as OS críticas mais recentes.",
  );

  assert.equal(decision.intent, "listar_recentes");
  assert.deepEqual(decision.toolNames, ["listar_os_recentes"]);
  assert.equal(decision.entities.prioridade, "critica");
});

test("OS recentes com responsável nomeado continua indo para listar_os_por_responsavel", () => {
  const decision = routeOsQuestion(
    "Quais as OS mais recentes do responsável Carlos?",
  );

  assert.equal(decision.intent, "listar_por_responsavel");
  assert.deepEqual(decision.toolNames, ["listar_os_por_responsavel"]);
  assert.equal(decision.entities.responsavel, "Carlos");
});

test("liste todas as OS roteia para listar_os_recentes", () => {
  const decision = routeOsQuestion("liste todas os");

  assert.equal(decision.intent, "listar_recentes");
  assert.deepEqual(decision.toolNames, ["listar_os_recentes"]);
  assert.equal(decision.fallback, false);
});

test("todas as OS canceladas continua indo para listar_os_por_status", () => {
  const decision = routeOsQuestion("Liste todas as OS canceladas.");

  assert.equal(decision.intent, "listar_por_status");
  assert.deepEqual(decision.toolNames, ["listar_os_por_status"]);
  assert.equal(decision.entities.status, "cancelada");
});

test("todas as OS do responsável Carlos continua indo para listar_os_por_responsavel", () => {
  const decision = routeOsQuestion(
    "Liste todas as OS do responsável Carlos.",
  );

  assert.equal(decision.intent, "listar_por_responsavel");
  assert.deepEqual(decision.toolNames, ["listar_os_por_responsavel"]);
  assert.equal(decision.entities.responsavel, "Carlos");
});
