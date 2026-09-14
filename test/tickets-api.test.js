import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import { createTicketsApiClient } from "../src/tickets-api.js";

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

// maxRetries: 0 por padrão — a maioria dos testes existentes simula uma
// falha persistente (o mock sempre falha), e testar retry de verdade requer
// controlar quantas vezes o mock falha antes de suceder (feito à parte,
// nos testes dedicados de retry, que passam maxRetries/retryDelayMs
// explicitamente).
function client(overrides = {}) {
  return createTicketsApiClient({
    baseUrl: "https://tickets.exemplo.com/api",
    token: "tok",
    login: "log",
    app: "app",
    timeoutMs: 5000,
    maxRetries: 0,
    ...overrides,
  });
}

afterEach(() => {
  mock.restoreAll();
});

test("listTickets envia headers só com os filtros informados (compactHeaders remove undefined)", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://tickets.exemplo.com/api/tickets");
    assert.deepEqual(options.headers, {
      accept: "application/json",
      token: "tok",
      login: "log",
      app: "app",
      status: "3",
      area: "10",
    });

    return jsonResponse({ tickets: [], pages: 1 });
  });

  await client().listTickets({ status: 3, area: 10, department: undefined });

  assert.equal(fetchMock.mock.callCount(), 1);
});

test("baseUrl com barra final é normalizado (sem barra duplicada)", async () => {
  mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "https://tickets.exemplo.com/api/tickets");
    return jsonResponse({ tickets: [], pages: 1 });
  });

  await client({ baseUrl: "https://tickets.exemplo.com/api///" }).listTickets();
});

test("getTicket monta o path com o número do ticket", async () => {
  mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "https://tickets.exemplo.com/api/tickets/4830");
    return jsonResponse({ number: 4830 });
  });

  const ticket = await client().getTicket(4830);
  assert.equal(ticket.number, 4830);
});

test("timeout (AbortSignal) vira mensagem de timeout, não erro genérico", async () => {
  mock.method(globalThis, "fetch", async () => {
    const error = new Error("aborted");
    error.name = "TimeoutError";
    throw error;
  });

  await assert.rejects(
    () => client().listTickets(),
    /Timeout ao consultar a API de tickets\./,
  );
});

test("erro de rede (não timeout) vira mensagem de conexão", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(
    () => client().listTickets(),
    /Não foi possível conectar à API de tickets\./,
  );
});

test("erro HTTP com corpo não-JSON preserva o status real (não vira 'JSON inválido' genérico)", async () => {
  mock.method(globalThis, "fetch", async () =>
    ({
      ok: false,
      status: 500,
      async json() {
        throw new SyntaxError("Unexpected token <");
      },
    }));

  try {
    await client().listTickets();
    assert.fail("deveria ter lançado erro");
  } catch (error) {
    assert.match(error.message, /API de tickets retornou erro: HTTP 500/);
    assert.equal(error.status, 500);
  }
});

test("resposta OK com JSON inválido no corpo vira mensagem de JSON inválido (esse caso continua sendo isso mesmo)", async () => {
  mock.method(globalThis, "fetch", async () =>
    ({
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError("Unexpected token <");
      },
    }));

  await assert.rejects(
    () => client().listTickets(),
    /API de tickets retornou JSON inválido\./,
  );
});

test("erro HTTP com body.errors (array) usa a mensagem e anexa status/type", async () => {
  mock.method(globalThis, "fetch", async () =>
    jsonResponse(
      { errors: [{ message: "token inválido", type: "unauthorized" }] },
      { ok: false, status: 401 },
    ));

  try {
    await client().listTickets();
    assert.fail("deveria ter lançado erro");
  } catch (error) {
    assert.match(error.message, /API de tickets retornou erro: token inválido/);
    assert.equal(error.status, 401);
    assert.equal(error.type, "unauthorized");
  }
});

test("erro HTTP com body.errors (objeto único, não array) também funciona", async () => {
  mock.method(globalThis, "fetch", async () =>
    jsonResponse(
      { errors: { message: "não encontrado", type: "not_found" } },
      { ok: false, status: 404 },
    ));

  try {
    await client().listTickets();
    assert.fail("deveria ter lançado erro");
  } catch (error) {
    assert.match(error.message, /não encontrado/);
    assert.equal(error.status, 404);
    assert.equal(error.type, "not_found");
  }
});

test("erro HTTP sem body.errors cai no fallback 'HTTP <status>'", async () => {
  mock.method(globalThis, "fetch", async () => jsonResponse({}, { ok: false, status: 500 }));

  await assert.rejects(
    () => client().listTickets(),
    /API de tickets retornou erro: HTTP 500/,
  );
});

test("resposta ok retorna o body normalmente", async () => {
  mock.method(globalThis, "fetch", async () => jsonResponse({ tickets: [{ number: 1 }], pages: 1 }));

  const data = await client().listTickets();
  assert.deepEqual(data.tickets, [{ number: 1 }]);
});

test("fetchAllTickets pagina até 'pages' e para (sem truncar)", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return jsonResponse({ tickets: [{ number: calls }], pages: 3 });
  });

  const { tickets, truncado } = await client().fetchAllTickets();

  assert.equal(calls, 3);
  assert.equal(tickets.length, 3);
  assert.equal(truncado, false);
});

test("fetchAllTickets para cedo se uma página vier vazia", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return jsonResponse({ tickets: calls === 1 ? [{ number: 1 }] : [], pages: 5 });
  });

  const { tickets, truncado } = await client().fetchAllTickets();

  assert.equal(calls, 2);
  assert.equal(tickets.length, 1);
  assert.equal(truncado, false);
});

test("fetchAllTickets trunca ao atingir maxPages, mesmo com mais páginas disponíveis", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return jsonResponse({ tickets: [{ number: calls }], pages: 999 });
  });

  const { tickets, truncado } = await client().fetchAllTickets({}, { maxPages: 3 });

  assert.equal(calls, 3);
  assert.equal(tickets.length, 3);
  assert.equal(truncado, true);
});

test("fetchAllTickets para cedo via 'paraQuando' (sem marcar truncado, é uma parada completa e correta)", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    // Cada página só tem 1 ticket, com data decrescente por página (simula
    // a ordem real confirmada na API: mais novo primeiro).
    const datas = ["2026-09-10", "2026-09-05", "2026-07-20", "2026-01-15"];
    return jsonResponse({ tickets: [{ number: calls, opening_date: `${datas[calls - 1]} 10:00:00` }], pages: 999 });
  });

  const { tickets, truncado } = await client().fetchAllTickets(
    {},
    { paraQuando: (ticket) => ticket.opening_date < "2026-08-01" },
  );

  // Para na 3ª página (a 1ª cujo ticket já ficou antes do limite), não
  // chega a bater no teto de segurança nem a 4ª página.
  assert.equal(calls, 3);
  assert.equal(tickets.length, 3);
  assert.equal(truncado, false);
});

test("fetchAllTickets sem 'paraQuando' continua se comportando exatamente como antes (opcional, não quebra chamadas existentes)", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return jsonResponse({ tickets: [{ number: calls }], pages: 2 });
  });

  const { tickets, truncado } = await client().fetchAllTickets({});

  assert.equal(calls, 2);
  assert.equal(tickets.length, 2);
  assert.equal(truncado, false);
});

test("teto de segurança sem 'paraQuando' continua em 20 páginas (não muda o comportamento pra busca sem data-limite)", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return jsonResponse({ tickets: [{ number: calls }], pages: 999 });
  });

  const { truncado } = await client().fetchAllTickets({});

  assert.equal(calls, 20);
  assert.equal(truncado, true);
});

test("com 'paraQuando' o teto de segurança sobe (400 páginas) — período antigo não trunca só por causa do limite baixo de antes", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    // Nunca satisfaz paraQuando (data sempre recente) — só existe pra
    // provar que o loop vai além de 20 páginas antes de desistir.
    return jsonResponse({ tickets: [{ number: calls, opening_date: "2026-09-01 00:00:00" }], pages: 50 });
  });

  const { tickets, truncado } = await client().fetchAllTickets(
    {},
    { paraQuando: (ticket) => ticket.opening_date < "2000-01-01" },
  );

  // Esgota as 50 páginas disponíveis (bem além do antigo teto fixo de 20)
  // sem nunca satisfazer paraQuando — para porque acabaram as páginas, não
  // porque bateu num teto baixo demais.
  assert.equal(calls, 50);
  assert.equal(tickets.length, 50);
  assert.equal(truncado, false);
});

test("'maxPages' explícito continua tendo prioridade sobre o default automático (com ou sem 'paraQuando')", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return jsonResponse({ tickets: [{ number: calls, opening_date: "2026-09-01 00:00:00" }], pages: 999 });
  });

  const { truncado } = await client().fetchAllTickets(
    {},
    { maxPages: 5, paraQuando: (ticket) => ticket.opening_date < "2000-01-01" },
  );

  assert.equal(calls, 5);
  assert.equal(truncado, true);
});

test("unwrapList aceita array puro, body[key], body.items e body.results", async () => {
  const casos = [
    { body: [{ id: 1 }], esperado: [{ id: 1 }] },
    { body: { areas: [{ id: 2 }] }, esperado: [{ id: 2 }] },
    { body: { items: [{ id: 3 }] }, esperado: [{ id: 3 }] },
    { body: { results: [{ id: 4 }] }, esperado: [{ id: 4 }] },
  ];

  for (const { body, esperado } of casos) {
    mock.restoreAll();
    mock.method(globalThis, "fetch", async () => jsonResponse(body));

    const areas = await client().listAreas();
    assert.deepEqual(areas, esperado);
  }
});

test("unwrapList retorna lista vazia quando o formato não bate com nenhum esperado, mas avisa no log (não falha silenciosamente)", async () => {
  mock.method(globalThis, "fetch", async () => jsonResponse({ formato: "inesperado" }));
  const errorMock = mock.method(console, "error", () => {});

  const areas = await client().listAreas();

  assert.deepEqual(areas, []);
  assert.equal(errorMock.mock.callCount(), 1);
  assert.match(errorMock.mock.calls[0].arguments[0], /formato inesperado/);
});

// --- retry/backoff em falha transitória ---

test("tenta de novo em erro 5xx e usa o resultado da tentativa seguinte se ela funcionar", async () => {
  let chamadas = 0;
  mock.method(globalThis, "fetch", async () => {
    chamadas += 1;
    if (chamadas === 1) {
      return jsonResponse({}, { ok: false, status: 503 });
    }
    return jsonResponse({ tickets: [], pages: 1 });
  });

  const data = await client({ maxRetries: 2, retryDelayMs: 1 }).listTickets();

  assert.equal(chamadas, 2);
  assert.deepEqual(data, { tickets: [], pages: 1 });
});

test("tenta de novo em erro 429 (rate limit)", async () => {
  let chamadas = 0;
  mock.method(globalThis, "fetch", async () => {
    chamadas += 1;
    if (chamadas === 1) {
      return jsonResponse({}, { ok: false, status: 429 });
    }
    return jsonResponse({ tickets: [], pages: 1 });
  });

  await client({ maxRetries: 2, retryDelayMs: 1 }).listTickets();
  assert.equal(chamadas, 2);
});

test("tenta de novo em falha de rede/timeout", async () => {
  let chamadas = 0;
  mock.method(globalThis, "fetch", async () => {
    chamadas += 1;
    if (chamadas === 1) {
      throw new TypeError("fetch failed");
    }
    return jsonResponse({ tickets: [], pages: 1 });
  });

  await client({ maxRetries: 2, retryDelayMs: 1 }).listTickets();
  assert.equal(chamadas, 2);
});

test("desiste depois de maxRetries tentativas e propaga o último erro", async () => {
  let chamadas = 0;
  mock.method(globalThis, "fetch", async () => {
    chamadas += 1;
    return jsonResponse({}, { ok: false, status: 500 });
  });

  await assert.rejects(() => client({ maxRetries: 2, retryDelayMs: 1 }).listTickets());
  assert.equal(chamadas, 3); // 1 tentativa + 2 retries
});

test("NÃO tenta de novo em erro 4xx que não seja 429 (não encontrado, inválido, etc. não mudam numa 2ª tentativa)", async () => {
  let chamadas = 0;
  mock.method(globalThis, "fetch", async () => {
    chamadas += 1;
    return jsonResponse({ errors: { message: "não encontrado" } }, { ok: false, status: 404 });
  });

  await assert.rejects(() => client({ maxRetries: 2, retryDelayMs: 1 }).listTickets());
  assert.equal(chamadas, 1);
});

test("NÃO tenta de novo quando o corpo vem com JSON inválido (não é falha transitória)", async () => {
  let chamadas = 0;
  mock.method(globalThis, "fetch", async () => {
    chamadas += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError("bad json");
      },
    };
  });

  await assert.rejects(() => client({ maxRetries: 2, retryDelayMs: 1 }).listTickets());
  assert.equal(chamadas, 1);
});

test("maxRetries: 0 (padrão nos outros testes) nunca tenta de novo", async () => {
  let chamadas = 0;
  mock.method(globalThis, "fetch", async () => {
    chamadas += 1;
    return jsonResponse({}, { ok: false, status: 500 });
  });

  await assert.rejects(() => client().listTickets());
  assert.equal(chamadas, 1);
});
