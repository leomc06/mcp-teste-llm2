function unwrapList(body, key) {
  if (Array.isArray(body)) {
    return body;
  }

  if (Array.isArray(body?.[key])) {
    return body[key];
  }

  if (Array.isArray(body?.items)) {
    return body.items;
  }

  if (Array.isArray(body?.results)) {
    return body.results;
  }

  // Nenhum dos formatos conhecidos bateu — não é necessariamente uma lista
  // vazia real, pode ser a API tendo mudado de formato. Avisa em vez de
  // devolver [] silenciosamente (uma tool que "some" com um catálogo
  // inteiro sem explicação é pior que um aviso no log).
  console.error(
    `API de tickets: resposta de metadado em formato inesperado (chave "${key}"), tratando como lista vazia.`,
  );

  return [];
}

function compactHeaders(values) {
  const headers = {};

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) {
      headers[key] = String(value);
    }
  }

  return headers;
}

// Erros de rede/timeout e HTTP 429/5xx costumam ser transitórios (blip de
// rede, API momentaneamente sobrecarregada) — vale tentar de novo. 4xx
// (exceto 429) é erro do próprio pedido (parâmetro inválido, não
// encontrado, etc.) e "JSON inválido" é a API respondendo algo que não vai
// mudar numa segunda tentativa — nenhum dos dois é retryable.
function isRetryable(error) {
  if (error?.status === 429) {
    return true;
  }

  if (typeof error?.status === "number") {
    return error.status >= 500;
  }

  // Sem `.status` só acontece nos erros de rede/timeout lançados acima
  // (JSON inválido tem sua própria mensagem, tratada à parte).
  return (
    error?.message === "Timeout ao consultar a API de tickets."
    || error?.message === "Não foi possível conectar à API de tickets."
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Achado P10 da auditoria end-to-end: a parada antecipada de fetchAllTickets
// (ver comentário lá) só é segura enquanto a API devolver os tickets em
// ordem decrescente de abertura, mas isso é uma suposição empírica, não uma
// garantia formal do contrato da API — se ela mudar no futuro, a parada
// antecipada devolveria resultado incompleto marcado como `truncado: false`
// (pior que truncar de verdade, porque parece completo). Esta checagem usa
// só os dados que já foram buscados (sem chamada extra): confirma que cada
// página, e a transição entre páginas, respeitou a ordem esperada.
function paginaRespeitaOrdemDecrescente(pageTickets, aberturaMaximaAnterior) {
  if (
    aberturaMaximaAnterior !== undefined
    && pageTickets.length > 0
    && pageTickets[0].opening_date > aberturaMaximaAnterior
  ) {
    return false;
  }

  for (let i = 1; i < pageTickets.length; i += 1) {
    if (pageTickets[i].opening_date > pageTickets[i - 1].opening_date) {
      return false;
    }
  }

  return true;
}

export function createTicketsApiClient({
  baseUrl,
  token,
  login,
  app,
  timeoutMs,
  maxRetries = 2,
  retryDelayMs = 300,
}) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  async function requestOnce(path, { headers = {}, ...options } = {}) {
    let response;

    try {
      response = await fetch(`${normalizedBaseUrl}${path}`, {
        ...options,
        headers: {
          accept: "application/json",
          token,
          login,
          app,
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (
        error?.name === "TimeoutError"
        || error?.name === "AbortError"
      ) {
        throw new Error("Timeout ao consultar a API de tickets.");
      }

      throw new Error("Não foi possível conectar à API de tickets.");
    }

    let body;
    let parseError;

    try {
      body = await response.json();
    } catch (error) {
      parseError = error;
    }

    // Checa o status ANTES de decidir o que fazer com uma falha de parse —
    // um 5xx com corpo HTML/vazio (comum em proxy/gateway) não pode virar
    // "JSON inválido" genérico, isso mascararia o status HTTP real.
    if (!response.ok) {
      if (parseError) {
        const error = new Error(`API de tickets retornou erro: HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const errors = body?.errors;
      const errorEntry = Array.isArray(errors) ? errors[0] : errors;
      const message = errorEntry?.message ?? `HTTP ${response.status}`;
      const error = new Error(`API de tickets retornou erro: ${message}`);
      error.status = response.status;
      error.type = errorEntry?.type;
      throw error;
    }

    if (parseError) {
      throw new Error("API de tickets retornou JSON inválido.");
    }

    return body;
  }

  // Tenta de novo (com backoff exponencial: retryDelayMs, 2x, 4x, ...) só
  // pra falhas transitórias (ver isRetryable) — até maxRetries tentativas
  // extras (padrão: 1 chamada + 2 retries = até 3 tentativas no total).
  async function request(path, options) {
    let ultimoErro;

    for (let tentativa = 0; tentativa <= maxRetries; tentativa += 1) {
      try {
        return await requestOnce(path, options);
      } catch (error) {
        ultimoErro = error;

        if (tentativa >= maxRetries || !isRetryable(error)) {
          throw error;
        }

        await sleep(retryDelayMs * 2 ** tentativa);
      }
    }

    throw ultimoErro;
  }

  return {
    async listTickets({
      column,
      status,
      area,
      number,
      department,
      operator,
      limit,
      page,
    } = {}) {
      return request("/tickets", {
        headers: compactHeaders({
          column,
          status,
          area,
          number,
          department,
          operator,
          limit,
          page,
        }),
      });
    },

    async fetchAllTickets(filtros = {}, { maxPages, paraQuando } = {}) {
      // O teto de segurança serve só pra não rodar pra sempre se o
      // catálogo crescer muito — não é o tamanho normal de uma busca, já
      // que o loop abaixo sempre para no `pages` real devolvido pela API
      // assim que chega lá (ou antes, via `paraQuando`, quando há
      // data-limite conhecida). Medido ao vivo: 87 páginas (uma área
      // inteira, sem filtro de data) levam ~8s, e o volume atual do
      // catálogo inteiro é só 98 páginas — por isso 400 cabe folgado tanto
      // com quanto sem `paraQuando`, sem truncar buscas legítimas que só
      // não tinham como usar a parada antecipada (ex.: "tickets sem
      // operador" numa área, sem período informado).
      const limitePaginas = maxPages ?? 400;
      const tickets = [];
      let page = 1;
      let truncado = false;
      let paraQuandoConfiavel = true;
      let aberturaMaximaAnterior;

      while (true) {
        const data = await this.listTickets({ ...filtros, page });
        const pageTickets = data.tickets ?? [];

        // Checagem de sanidade (achado P10): se a ordenação assumida pela
        // parada antecipada não bater com os dados reais desta página,
        // desativa a parada antecipada pro resto desta busca — melhor
        // continuar paginando até o teto de segurança normal (marcando
        // `truncado: true` se for o caso) do que devolver um resultado
        // incompleto disfarçado de completo.
        if (paraQuandoConfiavel && !paginaRespeitaOrdemDecrescente(pageTickets, aberturaMaximaAnterior)) {
          paraQuandoConfiavel = false;
          console.error(
            "[tickets-api] fetchAllTickets: a página retornada não está em ordem decrescente de "
              + "abertura como esperado — a parada antecipada foi desativada pro resto desta busca.",
          );
        }

        if (pageTickets.length > 0) {
          aberturaMaximaAnterior = pageTickets[pageTickets.length - 1].opening_date;
        }

        tickets.push(...pageTickets);

        const pages = data.pages ?? 1;

        if (page >= pages || pageTickets.length === 0) {
          break;
        }

        // Parada antecipada e SEGURA (não é "desistência" — `truncado` fica
        // false): a API devolve tickets em ordem estritamente decrescente
        // de data de abertura (confirmado ao vivo, sem exceção, em
        // centenas de tickets/25 páginas seguidas, e agora também
        // verificado a cada chamada, ver paginaRespeitaOrdemDecrescente) —
        // se quem chamou já sabe até onde precisa ir (`paraQuando`), dá pra
        // parar assim que o ticket mais antigo da página atual já ficou
        // pra trás desse limite, sem gastar o teto de segurança (maxPages)
        // numa busca que já tem resposta completa. Só é seguro pra filtro
        // por data de ABERTURA — closure_date não guarda relação nenhuma
        // com essa ordem, então quem filtra por fechamento não deve passar
        // isso.
        if (paraQuandoConfiavel && pageTickets.length > 0 && paraQuando?.(pageTickets[pageTickets.length - 1])) {
          break;
        }

        if (page >= limitePaginas) {
          truncado = true;
          break;
        }

        page += 1;
      }

      return { tickets, truncado };
    },

    async getTicket(number) {
      return request(`/tickets/${number}`);
    },

    async listAreas() {
      return unwrapList(await request("/meta/areas"), "areas");
    },

    async listPriorities() {
      return unwrapList(await request("/meta/priorities"), "priorities");
    },

    async listChannels() {
      return unwrapList(await request("/meta/channels"), "channels");
    },

    async listStatuses() {
      return unwrapList(await request("/meta/statuses"), "statuses");
    },

    async listDepartments() {
      return unwrapList(await request("/meta/departments"), "departments");
    },

    async listUsers() {
      return unwrapList(await request("/meta/users"), "users");
    },
  };
}
