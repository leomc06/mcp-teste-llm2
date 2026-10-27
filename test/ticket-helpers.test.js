import assert from "node:assert/strict";
import test from "node:test";

import {
  success,
  ticketsFailure,
  normalizeForMatch,
  findClosedStatus,
  findCancelledStatus,
  isTicketAberto,
  resolveMetaId,
  resolveOperadorOuDimensaoCatalogo,
  describeNaoEncontrado,
  formatNaoEncontrados,
  filtrarPorPeriodo,
  filtrarPorPeriodoFechamento,
  criarParaQuandoAbertura,
  contarPrioridadeAltaOuUrgente,
  agruparContagemPorNomeNormalizado,
  resolveClienteFiltro,
  rankearResumo,
  diasEmAberto,
  createTicketHelpers,
  mapWithConcurrency,
  createCachedTicketsApi,
} from "../src/ticket-helpers.js";

test("success() serializa os dados como texto MCP", () => {
  const result = success({ total: 3 });
  assert.deepEqual(result, {
    content: [{ type: "text", text: JSON.stringify({ total: 3 }, null, 2) }],
  });
});

test("ticketsFailure() retorna mensagem fixa (categoria genérica) e isError, sem vazar error.message", () => {
  const result = ticketsFailure(new Error("token inválido: abc123"));
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "Não foi possível consultar a API de tickets.");
  assert.ok(!result.content[0].text.includes("abc123"));
});

test("ticketsFailure() diferencia a mensagem por categoria de erro (401/403, 429, 5xx, timeout, rede)", () => {
  const casos = [
    [{ status: 401, message: "unauthorized" }, /falha de autentica[cç][aã]o/i],
    [{ status: 403, message: "forbidden" }, /falha de autentica[cç][aã]o/i],
    [{ status: 429, message: "too many requests" }, /requisi[cç][oõ]es demais/i],
    [{ status: 500, message: "internal error" }, /indispon[ií]vel/i],
    [{ status: 503, message: "unavailable" }, /indispon[ií]vel/i],
    [{ message: "Timeout ao consultar a API de tickets." }, /timeout/i],
    [{ message: "Não foi possível conectar à API de tickets." }, /n[aã]o foi poss[íi]vel conectar/i],
  ];

  for (const [error, esperado] of casos) {
    const result = ticketsFailure(error);
    assert.match(result.content[0].text, esperado, `falhou pra ${JSON.stringify(error)}`);
  }
});

test("ticketsFailure() nunca inclui o error.message bruto na mensagem devolvida, mesmo nas categorias diferenciadas", () => {
  const result = ticketsFailure({ status: 401, message: "Bearer eyJhbGciOi... vazou aqui" });
  assert.ok(!result.content[0].text.includes("eyJhbGciOi"));
});

test("normalizeForMatch remove acento, caixa e espaços nas pontas", () => {
  assert.equal(normalizeForMatch("  Supercomputação  "), "supercomputacao");
  assert.equal(normalizeForMatch("ENCERRADA"), "encerrada");
  assert.equal(normalizeForMatch(undefined), "");
});

// Achado testando o lote de perguntas ao vivo (Complexas 1, pergunta 3):
// contact_name de alguns tickets vem com entidade HTML do cadastro de origem
// ("Jo&atilde;o Pedro Guimar&atilde;es") em vez do texto decodificado — sem
// decodificar antes de comparar, essa pessoa virava uma 2ª "fantasma" em
// todo resumo/filtro por cliente, com a contagem dividida entre as duas.
test("normalizeForMatch decodifica entidade HTML antes de comparar (mesma pessoa com e sem entidade casam)", () => {
  assert.equal(
    normalizeForMatch("Jo&atilde;o Pedro Guimar&atilde;es"),
    normalizeForMatch("João Pedro Guimarães"),
  );
  assert.equal(normalizeForMatch("F&aacute;bio"), normalizeForMatch("Fábio"));
});

// Achado testando o lote de perguntas ao vivo (Lote extra 1, pergunta 13):
// um ticket tinha "Amanda Carolina da Silva Queiroz" e outro "Amanda
// Carolina da Silva Queiroz." (ponto final a mais no cadastro, mesma
// pessoa) — sem remover pontuação final antes de comparar, viravam 2 chaves
// normalizadas diferentes, gerando uma ambiguidade falsa.
test("normalizeForMatch remove pontuação final solta (mesma pessoa com e sem ponto final casam)", () => {
  assert.equal(
    normalizeForMatch("Amanda Carolina da Silva Queiroz"),
    normalizeForMatch("Amanda Carolina da Silva Queiroz."),
  );
  assert.equal(normalizeForMatch("Fabio Gali,"), normalizeForMatch("Fabio Gali"));
});

test("resolveMetaId: sem nome informado, não filtra (id/nomeCanonico undefined, naoEncontrado false)", async () => {
  const result = await resolveMetaId(async () => [{ id: 1, name: "Suporte" }], undefined);
  assert.deepEqual(result, { id: undefined, nomeCanonico: undefined, naoEncontrado: false });
});

test("resolveMetaId: casa por igualdade exata (ignorando acento/caixa)", async () => {
  const listFn = async () => [{ id: 1, name: "Suporte" }, { id: 2, name: "WEB" }];
  const result = await resolveMetaId(listFn, "suporte");
  assert.deepEqual(result, { id: 1, nomeCanonico: "Suporte", naoEncontrado: false });
});

test("resolveMetaId: cai para 'includes' quando não há igualdade exata", async () => {
  const listFn = async () => [{ id: 5, name: "Infraestrutura Científica" }];
  const result = await resolveMetaId(listFn, "infraestrutura");
  assert.equal(result.id, 5);
});

test("resolveMetaId: cai para comparação sem sufixo de gênero (ex.: 'encerrado' casa com 'ENCERRADA')", async () => {
  const listFn = async () => [{ id: 9, name: "ENCERRADA" }];
  const result = await resolveMetaId(listFn, "encerrado");
  assert.equal(result.id, 9);
});

test("resolveMetaId: retorna naoEncontrado true quando nada casa", async () => {
  const listFn = async () => [{ id: 1, name: "Suporte" }];
  const result = await resolveMetaId(listFn, "financeiro");
  assert.deepEqual(result, { id: undefined, nomeCanonico: undefined, naoEncontrado: true });
});

// --- Achado P9 da auditoria end-to-end: quando mais de 1 candidato bate
// por substring/sufixo (busca deliberadamente flexível), o sistema escolhia
// o primeiro do array em silêncio — risco de aplicar o filtro pra
// pessoa/área errada sem avisar (ex.: operador "an" batendo em "Ana",
// "Mariana" e "Anderson" ao mesmo tempo). ---

test("resolveMetaId: mais de 1 candidato por substring é tratado como ambíguo, não resolve pro primeiro em silêncio", async () => {
  const listFn = async () => [
    { id: 1, name: "Ana Paula" },
    { id: 2, name: "Mariana" },
    { id: 3, name: "Anderson" },
  ];
  const result = await resolveMetaId(listFn, "an");

  assert.equal(result.naoEncontrado, true);
  assert.equal(result.id, undefined);
  assert.equal(result.ambiguo, true);
  assert.deepEqual(result.candidatos, ["Ana Paula", "Mariana", "Anderson"]);
});

test("resolveMetaId: mais de 1 candidato só no nível de sufixo de gênero também é tratado como ambíguo", async () => {
  const listFn = async () => [{ id: 1, name: "RESOLVIDO" }, { id: 2, name: "RESOLVIDA" }];
  const result = await resolveMetaId(listFn, "resolvidos");

  assert.equal(result.naoEncontrado, true);
  assert.equal(result.ambiguo, true);
  assert.deepEqual(result.candidatos, ["RESOLVIDO", "RESOLVIDA"]);
});

test("resolveMetaId: igualdade exata continua resolvendo direto, mesmo se outros itens batessem por substring", async () => {
  const listFn = async () => [{ id: 1, name: "Suporte" }, { id: 2, name: "Suporte Técnico" }];
  const result = await resolveMetaId(listFn, "suporte");

  assert.deepEqual(result, { id: 1, nomeCanonico: "Suporte", naoEncontrado: false });
});

// Achado testando o lote de perguntas ao vivo: "Ana" resolvia com confiança
// pro operador "Luana Sabara" (único candidato no catálogo real cujo nome
// contém "ana"), mesmo não existindo nenhuma "Ana" de verdade — porque o
// match caía no MEIO da palavra "Luana", não no início de nenhuma palavra do
// nome. Com 1 candidato só (sem outro concorrente pra acionar a ambiguidade
// do teste acima), isso resolvia silenciosamente pra pessoa errada.
test("resolveMetaId: 1 candidato só por substring, mas o match cai no meio de uma palavra (não no início) — não resolve com confiança", async () => {
  const listFn = async () => [{ id: 1, name: "Luana Sabara" }];
  const result = await resolveMetaId(listFn, "Ana");

  assert.deepEqual(result, { id: undefined, nomeCanonico: undefined, naoEncontrado: true });
});

test("resolveMetaId: 1 candidato por substring ancorado no início de uma palavra (nome, sobrenome ou meio) continua resolvendo normalmente", async () => {
  const listFn = async () => [{ id: 1, name: "Cesar Augusto de Mello" }];

  assert.equal((await resolveMetaId(listFn, "cesar")).id, 1);
  assert.equal((await resolveMetaId(listFn, "augusto")).id, 1);
  assert.equal((await resolveMetaId(listFn, "mello")).id, 1);
});

// --- P9 da auditoria end-to-end (parte 2): a mensagem de erro devolvida pra
// quem pergunta precisa distinguir "não encontrado" (nome não existe) de
// "ambíguo" (nome existe mas bate com vários candidatos ao mesmo tempo),
// em vez da mensagem genérica única que existia antes. ---

test("describeNaoEncontrado: resolvido com sucesso não gera descrição (null)", () => {
  const resolvido = { id: 1, nomeCanonico: "Suporte", naoEncontrado: false };
  assert.equal(describeNaoEncontrado("área", "Suporte", resolvido), null);
});

test("describeNaoEncontrado: sem nome informado (resolvido undefined-like) não gera descrição", () => {
  const resolvido = { id: undefined, nomeCanonico: undefined, naoEncontrado: false };
  assert.equal(describeNaoEncontrado("área", undefined, resolvido), null);
});

test("describeNaoEncontrado: não encontrado (sem candidato nenhum) descreve como 'não encontrado'", () => {
  const resolvido = { id: undefined, nomeCanonico: undefined, naoEncontrado: true };
  assert.equal(describeNaoEncontrado("operador", "Zebedeu", resolvido), 'operador "Zebedeu" não encontrado');
});

test("describeNaoEncontrado: ambíguo descreve como 'é ambíguo' e lista os candidatos", () => {
  const resolvido = {
    id: undefined,
    nomeCanonico: undefined,
    naoEncontrado: true,
    ambiguo: true,
    candidatos: ["Ana Paula", "Mariana", "Anderson"],
  };
  assert.equal(
    describeNaoEncontrado("operador", "an", resolvido),
    'operador "an" é ambíguo (pode ser: Ana Paula, Mariana, Anderson)',
  );
});

test("formatNaoEncontrados: junta descrições mistas (não encontrado + ambíguo) numa única mensagem", () => {
  const mensagem = formatNaoEncontrados([
    'área "Financeiro" não encontrado',
    'operador "an" é ambíguo (pode ser: Ana Paula, Mariana, Anderson)',
  ]);

  assert.equal(
    mensagem,
    'área "Financeiro" não encontrado; operador "an" é ambíguo (pode ser: Ana Paula, Mariana, Anderson).',
  );
});

test("criarParaQuandoAbertura: undefined sem dataInicio (nada pra cortar)", () => {
  assert.equal(criarParaQuandoAbertura(undefined), undefined);
});

test("criarParaQuandoAbertura: retorna true só quando o ticket já ficou antes do dataInicio", () => {
  const paraQuando = criarParaQuandoAbertura("2026-08-01");

  assert.equal(paraQuando({ opening_date: "2026-07-31 23:59:59" }), true);
  assert.equal(paraQuando({ opening_date: "2026-08-01 00:00:00" }), false);
  assert.equal(paraQuando({ opening_date: "2026-09-01 00:00:00" }), false);
});

test("filtrarPorPeriodo: sem datas, retorna a lista intacta", () => {
  const tickets = [{ opening_date: "2026-01-01 10:00:00" }];
  assert.deepEqual(filtrarPorPeriodo(tickets, undefined, undefined), tickets);
});

test("filtrarPorPeriodo: filtra por opening_date dentro do intervalo (dataFim inclui o dia inteiro)", () => {
  const tickets = [
    { number: 1, opening_date: "2026-01-05 08:00:00" },
    { number: 2, opening_date: "2026-01-10 23:59:00" },
    { number: 3, opening_date: "2026-01-15 00:00:00" },
  ];

  const result = filtrarPorPeriodo(tickets, "2026-01-05", "2026-01-10");
  assert.deepEqual(result.map((t) => t.number), [1, 2]);
});

test("filtrarPorPeriodoFechamento: usa closure_date, não opening_date, e trata ticket sem closure_date como fora do período", () => {
  const tickets = [
    { number: 1, opening_date: "2026-01-01 00:00:00", closure_date: "2026-01-05 10:00:00" },
    { number: 2, opening_date: "2026-01-05 00:00:00", closure_date: null },
  ];

  const result = filtrarPorPeriodoFechamento(tickets, "2026-01-01", "2026-01-31");
  assert.deepEqual(result.map((t) => t.number), [1]);
});

test("contarPrioridadeAltaOuUrgente conta só 'Alta' e 'Urgente', ignora as demais", () => {
  const tickets = [
    { priority: "Alta" },
    { priority: "Urgente" },
    { priority: "Baixa" },
    { priority: "Média" },
  ];

  assert.equal(contarPrioridadeAltaOuUrgente(tickets), 2);
});

// Achado ao vivo: resumo_tickets_por_cliente mostrava "fabio gali" e "Fabio
// Gali" como 2 linhas separadas (mesmo cliente, capitalização diferente no
// cadastro) — agruparContagemPorNomeNormalizado funde essas variantes numa
// linha só, usando como rótulo a grafia mais frequente entre elas.
test("agruparContagemPorNomeNormalizado funde variantes de acento/caixa do mesmo nome", () => {
  const tickets = [
    { contact_name: "fabio gali" },
    { contact_name: "Fabio Gali" },
    { contact_name: "Fabio Gali" },
    { contact_name: "Diego Mota" },
  ];

  const result = agruparContagemPorNomeNormalizado(tickets, (t) => t.contact_name);

  assert.deepEqual(
    [...result].sort((a, b) => b.quantidade - a.quantidade),
    [
      { chave: "Fabio Gali", quantidade: 3 },
      { chave: "Diego Mota", quantidade: 1 },
    ],
  );
});

test("agruparContagemPorNomeNormalizado: sem tickets, devolve lista vazia", () => {
  assert.deepEqual(agruparContagemPorNomeNormalizado([], (t) => t.contact_name), []);
});

// Achado testando o lote de perguntas ao vivo (Complexas 1, pergunta 3): a
// mesma fusão acima precisa funcionar também quando a variante vem com
// entidade HTML do cadastro de origem, não só diferença de acento/caixa.
test("agruparContagemPorNomeNormalizado funde variante com entidade HTML do mesmo nome", () => {
  const tickets = [
    { contact_name: "João Pedro Guimarães" },
    { contact_name: "João Pedro Guimarães" },
    { contact_name: "Jo&atilde;o Pedro Guimar&atilde;es" },
  ];

  const result = agruparContagemPorNomeNormalizado(tickets, (t) => t.contact_name);

  assert.deepEqual(result, [{ chave: "João Pedro Guimarães", quantidade: 3 }]);
});

// F6 (auditoria de robustez): cliente não tem catálogo/resolveMetaId
// próprio — resolveClienteFiltro é a mesma rede de segurança de ambiguidade
// que status/área/operador/etc já tinham, aplicada ao texto livre de
// contact_name.
test("resolveClienteFiltro: duas pessoas distintas batendo no mesmo substring é ambíguo", () => {
  const tickets = [
    { contact_name: "Ana Silva" },
    { contact_name: "Ana Paula Reis" },
  ];

  const resultado = resolveClienteFiltro(tickets, "ana");

  assert.equal(resultado.naoEncontrado, true);
  assert.equal(resultado.ambiguo, true);
  assert.deepEqual(resultado.candidatos, ["Ana Silva", "Ana Paula Reis"]);
});

test("resolveClienteFiltro: variante com ponto final a mais no cadastro da MESMA pessoa não é ambígua (Lote extra 1, pergunta 13)", () => {
  const tickets = [
    { contact_name: "Amanda Carolina da Silva Queiroz" },
    { contact_name: "Amanda Carolina da Silva Queiroz." },
  ];

  const resultado = resolveClienteFiltro(tickets, "Amanda Carolina");

  assert.equal(resultado.naoEncontrado, false);
  assert.equal(resultado.ambiguo, undefined);
});

test("resolveClienteFiltro: variante de caixa/acento da MESMA pessoa não é ambígua", () => {
  const tickets = [
    { contact_name: "fabio gali" },
    { contact_name: "Fabio Gali" },
  ];

  const resultado = resolveClienteFiltro(tickets, "fabio");

  assert.equal(resultado.naoEncontrado, false);
  assert.equal(resultado.nomeAlvo, "fabio");
});

test("resolveClienteFiltro: sem nenhum ticket batendo, não encontrado", () => {
  const resultado = resolveClienteFiltro([{ contact_name: "Ana Silva" }], "zebedeu");
  assert.equal(resultado.naoEncontrado, true);
  assert.equal(resultado.ambiguo, undefined);
});

test("resolveClienteFiltro: sem query (cliente não informado), passa direto", () => {
  assert.deepEqual(resolveClienteFiltro([{ contact_name: "Ana Silva" }], undefined), {
    nomeAlvo: undefined,
    naoEncontrado: false,
  });
});

test("rankearResumo ordena decrescente por quantidade e calcula percentual (1 casa decimal)", () => {
  const resumo = [
    { chave: "B", quantidade: 30 },
    { chave: "A", quantidade: 70 },
  ];

  const result = rankearResumo(resumo, 100, undefined);

  assert.deepEqual(result, [
    { chave: "A", quantidade: 70, percentual: 70 },
    { chave: "B", quantidade: 30, percentual: 30 },
  ]);
});

test("rankearResumo com ordem 'asc' ordena crescente (menor primeiro)", () => {
  const resumo = [
    { chave: "B", quantidade: 30 },
    { chave: "A", quantidade: 70 },
  ];

  const result = rankearResumo(resumo, 100, undefined, "asc");

  assert.deepEqual(result.map((item) => item.chave), ["B", "A"]);
});

test("rankearResumo com ordem 'asc' + limite corta os N MENORES, não os N maiores", () => {
  const resumo = [
    { chave: "A", quantidade: 10 },
    { chave: "B", quantidade: 30 },
    { chave: "C", quantidade: 20 },
  ];

  const result = rankearResumo(resumo, 60, 2, "asc");

  assert.deepEqual(result.map((item) => item.chave), ["A", "C"]);
});

test("rankearResumo corta em 'limite' itens depois de ordenar", () => {
  const resumo = [
    { chave: "A", quantidade: 10 },
    { chave: "B", quantidade: 30 },
    { chave: "C", quantidade: 20 },
  ];

  const result = rankearResumo(resumo, 60, 2);

  assert.deepEqual(result.map((item) => item.chave), ["B", "C"]);
});

test("rankearResumo com total 0 não divide por zero (percentual 0)", () => {
  const result = rankearResumo([{ chave: "A", quantidade: 0 }], 0, undefined);
  assert.equal(result[0].percentual, 0);
});

// diasEmAberto interpreta a string "AAAA-MM-DD HH:MM:SS" como horário LOCAL
// (sem "Z"), igual a API faz — formatar com toISOString() (UTC) desalinha o
// teste do fuso local (ex.: America/Sao_Paulo é UTC-3, dá um resultado
// errado por causas do desvio). Formata em horário local pra bater com o
// que a função realmente espera receber.
function formatoNaiveLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

test("diasEmAberto calcula dias corridos desde opening_date até agora", () => {
  // 10 dias + 1h atrás, não exatamente 10 dias, pra não flakar no arredondamento
  // (Math.floor) por causa do tempo entre montar a data e rodar a asserção.
  const dezDiasAtras = new Date(Date.now() - (10 * 86400000 + 3600000));
  assert.equal(diasEmAberto(formatoNaiveLocal(dezDiasAtras)), 10);
});

test("diasEmAberto nunca retorna negativo (data no futuro vira 0)", () => {
  const amanha = new Date(Date.now() + 86400000);
  assert.equal(diasEmAberto(formatoNaiveLocal(amanha)), 0);
});

// --- createTicketHelpers (fetchAllTicketsSafe / listTicketsSafe / contarTicketsExato / contarAbertosFechados) ---

function fakeTicketsApi(overrides = {}) {
  return {
    async fetchAllTickets() {
      throw new Error("não implementado no fake");
    },
    async listTickets() {
      throw new Error("não implementado no fake");
    },
    ...overrides,
  };
}

test("fetchAllTicketsSafe repassa o resultado normal do client", async () => {
  const ticketsApi = fakeTicketsApi({
    async fetchAllTickets() {
      return { tickets: [{ number: 1 }], truncado: false };
    },
  });

  const { fetchAllTicketsSafe } = createTicketHelpers(ticketsApi);
  const result = await fetchAllTicketsSafe({});
  assert.deepEqual(result, { tickets: [{ number: 1 }], truncado: false });
});

test("fetchAllTicketsSafe converte erro 400/not_found em resultado vazio (não propaga a exceção)", async () => {
  const ticketsApi = fakeTicketsApi({
    async fetchAllTickets() {
      const error = new Error("não encontrado");
      error.status = 400;
      error.type = "not_found";
      throw error;
    },
  });

  const { fetchAllTicketsSafe } = createTicketHelpers(ticketsApi);
  const result = await fetchAllTicketsSafe({});
  assert.deepEqual(result, { tickets: [], truncado: false });
});

test("fetchAllTicketsSafe propaga qualquer outro erro (não é 400/not_found)", async () => {
  const ticketsApi = fakeTicketsApi({
    async fetchAllTickets() {
      const error = new Error("indisponível");
      error.status = 500;
      throw error;
    },
  });

  const { fetchAllTicketsSafe } = createTicketHelpers(ticketsApi);
  await assert.rejects(() => fetchAllTicketsSafe({}), /indisponível/);
});

test("listTicketsSafe converte erro 400/not_found em página vazia consistente com o filtro pedido", async () => {
  const ticketsApi = fakeTicketsApi({
    async listTickets() {
      const error = new Error("não encontrado");
      error.status = 400;
      error.type = "not_found";
      throw error;
    },
  });

  const { listTicketsSafe } = createTicketHelpers(ticketsApi);
  const result = await listTicketsSafe({ page: 3 });
  assert.deepEqual(result, { results: 0, page: 3, pages: 1, tickets: [] });
});

test("contarTicketsExato lê 'results' da resposta com limit:1/page:1", async () => {
  let recebido;
  const ticketsApi = fakeTicketsApi({
    async listTickets(filtros) {
      recebido = filtros;
      return { results: 42 };
    },
  });

  const { contarTicketsExato } = createTicketHelpers(ticketsApi);
  const total = await contarTicketsExato({ area: 10 });

  assert.equal(total, 42);
  assert.deepEqual(recebido, { area: 10, limit: 1, page: 1 });
});

test("contarTicketsExato retorna 0 (sem erro) em 400/not_found", async () => {
  const ticketsApi = fakeTicketsApi({
    async listTickets() {
      const error = new Error("não encontrado");
      error.status = 400;
      error.type = "not_found";
      throw error;
    },
  });

  const { contarTicketsExato } = createTicketHelpers(ticketsApi);
  assert.equal(await contarTicketsExato({}), 0);
});

test("contarAbertosFechados: sem status já filtrado, faz 2 chamadas (total geral + contagem de ENCERRADA)", async () => {
  const chamadas = [];
  const ticketsApi = fakeTicketsApi({
    async listTickets(filtros) {
      chamadas.push(filtros);
      return { results: filtros.status === 99 ? 40 : 100 };
    },
  });

  const statuses = [{ id: 99, name: "ENCERRADA" }, { id: 2, name: "EM ATENDIMENTO" }];
  const { contarAbertosFechados } = createTicketHelpers(ticketsApi);

  const result = await contarAbertosFechados({ area: 10 }, statuses, undefined);

  assert.deepEqual(result, { totalGeral: 100, abertos: 60, fechados: 40 });
  assert.equal(chamadas.length, 2);
});

test("contarAbertosFechados: com status já filtrado igual a ENCERRADA, não faz chamada extra (100% fechado)", async () => {
  let chamadas = 0;
  const ticketsApi = fakeTicketsApi({
    async listTickets() {
      chamadas += 1;
      return { results: 15 };
    },
  });

  const statuses = [{ id: 99, name: "ENCERRADA" }];
  const { contarAbertosFechados } = createTicketHelpers(ticketsApi);

  const result = await contarAbertosFechados({ status: 99 }, statuses, 99);

  assert.deepEqual(result, { totalGeral: 15, abertos: 0, fechados: 15 });
  assert.equal(chamadas, 1);
});

test("contarAbertosFechados: com status já filtrado diferente de ENCERRADA, fechados é 0 (100% aberto)", async () => {
  const ticketsApi = fakeTicketsApi({
    async listTickets() {
      return { results: 8 };
    },
  });

  const statuses = [{ id: 99, name: "ENCERRADA" }, { id: 2, name: "EM ATENDIMENTO" }];
  const { contarAbertosFechados } = createTicketHelpers(ticketsApi);

  const result = await contarAbertosFechados({ status: 2 }, statuses, 2);

  assert.deepEqual(result, { totalGeral: 8, abertos: 8, fechados: 0 });
});

test("contarAbertosFechados: se o catálogo de status não tiver ENCERRADA, fechados é sempre 0", async () => {
  const ticketsApi = fakeTicketsApi({
    async listTickets() {
      return { results: 30 };
    },
  });

  const { contarAbertosFechados } = createTicketHelpers(ticketsApi);
  const result = await contarAbertosFechados({}, [{ id: 1, name: "OUTRO" }], undefined);

  assert.deepEqual(result, { totalGeral: 30, abertos: 30, fechados: 0 });
});

// --- Achado P8 da auditoria end-to-end: o nome do status "fechado" era
// reconhecido só pelo literal exato "encerrada" — se o catálogo renomeasse
// esse status, o caminho rápido de contagem reportava "fechados: 0" em
// silêncio, divergindo do resto do sistema (que sempre deriva de
// ticket.closure_date real, nunca do nome do status). ---

test("findClosedStatus reconhece um vocabulário de sinônimos, não só o literal 'encerrada'", () => {
  assert.equal(findClosedStatus([{ id: 1, name: "Finalizada" }])?.id, 1);
  assert.equal(findClosedStatus([{ id: 2, name: "Concluído" }])?.id, 2);
  assert.equal(findClosedStatus([{ id: 3, name: "Resolvida" }])?.id, 3);
  assert.equal(findClosedStatus([{ id: 4, name: "Solucionado" }])?.id, 4);
  assert.equal(findClosedStatus([{ id: 5, name: "Fechado" }])?.id, 5);
  assert.equal(findClosedStatus([{ id: 6, name: "Aguardando atendimento" }]), undefined);
});

test("contarAbertosFechados funciona corretamente mesmo se o status fechado do catálogo tiver outro nome (ex.: 'Finalizada' em vez de 'Encerrada')", async () => {
  const chamadas = [];
  const ticketsApi = fakeTicketsApi({
    async listTickets(filtros) {
      chamadas.push(filtros);
      return { results: filtros.status === 77 ? 25 : 100 };
    },
  });

  const statuses = [{ id: 77, name: "Finalizada" }, { id: 2, name: "EM ATENDIMENTO" }];
  const { contarAbertosFechados } = createTicketHelpers(ticketsApi);

  const result = await contarAbertosFechados({ area: 10 }, statuses, undefined);

  assert.deepEqual(result, { totalGeral: 100, abertos: 75, fechados: 25 });
});

// --- Achado testando o lote de perguntas ao vivo: CANCELADO nunca preenche
// closure_date (igual a qualquer status que não seja ENCERRADA), mas também
// não é "aberto" em nenhum sentido útil — antes "aberto" era só "!closure_date",
// então tickets cancelados eram contados como abertos (ex.: "Liste os
// tickets abertos" trazia status CANCELADO misturado). ---

test("isTicketAberto exclui CANCELADO, mesmo sem closure_date", () => {
  assert.equal(isTicketAberto({ closure_date: null, status: "CANCELADO" }), false);
  assert.equal(isTicketAberto({ closure_date: null, status: "EM ATENDIMENTO" }), true);
  assert.equal(isTicketAberto({ closure_date: "2026-01-01", status: "ENCERRADA" }), false);
  // Variação de caixa/acento, mesmo raciocínio de normalizeForMatch usado em
  // todo o resto do arquivo.
  assert.equal(isTicketAberto({ closure_date: null, status: "Cancelado" }), false);
});

test("findCancelledStatus reconhece 'cancelado' (e a variante feminina), não bate com outros status", () => {
  assert.equal(findCancelledStatus([{ id: 7, name: "CANCELADO" }])?.id, 7);
  assert.equal(findCancelledStatus([{ id: 8, name: "Cancelada" }])?.id, 8);
  assert.equal(findCancelledStatus([{ id: 9, name: "ENCERRADA" }]), undefined);
});

test("contarAbertosFechados: CANCELADO não conta como aberto nem como fechado (sem status já filtrado)", async () => {
  const ticketsApi = fakeTicketsApi({
    async listTickets(filtros) {
      if (filtros.status === 99) return { results: 40 }; // ENCERRADA
      if (filtros.status === 7) return { results: 10 }; // CANCELADO
      return { results: 100 }; // total geral
    },
  });

  const statuses = [
    { id: 99, name: "ENCERRADA" },
    { id: 7, name: "CANCELADO" },
    { id: 2, name: "EM ATENDIMENTO" },
  ];
  const { contarAbertosFechados } = createTicketHelpers(ticketsApi);

  const result = await contarAbertosFechados({ area: 10 }, statuses, undefined);

  // 100 no total, 40 fechados (ENCERRADA), 10 cancelados (nem aberto nem
  // fechado) — abertos é só o resto: 100 - 40 - 10 = 50, não 60.
  assert.deepEqual(result, { totalGeral: 100, abertos: 50, fechados: 40 });
});

test("contarAbertosFechados: com status já filtrado igual a CANCELADO, abertos é 0 (não é 100% aberto como qualquer outro status não-fechado)", async () => {
  const ticketsApi = fakeTicketsApi({
    async listTickets() {
      return { results: 10 };
    },
  });

  const statuses = [{ id: 99, name: "ENCERRADA" }, { id: 7, name: "CANCELADO" }];
  const { contarAbertosFechados } = createTicketHelpers(ticketsApi);

  const result = await contarAbertosFechados({ status: 7 }, statuses, 7);

  assert.deepEqual(result, { totalGeral: 10, abertos: 0, fechados: 0 });
});

// --- mapWithConcurrency ---

test("mapWithConcurrency preserva a ordem dos resultados, mesmo terminando fora de ordem", async () => {
  const items = [30, 10, 20];
  const result = await mapWithConcurrency(items, 3, async (ms) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return ms;
  });

  assert.deepEqual(result, [30, 10, 20]);
});

test("mapWithConcurrency nunca roda mais que 'limit' chamadas ao mesmo tempo", async () => {
  let emAndamento = 0;
  let picoDeConcorrencia = 0;

  await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (item) => {
    emAndamento += 1;
    picoDeConcorrencia = Math.max(picoDeConcorrencia, emAndamento);
    await new Promise((resolve) => setTimeout(resolve, 5));
    emAndamento -= 1;
    return item;
  });

  assert.ok(picoDeConcorrencia <= 3, `pico foi ${picoDeConcorrencia}, esperado <= 3`);
});

test("mapWithConcurrency com limit maior que a lista roda tudo igual (sem quebrar)", async () => {
  const result = await mapWithConcurrency([1, 2], 10, async (item) => item * 2);
  assert.deepEqual(result, [2, 4]);
});

test("mapWithConcurrency com lista vazia retorna lista vazia sem chamar o mapper", async () => {
  let chamadas = 0;
  const result = await mapWithConcurrency([], 5, async () => {
    chamadas += 1;
  });

  assert.deepEqual(result, []);
  assert.equal(chamadas, 0);
});

// --- createCachedTicketsApi ---

function fakeTicketsApiParaCache() {
  const chamadas = { listAreas: 0, listUsers: 0 };

  return {
    chamadas,
    async listAreas() {
      chamadas.listAreas += 1;
      return [{ id: 1, name: "Suporte" }];
    },
    async listUsers() {
      chamadas.listUsers += 1;
      throw new Error("API fora do ar");
    },
    async getTicket() {
      return { number: 1 };
    },
  };
}

test("createCachedTicketsApi serve do cache dentro do TTL (não repete a chamada real)", async () => {
  const fake = fakeTicketsApiParaCache();
  const cached = createCachedTicketsApi(fake, { ttlMs: 60000 });

  await cached.listAreas();
  await cached.listAreas();
  await cached.listAreas();

  assert.equal(fake.chamadas.listAreas, 1);
});

test("createCachedTicketsApi coalesce chamadas concorrentes (mesma promise em andamento)", async () => {
  const fake = fakeTicketsApiParaCache();
  const cached = createCachedTicketsApi(fake, { ttlMs: 60000 });

  const [a, b, c] = await Promise.all([cached.listAreas(), cached.listAreas(), cached.listAreas()]);

  assert.equal(fake.chamadas.listAreas, 1);
  assert.deepEqual(a, [{ id: 1, name: "Suporte" }]);
  assert.deepEqual(b, a);
  assert.deepEqual(c, a);
});

test("createCachedTicketsApi não guarda falha em cache — próxima chamada tenta de novo", async () => {
  const fake = fakeTicketsApiParaCache();
  const cached = createCachedTicketsApi(fake, { ttlMs: 60000 });

  await assert.rejects(() => cached.listUsers());
  await assert.rejects(() => cached.listUsers());

  assert.equal(fake.chamadas.listUsers, 2);
});

test("createCachedTicketsApi repassa métodos não cacheados (ex.: getTicket) sem alterar comportamento", async () => {
  const fake = fakeTicketsApiParaCache();
  const cached = createCachedTicketsApi(fake, { ttlMs: 60000 });

  const ticket = await cached.getTicket(1);
  assert.deepEqual(ticket, { number: 1 });
});

test("createCachedTicketsApi refaz a chamada real depois que o TTL expira", async () => {
  const fake = fakeTicketsApiParaCache();
  const cached = createCachedTicketsApi(fake, { ttlMs: 1 });

  await cached.listAreas();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await cached.listAreas();

  assert.equal(fake.chamadas.listAreas, 2);
});

test("resolveOperadorOuDimensaoCatalogo: 'Governança' (achado testando o Lote 5, com dados reais) resolve pra área quando operador não bate em nenhum catálogo e nenhuma outra dimensão foi informada", async () => {
  const operadorResolvido = { id: undefined, nomeCanonico: undefined, naoEncontrado: true };
  const resultado = await resolveOperadorOuDimensaoCatalogo({
    operador: "Governança",
    operadorResolvido,
    outrasDimensoesDefinidas: false,
    listAreas: async () => [{ id: 15, name: "Governança" }],
    listDepartments: async () => [{ id: 2, name: "SYSADMIN" }],
  });

  assert.equal(resultado.ambiguoEntreDimensoes, false);
  assert.equal(resultado.area, "Governança");
  assert.equal(resultado.areaResolvida.id, 15);
  assert.equal(resultado.operador, undefined);
});

test("resolveOperadorOuDimensaoCatalogo: 'SYSADMIN' resolve pra departamento quando só bate no catálogo de departamentos", async () => {
  const operadorResolvido = { id: undefined, nomeCanonico: undefined, naoEncontrado: true };
  const resultado = await resolveOperadorOuDimensaoCatalogo({
    operador: "SYSADMIN",
    operadorResolvido,
    outrasDimensoesDefinidas: false,
    listAreas: async () => [{ id: 10, name: "Suporte" }],
    listDepartments: async () => [{ id: 2, name: "SYSADMIN" }],
  });

  assert.equal(resultado.ambiguoEntreDimensoes, false);
  assert.equal(resultado.departamento, "SYSADMIN");
  assert.equal(resultado.departamentoResolvido.id, 2);
  assert.equal(resultado.operador, undefined);
});

test("resolveOperadorOuDimensaoCatalogo: 'Governança' existindo com o MESMO nome em área E departamento (achado real) recusa honesto em vez de escolher 1 dos 2 lados", async () => {
  const operadorResolvido = { id: undefined, nomeCanonico: undefined, naoEncontrado: true };
  const resultado = await resolveOperadorOuDimensaoCatalogo({
    operador: "Governança",
    operadorResolvido,
    outrasDimensoesDefinidas: false,
    listAreas: async () => [{ id: 15, name: "Governança" }],
    listDepartments: async () => [{ id: 9, name: "Governança" }],
  });

  assert.equal(resultado.ambiguoEntreDimensoes, true);
});

test("resolveOperadorOuDimensaoCatalogo: não tenta a recuperação quando outra dimensão já foi informada explicitamente", async () => {
  const operadorResolvido = { id: undefined, nomeCanonico: undefined, naoEncontrado: true };
  const resultado = await resolveOperadorOuDimensaoCatalogo({
    operador: "Governança",
    operadorResolvido,
    outrasDimensoesDefinidas: true,
    listAreas: async () => [{ id: 15, name: "Governança" }],
    listDepartments: async () => [{ id: 9, name: "Governança" }],
  });

  assert.equal(resultado.ambiguoEntreDimensoes, false);
  assert.equal(resultado.area, undefined);
  assert.equal(resultado.departamento, undefined);
  assert.equal(resultado.operadorResolvido, operadorResolvido);
});

test("resolveOperadorOuDimensaoCatalogo: operador resolvido com sucesso (nome real) não é alterado, mesmo que também bata em área/departamento", async () => {
  const operadorResolvido = { id: 7, nomeCanonico: "Fabio Gali", naoEncontrado: false };
  const resultado = await resolveOperadorOuDimensaoCatalogo({
    operador: "Fabio Gali",
    operadorResolvido,
    outrasDimensoesDefinidas: false,
    listAreas: async () => [],
    listDepartments: async () => [],
  });

  assert.equal(resultado.operadorResolvido, operadorResolvido);
  assert.equal(resultado.area, undefined);
  assert.equal(resultado.departamento, undefined);
});

test("resolveOperadorOuDimensaoCatalogo: valor que não bate em nenhum catálogo mantém o erro original de operador", async () => {
  const operadorResolvido = { id: undefined, nomeCanonico: undefined, naoEncontrado: true };
  const resultado = await resolveOperadorOuDimensaoCatalogo({
    operador: "Zzzzz",
    operadorResolvido,
    outrasDimensoesDefinidas: false,
    listAreas: async () => [{ id: 10, name: "Suporte" }],
    listDepartments: async () => [{ id: 2, name: "SYSADMIN" }],
  });

  assert.equal(resultado.ambiguoEntreDimensoes, false);
  assert.equal(resultado.operadorResolvido, operadorResolvido);
});
