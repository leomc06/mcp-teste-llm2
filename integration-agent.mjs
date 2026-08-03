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
      "Mostre o histórico da OS 1004.",
    expectedTool: "consultar_historico_os",
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
