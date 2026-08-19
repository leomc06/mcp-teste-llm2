import assert from "node:assert/strict";

const endpoint =
  "http://127.0.0.1:3100/api/ia/consultar-os";

const cases = [
  {
    question: "Mostre a OS 1002.",
    expectedTool: "buscar_os_por_numero",
  },
  {
    question:
      "Liste as OS abertas de prioridade alta.",
    expectedTool: "listar_os_abertas",
  },
  {
    question:
      "Liste as OS críticas atrasadas.",
    expectedTool: "listar_os_atrasadas",
  },
  {
    question:
      "Liste as OS do responsável Ana Costa.",
    expectedTool: "listar_os_por_responsavel",
  },
  {
    question:
      "Liste as OS solicitadas por João Mendes.",
    expectedTool: "listar_os_por_solicitante",
  },
  {
    question:
      "Liste as OS do cliente Bruno Santos.",
    expectedTool: "listar_os_por_cliente",
  },
  {
    question:
      "Mostre o histórico da OS 1004.",
    expectedTool: "consultar_historico_os",
  },
  {
    question:
      "Mostre o histórico de todas as OS.",
    expectedTool: "listar_historico_os",
  },
  {
    question:
      "Liste as OS canceladas de prioridade baixa.",
    expectedTool: "listar_os_por_status",
  },
  {
    question:
      "Liste as OS solicitadas por Fernanda de prioridade crítica.",
    expectedTool: "listar_os_por_solicitante",
  },
  {
    question:
      "Liste as OS do responsável Carlos Souza de prioridade alta.",
    expectedTool: "listar_os_por_responsavel",
  },
  {
    question:
      "Liste as OS do responsável Carlos solicitadas pelo Rafael.",
    expectedTool: "listar_os_por_solicitante",
  },
  {
    question:
      "Quais OS atrasadas foram solicitadas pelo Rafael Martins?",
    expectedTool: "listar_os_atrasadas",
  },
  {
    question:
      "Qual o resumo por status das OS do responsável Carlos Souza?",
    expectedTool: "resumo_os_por_status",
  },
  {
    question:
      "Quantas OS de prioridade alta foram solicitadas pela Ana?",
    expectedTool: "resumo_os_por_prioridade",
  },
  {
    question:
      "Mostre o histórico de todas as OS canceladas.",
    expectedTool: "listar_historico_os",
  },
  {
    question:
      "Liste as OS abertas de prioridade crítica do responsável",
    expectedTool: "listar_os_abertas",
  },
  {
    question:
      "Busque clientes inativos cujo nome contenha Oliveira.",
    expectedTool: "buscar_clientes_por_nome",
  },
  {
    question:
      "Quais clientes ativos foram cadastrados recentemente?",
    expectedTool: "listar_clientes_recentes",
  },
  {
    question:
      "Mostre o resumo das OS por status.",
    expectedTool: "resumo_os_por_status",
  },
  {
    question:
      "Mostre a distribuição das OS por prioridade.",
    expectedTool: "resumo_os_por_prioridade",
  },
  {
    question:
      "Liste as OS canceladas.",
    expectedTool: "listar_os_por_status",
  },
  {
    question:
      "Mostre informações sobre as OS.",
    expectedClarification: true,
  },
  {
    question:
      "Cancele a OS 1004.",
    expectedWriteBlock: true,
  },
  {
    question:
      "Busque o cliente com o e-mail bruno@example.com.",
    expectedTool: "buscar_cliente_por_email",
  },
  {
    question:
      "Busque o cliente com id 2.",
    expectedTool: "buscar_cliente_por_id",
  },
  {
    question:
      "Busque clientes cujo nome contenha Silva.",
    expectedTool: "buscar_clientes_por_nome",
  },
  {
    question:
      "Liste todos os clientes, incluindo ativos e inativos.",
    expectedTool: "listar_clientes",
  },
];

async function consult(question) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": "teste-integracao",
    },
    body: JSON.stringify({
      pergunta: question,
    }),
    signal: AbortSignal.timeout(310000),
  });

  const data = await response.json();

  assert.equal(
    response.ok,
    true,
    `${question}: HTTP ${response.status}`,
  );

  return data;
}

const requestedCase = process.argv[2];
let selectedCases = cases;

if (requestedCase !== undefined) {
  const caseNumber = Number(requestedCase);

  if (
    !Number.isInteger(caseNumber)
    || caseNumber < 1
    || caseNumber > cases.length
  ) {
    console.error(
      `Informe um caso entre 1 e ${cases.length}.`,
    );
    process.exit(1);
  }

  selectedCases = [
    cases[caseNumber - 1],
  ];
}

for (const testCase of selectedCases) {
  const data = await consult(testCase.question);

  if (testCase.expectedTool) {
    assert.deepEqual(
      data.toolsUtilizadas,
      [testCase.expectedTool],
      testCase.question,
    );

    assert.equal(
      data.quantidadeChamadas,
      1,
      testCase.question,
    );

    assert.ok(
      Array.isArray(data.dadosConsultados),
      testCase.question,
    );

    assert.equal(
      data.dadosConsultados.some(
        ({ tool }) =>
          tool === testCase.expectedTool,
      ),
      true,
      testCase.question,
    );

    assert.notEqual(
      data.resposta?.trim(),
      "",
      testCase.question,
    );
  }

  if (testCase.expectedClarification) {
    assert.equal(
      data.esclarecimento,
      true,
      testCase.question,
    );

    assert.deepEqual(
      data.toolsUtilizadas,
      [],
      testCase.question,
    );

    assert.equal(
      data.quantidadeChamadas,
      0,
      testCase.question,
    );
  }

  if (testCase.expectedWriteBlock) {
    assert.notEqual(
      data.esclarecimento,
      true,
      testCase.question,
    );

    assert.deepEqual(
      data.toolsUtilizadas,
      [],
      testCase.question,
    );

    assert.equal(
      data.quantidadeChamadas,
      0,
      testCase.question,
    );

    assert.match(
      data.resposta,
      /somente consultas/i,
      testCase.question,
    );
  }

  console.log(
    `OK: ${testCase.question}`,
  );
}

console.log(
  `Integração concluída: ${selectedCases.length}/${selectedCases.length}.`,
);
