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

export function createTicketsApiClient({ baseUrl, token, login, app, timeoutMs }) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  async function request(path, { headers = {}, ...options } = {}) {
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

    try {
      body = await response.json();
    } catch {
      throw new Error("API de tickets retornou JSON inválido.");
    }

    if (!response.ok) {
      const errors = body?.errors;
      const errorEntry = Array.isArray(errors) ? errors[0] : errors;
      const message = errorEntry?.message ?? `HTTP ${response.status}`;
      const error = new Error(`API de tickets retornou erro: ${message}`);
      error.status = response.status;
      error.type = errorEntry?.type;
      throw error;
    }

    return body;
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

    async fetchAllTickets(filtros = {}, { maxPages = 20 } = {}) {
      const tickets = [];
      let page = 1;
      let truncado = false;

      while (true) {
        const data = await this.listTickets({ ...filtros, page });
        const pageTickets = data.tickets ?? [];

        tickets.push(...pageTickets);

        const pages = data.pages ?? 1;

        if (page >= pages || pageTickets.length === 0) {
          break;
        }

        if (page >= maxPages) {
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
