import { test } from "node:test";
import assert from "node:assert/strict";
import { detectTabularShape, buildRefinementChips } from "../web/shapes.js";
import { routeTicketQuestion } from "../agent/tickets-routing.js";

test("detectTabularShape: forma 'resumo' (resumo_tickets_por_*)", () => {
  const shape = detectTabularShape([
    {
      tool: "resumo_tickets_por_status",
      dados: {
        filtros: { area: "Suporte" },
        total_tickets: 15,
        resumo: [
          { chave: "ENCERRADA", quantidade: 9, percentual: 60 },
          { chave: "CANCELADO", quantidade: 6, percentual: 40 },
        ],
      },
    },
  ]);

  assert.deepEqual(shape, {
    kind: "resumo",
    tool: "resumo_tickets_por_status",
    total: 15,
    filtros: { area: "Suporte" },
    rows: [
      { label: "ENCERRADA", value: 9, percent: 60 },
      { label: "CANCELADO", value: 6, percent: 40 },
    ],
  });
});

test("detectTabularShape: forma 'operacional' (resumo_operacional_tickets)", () => {
  const shape = detectTabularShape([
    {
      tool: "resumo_operacional_tickets",
      dados: {
        filtros: { area: "Suporte" },
        total: 20,
        abertos: 6,
        fechados: 14,
        sem_operador: 2,
        congelados: 1,
        abertos_com_mais_de_7_dias: 3,
        por_prioridade: [{ chave: "Urgente", quantidade: 4 }],
      },
    },
  ]);

  assert.equal(shape.kind, "operacional");
  assert.deepEqual(shape.filtros, { area: "Suporte" });
  assert.deepEqual(shape.rows, [
    { label: "Abertos", value: 6 },
    { label: "Fechados", value: 14 },
    { label: "Sem operador", value: 2 },
    { label: "Congelados", value: 1 },
    { label: "Abertos +7 dias", value: 3 },
  ]);
  assert.deepEqual(shape.porPrioridade, [{ label: "Urgente", value: 4 }]);
});

test("detectTabularShape: forma 'lista' (tools de listagem paginadas) marca isPartial", () => {
  const shape = detectTabularShape([
    {
      tool: "listar_tickets",
      dados: { tickets: [{ number: 1 }, { number: 2 }], pagina: 1, paginas: 3 },
    },
  ]);

  assert.equal(shape.kind, "lista");
  assert.equal(shape.isPartial, true);
  assert.equal(shape.rows.length, 2);
});

test("detectTabularShape: forma não reconhecida retorna null", () => {
  assert.equal(
    detectTabularShape([{ tool: "qualquer_coisa", dados: { mensagem: "sem forma tabular" } }]),
    null,
  );
  assert.equal(detectTabularShape([]), null);
  assert.equal(detectTabularShape(null), null);
  assert.equal(detectTabularShape(undefined), null);
});

// Achado ao vivo: pedidos de tabela/gráfico só funcionavam pras tools de
// resumo/operacional/listagem — catálogos (áreas/prioridades/canais/status/
// departamentos/usuários), ticket único e carga/atividade individual não
// tinham forma nenhuma reconhecida, então nunca ofereciam tabela/gráfico,
// mesmo pedindo explicitamente.
test("detectTabularShape: forma 'catalogo' (listar_areas_tickets e afins)", () => {
  const shape = detectTabularShape([
    {
      tool: "listar_areas_tickets",
      dados: {
        quantidade: 2,
        areas: [
          { id: 10, name: "Suporte", active: true },
          { id: 7, name: "Redes e Segurança", active: true },
        ],
      },
    },
  ]);

  assert.deepEqual(shape, {
    kind: "catalogo",
    tool: "listar_areas_tickets",
    rows: [
      { id: 10, name: "Suporte", active: true },
      { id: 7, name: "Redes e Segurança", active: true },
    ],
  });
});

test("detectTabularShape: forma 'catalogo' reconhece todas as 6 chaves (areas/prioridades/canais/status/departamentos/usuarios)", () => {
  const chaves = ["areas", "prioridades", "canais", "status", "departamentos", "usuarios"];

  for (const chave of chaves) {
    const shape = detectTabularShape([
      { tool: `listar_${chave}_tickets`, dados: { quantidade: 1, [chave]: [{ id: 1, name: "X" }] } },
    ]);

    assert.equal(shape?.kind, "catalogo", `chave "${chave}" deveria ser reconhecida como catálogo`);
  }
});

test("detectTabularShape: forma 'lista' também reconhece ticket único (buscar_ticket_por_numero)", () => {
  const shape = detectTabularShape([
    {
      tool: "buscar_ticket_por_numero",
      dados: {
        encontrado: true,
        ticket: {
          number: 1050,
          status: "ENCERRADA",
          priority: "Baixa",
          area: "Suporte",
          operator: "Fabio Gali",
          opening_date: "2026-01-01 10:00:00",
        },
      },
    },
  ]);

  assert.equal(shape.kind, "lista");
  assert.equal(shape.isPartial, false);
  assert.deepEqual(shape.rows, [
    {
      number: 1050,
      status: "ENCERRADA",
      priority: "Baixa",
      area: "Suporte",
      operator: "Fabio Gali",
      opening_date: "2026-01-01 10:00:00",
    },
  ]);
});

test("detectTabularShape: buscar_ticket_por_numero não encontrado (ticket: null) não vira forma nenhuma", () => {
  assert.equal(
    detectTabularShape([{ tool: "buscar_ticket_por_numero", dados: { encontrado: false, ticket: null } }]),
    null,
  );
});

test("detectTabularShape: forma 'individual' (analisar_carga_operador/analisar_atividade_cliente)", () => {
  const porOperador = detectTabularShape([
    {
      tool: "analisar_carga_operador",
      dados: {
        operador: "Fabio Gali",
        total: 10,
        abertos: 4,
        fechados: 6,
        congelados: 1,
        prioridade_alta_ou_urgente: 2,
        mais_antigo_aberto: null,
      },
    },
  ]);

  assert.deepEqual(porOperador, {
    kind: "individual",
    tool: "analisar_carga_operador",
    nome: "Fabio Gali",
    rows: [
      { label: "Total", value: 10 },
      { label: "Abertos", value: 4 },
      { label: "Fechados", value: 6 },
      { label: "Congelados", value: 1 },
      { label: "Prioridade alta ou urgente", value: 2 },
    ],
  });

  const porCliente = detectTabularShape([
    {
      tool: "analisar_atividade_cliente",
      dados: {
        cliente: "Acme",
        total: 3,
        abertos: 1,
        fechados: 2,
        congelados: 0,
        prioridade_alta_ou_urgente: 0,
      },
    },
  ]);

  assert.equal(porCliente.kind, "individual");
  assert.equal(porCliente.nome, "Acme");
});

// "Compare o operador X com o Y" chama analisar_carga_operador 2x — mostrar
// tabela/gráfico só do primeiro lado (descartando o segundo em silêncio)
// seria enganoso, então nenhuma forma é oferecida nesse caso (o texto da
// resposta já compara os dois).
test("detectTabularShape: comparação (2 chamadas da mesma tool individual) não vira forma nenhuma", () => {
  const dadosBase = {
    total: 10,
    abertos: 4,
    fechados: 6,
    congelados: 1,
    prioridade_alta_ou_urgente: 2,
  };

  assert.equal(
    detectTabularShape([
      { tool: "analisar_carga_operador", dados: { ...dadosBase, operador: "Fabio Gali" } },
      { tool: "analisar_carga_operador", dados: { ...dadosBase, operador: "Diego Mota" } },
    ]),
    null,
  );
});

test("detectTabularShape: comparação de 2 tickets (buscar_ticket_por_numero 2x) não vira forma nenhuma", () => {
  assert.equal(
    detectTabularShape([
      { tool: "buscar_ticket_por_numero", dados: { encontrado: true, ticket: { number: 1 } } },
      { tool: "buscar_ticket_por_numero", dados: { encontrado: true, ticket: { number: 2 } } },
    ]),
    null,
  );
});

test("detectTabularShape: resumo_operacional_tickets com todos os contadores zerados ainda é reconhecido", () => {
  const shape = detectTabularShape([
    {
      tool: "resumo_operacional_tickets",
      dados: {
        total: 0,
        abertos: 0,
        fechados: 0,
        sem_operador: 0,
        congelados: 0,
        abertos_com_mais_de_7_dias: 0,
      },
    },
  ]);

  assert.equal(shape.kind, "operacional");
  assert.ok(shape.rows.every((row) => row.value === 0));
});

// Achado ao vivo (ver comentário em web/shapes.js): a 1ª versão desses chips
// usava o mecanismo de continuação, mas "resumo"/"resumo operacional" ainda
// presente na frase anterior sempre vencia no roteador — clicar no chip não
// mudava nada. A versão atual gera uma pergunta nova e autônoma, sem depender
// de continuação.

test("buildRefinementChips: forma 'operacional' oferece chips só para contadores > 0, carregando os filtros já aplicados", () => {
  const chips = buildRefinementChips({
    kind: "operacional",
    filtros: { area: "Suporte" },
    rows: [
      { label: "Abertos", value: 6 },
      { label: "Fechados", value: 0 },
      { label: "Sem operador", value: 2 },
      { label: "Congelados", value: 0 },
      { label: "Abertos +7 dias", value: 1 },
    ],
  });

  assert.deepEqual(chips, [
    { label: "Só os abertos", pergunta: "Liste os tickets abertos na área Suporte" },
  ]);
});

test("buildRefinementChips: forma 'resumo' por prioridade gera uma chip por categoria, com a pergunta já qualificada", () => {
  const chips = buildRefinementChips({
    kind: "resumo",
    tool: "resumo_tickets_por_prioridade",
    filtros: { area: "Suporte" },
    rows: [
      { label: "Urgente", value: 16 },
      { label: "Alta", value: 25 },
      { label: "Media", value: 33 },
      { label: "Baixa", value: 4336 },
    ],
  });

  assert.equal(chips.length, 4);
  assert.deepEqual(chips[0], {
    label: "Só Urgente",
    pergunta: "Liste os tickets com prioridade Urgente na área Suporte",
  });
});

// Achado ao vivo: as chips vinham limitadas a 4 (`.slice(0, 4)`), mesmo
// quando o resumo tinha mais categorias que isso (ex.: 8 áreas no resumo por
// área) — o usuário queria TODAS as combinações possíveis sempre, não só as
// primeiras 4.
test("buildRefinementChips: sem limite de quantidade — uma chip por categoria, mesmo com mais de 4", () => {
  const chips = buildRefinementChips({
    kind: "resumo",
    tool: "resumo_tickets_por_area",
    filtros: {},
    rows: [
      { label: "Suporte", value: 4412 },
      { label: "Redes e Segurança", value: 306 },
      { label: "WEB", value: 182 },
      { label: "nao informada", value: 56 },
      { label: "Infraestrutura Cientifica", value: 44 },
      { label: "Governanca", value: 39 },
      { label: "Gestao", value: 10 },
      { label: "DEFAULT", value: 3 },
    ],
  });

  assert.equal(chips.length, 8);
});

test("buildRefinementChips: forma 'resumo' por status (sem phrase segura) não gera chips", () => {
  assert.deepEqual(
    buildRefinementChips({
      kind: "resumo",
      tool: "resumo_tickets_por_status",
      filtros: {},
      rows: [{ label: "ENCERRADA", value: 9 }],
    }),
    [],
  );
});

test("buildRefinementChips: sem shape ou forma 'lista' não gera chips", () => {
  assert.deepEqual(buildRefinementChips(null), []);
  assert.deepEqual(buildRefinementChips({ kind: "lista", rows: [], isPartial: true }), []);
});

// Teste de integração real: todo chip gerado precisa de fato apontar pra uma
// tool de LISTAGEM filtrada (não voltar pro mesmo tool de resumo) — é
// exatamente a falha encontrada ao vivo que motivou essa reescrita.
test("buildRefinementChips: toda pergunta gerada roteia pra uma tool de listagem com o filtro certo", () => {
  const operacional = buildRefinementChips({
    kind: "operacional",
    filtros: { area: "Suporte" },
    rows: [{ label: "Abertos", value: 6 }, { label: "Fechados", value: 14 }],
  });

  for (const chip of operacional) {
    const route = routeTicketQuestion(chip.pergunta);
    assert.ok(
      route.toolNames[0]?.startsWith("listar_tickets"),
      `chip "${chip.pergunta}" deveria rotear pra uma tool de listagem, roteou pra ${route.toolNames}`,
    );
    assert.equal(route.entities.area, "Suporte");
  }

  const porPrioridade = buildRefinementChips({
    kind: "resumo",
    tool: "resumo_tickets_por_prioridade",
    filtros: { area: "Suporte" },
    rows: [{ label: "Urgente", value: 16 }, { label: "Alta", value: 25 }],
  });

  for (const chip of porPrioridade) {
    const route = routeTicketQuestion(chip.pergunta);
    assert.deepEqual(route.toolNames, ["listar_tickets"]);
    assert.equal(route.entities.area, "Suporte");
    assert.ok(["Urgente", "Alta"].includes(route.entities.prioridade));
  }
});
