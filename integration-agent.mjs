import assert from "node:assert/strict";

const endpoint =
  "http://127.0.0.1:3100/api/ia/consultar-os";

const cases = [
  {
    question: "Busque o ticket 4830.",
    expectedTool: "buscar_ticket_por_numero",
  },
  {
    question:
      "Liste os tickets da área de WEB.",
    expectedTool: "listar_tickets",
  },
  {
    question:
      "Liste os tickets com status Encerrada.",
    expectedTool: "listar_tickets",
  },
  {
    question:
      "Quais tickets estão congelados?",
    expectedTool: "listar_tickets_congelados",
  },
  {
    question:
      "Resumo dos tickets por status.",
    expectedTool: "resumo_tickets_por_status",
  },
  {
    question:
      "Quantos tickets por prioridade?",
    expectedTool: "resumo_tickets_por_prioridade",
  },
  {
    question:
      "Resumo de tickets por área.",
    expectedTool: "resumo_tickets_por_area",
  },
  {
    question:
      "Quais áreas de ticket existem?",
    expectedTool: "listar_areas_tickets",
  },
  {
    question:
      "Quais prioridades de ticket existem?",
    expectedTool: "listar_prioridades_tickets",
  },
  {
    question:
      "Quais canais de ticket existem?",
    expectedTool: "listar_canais_tickets",
  },
  {
    question:
      "Liste os status de ticket.",
    expectedTool: "listar_status_tickets",
  },
  {
    question:
      "Quais departamentos de ticket existem?",
    expectedTool: "listar_departamentos_tickets",
  },
  {
    question:
      "Quais usuários de ticket existem?",
    expectedTool: "listar_usuarios_tickets",
  },
  {
    question:
      "Cancele o ticket 4830.",
    expectedWriteBlock: true,
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
