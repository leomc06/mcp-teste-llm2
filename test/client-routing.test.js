import assert from "node:assert/strict";
import test from "node:test";

import {
  extractClientId,
  extractClientName,
  extractEmail,
  routeClientQuestion,
} from "../agent/client-routing.js";

test("extrai e-mail de uma frase, ignorando pontuação final", () => {
  assert.equal(
    extractEmail("Busque o cliente com o e-mail bruno@example.com."),
    "bruno@example.com",
  );

  assert.equal(
    extractEmail("Qual cliente tem o e-mail Ana@Example.com?"),
    "ana@example.com",
  );

  assert.equal(
    extractEmail("Busque o cliente pelo e-mail."),
    undefined,
  );
});

test("extrai identificador numérico do cliente", () => {
  assert.equal(
    extractClientId("Busque o cliente com id 2."),
    2,
  );

  assert.equal(
    extractClientId("Qual o cliente de identificador 15?"),
    15,
  );

  assert.equal(
    extractClientId("Busque o cliente pelo id."),
    undefined,
  );
});

test("extrai nome (ou parte dele) do cliente", () => {
  assert.equal(
    extractClientName("Busque clientes cujo nome contenha Silva."),
    "Silva",
  );

  assert.equal(
    extractClientName("Busque clientes chamados Ana Silva."),
    "Ana Silva",
  );

  assert.equal(
    extractClientName("Busque clientes por nome."),
    undefined,
  );

  assert.equal(
    extractClientName("Existe cliente com o nome Fernanda?"),
    "Fernanda",
  );

  assert.equal(
    extractClientName("Qual cliente tem o nome Camila?"),
    "Camila",
  );

  assert.equal(
    extractClientName("Me dê as informações de Carla Oliveira."),
    "Carla Oliveira",
  );

  assert.equal(
    extractClientName("Quais os dados sobre o cliente Bruno Santos?"),
    "Bruno Santos",
  );
});

const routeCases = [
  [
    "Busque o cliente com o e-mail bruno@example.com.",
    "buscar_cliente_por_email",
    { email: "bruno@example.com" },
  ],
  [
    "Busque o cliente com id 2.",
    "buscar_cliente_por_id",
    { id: 2 },
  ],
  [
    "Busque clientes cujo nome contenha Silva.",
    "buscar_clientes_por_nome",
    { nome: "Silva" },
  ],
  [
    "Busque clientes ativos cujo nome contenha Silva.",
    "buscar_clientes_por_nome",
    { nome: "Silva", ativo: true },
  ],
  [
    "Busque clientes inativos cujo nome contenha Oliveira.",
    "buscar_clientes_por_nome",
    { nome: "Oliveira", ativo: false },
  ],
  [
    "Quais clientes ativos foram cadastrados recentemente?",
    "listar_clientes_recentes",
    { ativo: true },
  ],
  [
    "Quais domínios de e-mail os clientes usam?",
    "listar_dominios_email",
    {},
  ],
  [
    "Qual o resumo dos clientes ativos e inativos?",
    "resumo_clientes",
    {},
  ],
  [
    "Quais foram os clientes cadastrados recentemente?",
    "listar_clientes_recentes",
    {},
  ],
  [
    "Quais clientes estão inativos?",
    "listar_clientes_inativos",
    {},
  ],
  [
    "Liste todos os clientes, incluindo ativos e inativos.",
    "listar_clientes",
    { somenteAtivos: false },
  ],
  [
    "Quantos clientes se cadastraram por mês?",
    "resumo_clientes_por_mes",
    {},
  ],
  [
    "Mostre o cadastro mensal de clientes.",
    "resumo_clientes_por_mes",
    {},
  ],
  [
    "Qual o resumo de clientes por mês?",
    "resumo_clientes_por_mes",
    {},
  ],
  [
    "Quero um resumo mensal de clientes.",
    "resumo_clientes_por_mes",
    {},
  ],
  [
    "Existe cliente com o nome Fernanda?",
    "buscar_clientes_por_nome",
    { nome: "Fernanda" },
  ],
  [
    "Qual cliente tem o nome Camila?",
    "buscar_clientes_por_nome",
    { nome: "Camila" },
  ],
  [
    "Me dê as informações de Carla Oliveira.",
    "buscar_clientes_por_nome",
    { nome: "Carla Oliveira" },
  ],
];

for (const [pergunta, expectedTool, expectedEntities] of routeCases) {
  test(`roteia "${pergunta}" para ${expectedTool}`, () => {
    const route = routeClientQuestion(pergunta);

    assert.equal(route.fallback, false);

    assert.deepEqual(
      route.toolNames,
      [expectedTool],
    );

    for (const [field, value] of Object.entries(expectedEntities)) {
      assert.equal(
        route.entities[field],
        value,
        field,
      );
    }
  });
}

test("pede esclarecimento quando o e-mail não é informado", () => {
  const route = routeClientQuestion(
    "Busque o cliente pelo e-mail.",
  );

  assert.equal(route.fallback, true);
  assert.deepEqual(route.toolNames, []);
  assert.ok(route.clarification);
});

test("pede esclarecimento quando o id não é informado", () => {
  const route = routeClientQuestion(
    "Busque o cliente pelo id.",
  );

  assert.equal(route.fallback, true);
  assert.deepEqual(route.toolNames, []);
  assert.ok(route.clarification);
});

test("pede esclarecimento quando o nome não é informado", () => {
  const route = routeClientQuestion(
    "Busque clientes por nome.",
  );

  assert.equal(route.fallback, true);
  assert.deepEqual(route.toolNames, []);
  assert.ok(route.clarification);
});

test("roteia pergunta sobre OS de um cliente para listar_os_por_cliente", () => {
  const route = routeClientQuestion(
    "Quantas OS o cliente Bruno Santos abriu?",
  );

  assert.equal(route.fallback, false);
  assert.deepEqual(route.toolNames, ["listar_os_por_cliente"]);
  assert.equal(route.entities.cliente, "Bruno Santos");
});

test("aplica o status ao rotear pergunta sobre OS resolvidas de um cliente", () => {
  const route = routeClientQuestion(
    "Quantas OS o cliente Bruno Santos já resolveu?",
  );

  assert.equal(route.fallback, false);
  assert.deepEqual(route.toolNames, ["listar_os_por_cliente"]);
  assert.equal(route.entities.cliente, "Bruno Santos");
  assert.equal(route.entities.status, "concluida");
});

test("pede esclarecimento quando a pergunta é sobre OS de um cliente sem nome informado", () => {
  const route = routeClientQuestion(
    "Quais as OS desse cliente?",
  );

  assert.equal(route.fallback, true);
  assert.deepEqual(route.toolNames, []);
  assert.ok(route.clarification);
});

test("não confunde o artigo 'os' com a sigla OS ao listar clientes", () => {
  const route = routeClientQuestion(
    "Liste todos os clientes, incluindo ativos e inativos.",
  );

  assert.equal(route.fallback, false);
  assert.deepEqual(route.toolNames, ["listar_clientes"]);
});
