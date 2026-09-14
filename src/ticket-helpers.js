// Funções puras (e a fábrica dos helpers que dependem do cliente da API de
// tickets) extraídas de src/server.js pra serem testáveis isoladamente —
// src/server.js importa esse tipo de coisa, e ao ser importado ele mesmo já
// conecta um transporte stdio real (`await server.connect(transport)` no
// fim do arquivo) e derruba o processo se as variáveis de ambiente
// obrigatórias não estiverem definidas, então nunca pode ser importado
// diretamente por um teste unitário.

export function success(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// Traduz o erro pra uma mensagem por categoria (autenticação/limite de
// taxa/indisponibilidade/timeout/rede), sem nunca repetir error.message
// bruto (que pode conter detalhe da API de tickets que não deveria
// vazar) — antes tudo virava a mesma frase genérica, o que tornava
// impossível diagnosticar o problema real só pelo texto vindo da tool.
function describeTicketsFailure(error) {
  if (error?.status === 401 || error?.status === 403) {
    return "Não foi possível consultar a API de tickets: falha de autenticação.";
  }

  if (error?.status === 429) {
    return "A API de tickets está recebendo requisições demais no momento. Tente novamente em instantes.";
  }

  if (typeof error?.status === "number" && error.status >= 500) {
    return "A API de tickets está indisponível no momento.";
  }

  if (typeof error?.message === "string" && error.message.startsWith("Timeout ao consultar")) {
    return "A API de tickets demorou demais para responder (timeout).";
  }

  if (typeof error?.message === "string" && error.message.startsWith("Não foi possível conectar")) {
    return "Não foi possível conectar à API de tickets.";
  }

  return "Não foi possível consultar a API de tickets.";
}

export function ticketsFailure(error) {
  console.error(
    `Erro na ferramenta MCP de tickets (status=${error?.status ?? "n/d"}): ${error?.message ?? error}`,
  );

  return {
    content: [
      {
        type: "text",
        text: describeTicketsFailure(error),
      },
    ],
    isError: true,
  };
}

// Casa nomes ignorando maiúscula/minúscula e acentuação (ex.: "supercomputacao"
// == "Supercomputação"), já que quem pergunta raramente digita acentos.
export function normalizeForMatch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Remove uma terminação de gênero/número (o/a/os/as) pra permitir casar
// variações como "encerrado" com "ENCERRADA", sem exigir concordância exata.
function stripGenderSuffix(value) {
  return value.replace(/(os|as|o|a)$/u, "");
}

export async function resolveMetaId(listFn, nome) {
  if (nome === undefined) {
    return { id: undefined, nomeCanonico: undefined, naoEncontrado: false };
  }

  const alvo = normalizeForMatch(nome);
  const itens = await listFn();
  const normalizados = itens.map((candidato) => normalizeForMatch(candidato.name));

  const item =
    itens.find((candidato, i) => normalizados[i] === alvo)
    ?? itens.find((candidato, i) => normalizados[i].includes(alvo))
    ?? itens.find((candidato, i) => stripGenderSuffix(normalizados[i]) === stripGenderSuffix(alvo));

  return item
    ? { id: item.id, nomeCanonico: item.name, naoEncontrado: false }
    : { id: undefined, nomeCanonico: undefined, naoEncontrado: true };
}

// Corte antecipado seguro pra fetchAllTickets (ver comentário lá): só faz
// sentido continuar paginando enquanto a página ainda tiver ticket dentro
// do período pedido — como a API devolve em ordem decrescente de abertura,
// assim que o mais antigo da página já ficar anterior a dataInicio, o
// resto só vai ficar mais velho ainda. undefined quando não há dataInicio
// (não dá pra cortar sem saber até onde ir). Só serve pra filtro de
// ABERTURA — não usar em listar_tickets_fechados (filtra por closure_date,
// sem relação com essa ordem).
export function criarParaQuandoAbertura(dataInicio) {
  if (dataInicio === undefined) {
    return undefined;
  }

  return (ticket) => ticket.opening_date < dataInicio;
}

// A API não filtra tickets por período de abertura, então filtramos
// localmente. opening_date é uma string "AAAA-MM-DD HH:MM:SS", comparável
// lexicograficamente com as datas AAAA-MM-DD informadas.
export function filtrarPorPeriodo(tickets, dataInicio, dataFim) {
  if (dataInicio === undefined && dataFim === undefined) {
    return tickets;
  }

  const limiteFim = dataFim === undefined ? undefined : `${dataFim} 23:59:59`;

  return tickets.filter(
    (ticket) =>
      (dataInicio === undefined || ticket.opening_date >= dataInicio)
      && (limiteFim === undefined || ticket.opening_date <= limiteFim),
  );
}

// Mesma lógica de filtrarPorPeriodo, mas por data de FECHAMENTO — usada só
// em listar_tickets_fechados: "fechados esse mês"/"resolveu essa semana"
// significa filtrar por quando o ticket foi encerrado, não por quando foi
// aberto (que pode ter sido bem antes do período perguntado).
export function filtrarPorPeriodoFechamento(tickets, dataInicio, dataFim) {
  if (dataInicio === undefined && dataFim === undefined) {
    return tickets;
  }

  const limiteFim = dataFim === undefined ? undefined : `${dataFim} 23:59:59`;

  return tickets.filter(
    (ticket) =>
      (dataInicio === undefined || (ticket.closure_date ?? "") >= dataInicio)
      && (limiteFim === undefined || (ticket.closure_date ?? "") <= limiteFim),
  );
}

// Conta tickets de prioridade alta ou urgente entre os tickets abertos.
export function contarPrioridadeAltaOuUrgente(tickets) {
  return tickets.filter((ticket) => ticket.priority === "Alta" || ticket.priority === "Urgente").length;
}

// Ordena um resumo (agrupamento por chave) do maior pro menor (ou do menor
// pro maior, se ordem === "asc" — usado quando a pergunta é sobre "quem tem
// MENOS", pra "top N com menos" cortar os N menores, não os N maiores),
// adiciona o percentual de cada item sobre o total do filtro aplicado, e
// opcionalmente corta em "limite" itens — usado pelas tools
// resumo_tickets_por_* pra responder "quem tem mais/menos" e "top N" sem
// precisar de uma tool à parte de ranking.
export function rankearResumo(resumo, total, limite, ordem) {
  const ordenado = [...resumo]
    .sort((a, b) => (ordem === "asc" ? a.quantidade - b.quantidade : b.quantidade - a.quantidade))
    .map((item) => ({
      ...item,
      percentual: total > 0 ? Math.round((item.quantidade / total) * 1000) / 10 : 0,
    }));

  return limite === undefined ? ordenado : ordenado.slice(0, limite);
}

// Dias corridos desde opening_date ("AAAA-MM-DD HH:MM:SS") até agora.
export function diasEmAberto(openingDate) {
  const abertura = new Date(openingDate.replace(" ", "T"));

  return Math.max(Math.floor((Date.now() - abertura.getTime()) / 86400000), 0);
}

// Roda `mapper` sobre `items` respeitando no máximo `limit` chamadas
// concorrentes por vez, em vez de disparar todas de uma via Promise.all —
// usado nas tools de resumo que fazem 1 chamada barata por item de um
// catálogo (status/área/operador/departamento): sem isso, um catálogo
// grande (ex.: muitos operadores) dispara uma rajada sem teto contra a API
// de tickets. Preserva a ordem dos resultados (mesmo índice de `items`).
export async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}

// Envolve o cliente da API de tickets com cache (TTL) nos 6 catálogos de
// metadado (status/área/prioridade/canal/departamento/operador) — eles
// mudam raramente, mas hoje são refeitos do zero a cada tool call (inclusive
// múltiplas vezes dentro da MESMA chamada, já que resolveMetaId e o fan-out
// das tools de resumo pedem o mesmo catálogo separadamente). Além de servir
// do cache dentro do TTL, coalesce chamadas concorrentes: se duas chamadas
// pedirem o mesmo catálogo antes da primeira resposta chegar, a segunda
// reaproveita a MESMA promise em andamento, em vez de disparar outra
// requisição HTTP. Falha não fica em cache — a próxima chamada tenta de
// novo do zero.
export function createCachedTicketsApi(ticketsApi, { ttlMs = 5 * 60 * 1000 } = {}) {
  function cached(methodName) {
    let entry;

    return function () {
      const now = Date.now();

      if (entry !== undefined && entry.expiresAt > now) {
        return entry.promise;
      }

      const promise = ticketsApi[methodName]();
      entry = { promise, expiresAt: now + ttlMs };

      promise.catch(() => {
        if (entry?.promise === promise) {
          entry = undefined;
        }
      });

      return promise;
    };
  }

  return {
    ...ticketsApi,
    listAreas: cached("listAreas"),
    listPriorities: cached("listPriorities"),
    listChannels: cached("listChannels"),
    listStatuses: cached("listStatuses"),
    listDepartments: cached("listDepartments"),
    listUsers: cached("listUsers"),
  };
}

// Helpers que dependem do cliente da API de tickets — agrupados numa
// fábrica pra permitir injetar um `ticketsApi` falso em teste, sem mudar
// nenhum call site em src/server.js (mesmos nomes, mesma assinatura).
export function createTicketHelpers(ticketsApi) {
  async function fetchAllTicketsSafe(filtros, options) {
    try {
      return await ticketsApi.fetchAllTickets(filtros, options);
    } catch (error) {
      if (error.status === 400 && error.type === "not_found") {
        return { tickets: [], truncado: false };
      }

      throw error;
    }
  }

  async function listTicketsSafe(filtros) {
    try {
      return await ticketsApi.listTickets(filtros);
    } catch (error) {
      if (error.status === 400 && error.type === "not_found") {
        return { results: 0, page: filtros.page ?? 1, pages: 1, tickets: [] };
      }

      throw error;
    }
  }

  // Chamada barata (limit:1) que só lê o total de "results" da resposta, sem
  // baixar o corpo dos tickets — usada pra contar por dimensão (status, área,
  // operador, departamento) sem o limite de truncamento do fetchAllTicketsSafe,
  // já que cada chamada é independente do volume real de tickets.
  async function contarTicketsExato(filtros) {
    try {
      const resultado = await ticketsApi.listTickets({ ...filtros, limit: 1, page: 1 });
      return resultado.results ?? 0;
    } catch (error) {
      if (error.status === 400 && error.type === "not_found") {
        return 0;
      }

      throw error;
    }
  }

  // closure_date só é preenchido quando o status é ENCERRADA (verificado
  // empiricamente contra a API: nenhum outro status, incluindo CANCELADO,
  // fecha o ticket) — dá pra contar abertos/fechados com 1-2 chamadas baratas
  // em vez de baixar o corpo de todos os tickets, sem risco de truncamento
  // mesmo em filtros com milhares de tickets (ex.: área "Suporte").
  async function contarAbertosFechados(filtrosBase, statuses, statusFiltradoId) {
    const statusEncerrado = statuses.find((item) => normalizeForMatch(item.name) === "encerrada");

    if (statusFiltradoId !== undefined) {
      const totalGeral = await contarTicketsExato(filtrosBase);
      const fechados = statusEncerrado && statusFiltradoId === statusEncerrado.id ? totalGeral : 0;

      return { totalGeral, abertos: totalGeral - fechados, fechados };
    }

    const [totalGeral, fechados] = await Promise.all([
      contarTicketsExato(filtrosBase),
      statusEncerrado === undefined
        ? Promise.resolve(0)
        : contarTicketsExato({ ...filtrosBase, status: statusEncerrado.id }),
    ]);

    return { totalGeral, abertos: totalGeral - fechados, fechados };
  }

  return { fetchAllTicketsSafe, listTicketsSafe, contarTicketsExato, contarAbertosFechados };
}
