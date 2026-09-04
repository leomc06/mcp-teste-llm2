function formatDate(value) {
  if (!value) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function formatDateTime(value) {
  if (!value) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const hora = date.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${formatDate(value)} ${hora}`;
}

function formatNaiveDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(
    String(value ?? ""),
  );

  if (!match) {
    return formatDateTime(value);
  }

  const [, ano, mes, dia, hora, minuto] = match;

  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

const SLA_RESULT_LABELS = {
  1: "não definido",
  2: "dentro do SLA",
  3: "dentro da tolerância",
  4: "excedeu o SLA",
};

function formatSlaResult(value) {
  return SLA_RESULT_LABELS[value] ?? "não informado";
}

const HTML_ENTITIES = {
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ",
  acirc: "â", ecirc: "ê", ocirc: "ô", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô",
  agrave: "à", Agrave: "À", egrave: "è", Egrave: "È",
  ccedil: "ç", Ccedil: "Ç", ntilde: "ñ", Ntilde: "Ñ",
  uuml: "ü", Uuml: "Ü",
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
};

function decodeHtmlEntities(value) {
  if (typeof value !== "string" || !value.includes("&")) {
    return value;
  }

  let text = value;

  for (let pass = 0; pass < 3 && text.includes("&"); pass += 1) {
    const decoded = text
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&([a-zA-Z]+);/g, (match, name) => HTML_ENTITIES[name] ?? match);

    if (decoded === text) {
      break;
    }

    text = decoded;
  }

  return text;
}

function firstNonEmpty(values, fallback) {
  const found = values.find((value) => typeof value === "string" && value.trim().length > 0);
  return found === undefined ? fallback : decodeHtmlEntities(found);
}

function formatTicket(ticket) {
  const parts = [
    `Ticket ${ticket.number}: ${firstNonEmpty([ticket.issue, ticket.description], "sem título")}`,
    `status: ${ticket.status}`,
    `prioridade: ${ticket.priority}`,
    `área: ${ticket.area}`,
    `cliente: ${firstNonEmpty([ticket.client, ticket.contact_name], "não informado")}`,
    `operador: ${decodeHtmlEntities(ticket.operator) ?? "não atribuído"}`,
    `aberto em: ${formatNaiveDateTime(ticket.opening_date)}`,
  ];

  if (ticket.is_frozen) {
    parts.push("SLA congelado: sim");
  }

  return parts.join("; ");
}

function formatTicketList(data) {
  if (data.encontrado === false) {
    return data.motivo ?? "Não foi possível aplicar os filtros informados.";
  }

  const tickets = data.tickets ?? [];

  if (tickets.length === 0) {
    return "Nenhum ticket foi encontrado para os filtros informados.";
  }

  const total = data.total ?? tickets.length;

  const paginacao =
    data.paginas !== undefined
      ? ` (página ${data.pagina} de ${data.paginas})`
      : "";

  const truncadoAviso = data.truncado
    ? " (resultado parcial: consulta truncada por volume de tickets)"
    : "";

  const cabecalho =
    tickets.length < total
      ? `Exibindo ${tickets.length} de ${total} ticket(s) encontrado(s)${paginacao}${truncadoAviso}:`
      : `${total} ticket(s) encontrado(s)${paginacao}${truncadoAviso}:`;

  return [
    cabecalho,
    ...tickets.map((ticket) => `- ${formatTicket(ticket)}`),
  ].join("\n");
}

function formatTicketDetail(data) {
  if (!data.encontrado || !data.ticket) {
    return "O ticket informado não foi encontrado.";
  }

  const ticket = data.ticket;
  const details = [
    `Ticket ${ticket.number}: ${firstNonEmpty([ticket.issue, ticket.description], "sem título")}`,
    `status: ${ticket.status}`,
    `prioridade: ${ticket.priority}`,
    `área: ${ticket.area}`,
    `cliente: ${firstNonEmpty([ticket.client, ticket.contact_name], "não informado")}`,
    `operador: ${decodeHtmlEntities(ticket.operator) ?? "não atribuído"}`,
    `canal: ${ticket.channel || "não informado"}`,
    `departamento: ${ticket.department || "não informado"}`,
    `aberto em: ${formatNaiveDateTime(ticket.opening_date)}`,
  ];

  if (ticket.description) {
    details.push(`Descrição: ${decodeHtmlEntities(ticket.description)}`);
  }

  if (ticket.treatment_date) {
    details.push(`Início do tratamento: ${formatNaiveDateTime(ticket.treatment_date)}`);
  }

  if (ticket.closure_date) {
    details.push(`Fechamento: ${formatNaiveDateTime(ticket.closure_date)}`);
  }

  if (ticket.is_frozen) {
    details.push("SLA congelado: sim");
  }

  if (ticket.lifetime) {
    details.push(
      `SLA de resposta: ${formatSlaResult(ticket.lifetime.result_sla_response)}; SLA de solução: ${formatSlaResult(ticket.lifetime.result_sla_solution)}`,
    );
  }

  const entries = ticket.entries ?? [];

  if (entries.length > 0) {
    details.push(`Comentários (${entries.length}):`);

    for (const entrada of entries) {
      const quando = formatNaiveDateTime(entrada.date);
      const autor = decodeHtmlEntities(entrada.author) ?? "desconhecido";
      const texto = decodeHtmlEntities(entrada.entry) ?? "";
      details.push(`  - [${quando}] ${autor}: ${texto}`);
    }
  } else {
    details.push("Comentários: nenhum");
  }

  const files = ticket.files ?? [];

  if (files.length > 0) {
    details.push(`Anexos: ${files.length}`);
  }

  return details.join("\n");
}

function formatAreasList(data) {
  const areas = data.areas ?? [];

  if (areas.length === 0) {
    return "Nenhuma área de ticket foi encontrada.";
  }

  return [
    `${data.quantidade ?? areas.length} área(s) de ticket encontrada(s):`,
    ...areas.map((area) => `- ${area.name}${area.active === false ? " (inativa)" : ""}`),
  ].join("\n");
}

function formatPrioritiesList(data) {
  const prioridades = data.prioridades ?? [];

  if (prioridades.length === 0) {
    return "Nenhuma prioridade de ticket foi encontrada.";
  }

  return [
    `${data.quantidade ?? prioridades.length} prioridade(s) de ticket encontrada(s):`,
    ...prioridades.map((prioridade) => `- ${prioridade.name} (nível ${prioridade.level})`),
  ].join("\n");
}

function formatChannelsList(data) {
  const canais = data.canais ?? [];

  if (canais.length === 0) {
    return "Nenhum canal de ticket foi encontrado.";
  }

  return [
    `${data.quantidade ?? canais.length} canal(is) de ticket encontrado(s):`,
    ...canais.map((canal) => `- ${canal.name}`),
  ].join("\n");
}

function formatTicketStatusesList(data) {
  const status = data.status ?? [];

  if (status.length === 0) {
    return "Nenhum status de ticket foi encontrado.";
  }

  return [
    `${data.quantidade ?? status.length} status de ticket encontrado(s):`,
    ...status.map((item) => `- ${item.name}${item.is_freeze ? " (congela SLA)" : ""}`),
  ].join("\n");
}

function formatDepartmentsList(data) {
  const departamentos = data.departamentos ?? [];

  if (departamentos.length === 0) {
    return "Nenhum departamento de ticket foi encontrado.";
  }

  return [
    `${data.quantidade ?? departamentos.length} departamento(s) de ticket encontrado(s):`,
    ...departamentos.map((departamento) => `- ${departamento.name}`),
  ].join("\n");
}

function formatUsersList(data) {
  const usuarios = data.usuarios ?? [];

  if (usuarios.length === 0) {
    return "Nenhum usuário de ticket foi encontrado.";
  }

  return [
    `${data.quantidade ?? usuarios.length} usuário(s) de ticket encontrado(s):`,
    ...usuarios.map((usuario) => `- ${usuario.name} (login: ${usuario.login})`),
  ].join("\n");
}

function formatTicketSummary(data, dimensaoLabel) {
  if (data.encontrado === false) {
    return data.motivo ?? "Não foi possível aplicar os filtros informados.";
  }

  const resumo = data.resumo ?? [];

  if (resumo.length === 0) {
    return `Nenhum ticket foi encontrado para calcular o resumo por ${dimensaoLabel}.`;
  }

  const truncadoAviso = data.truncado
    ? " (resultado parcial: consulta truncada por volume de tickets)"
    : "";

  const linhas = [
    `Resumo de ${data.total_tickets ?? 0} ticket(s) por ${dimensaoLabel}${truncadoAviso}:`,
    ...resumo.map((row) =>
      row.percentual !== undefined
        ? `- ${decodeHtmlEntities(row.chave)}: ${row.quantidade} (${row.percentual}%)`
        : `- ${decodeHtmlEntities(row.chave)}: ${row.quantidade}`,
    ),
  ];

  if (data.abertos !== undefined && data.fechados !== undefined) {
    linhas.push(`Total abertos: ${data.abertos}; total fechados: ${data.fechados}`);
  }

  return linhas.join("\n");
}

function formatFrozenTickets(data) {
  if (data.encontrado === false) {
    return data.motivo ?? "Não foi possível aplicar os filtros informados.";
  }

  const tickets = data.tickets ?? [];

  if (tickets.length === 0) {
    return "Nenhum ticket com SLA congelado foi encontrado.";
  }

  const quantidade = data.quantidade ?? tickets.length;

  const truncadoAviso = data.truncado
    ? " (resultado parcial: consulta truncada por volume de tickets)"
    : "";

  const paginacao =
    data.paginas !== undefined && data.paginas > 1
      ? ` (página ${data.pagina} de ${data.paginas})`
      : "";

  const cabecalho =
    tickets.length < quantidade
      ? `Exibindo ${tickets.length} de ${quantidade} ticket(s) com SLA congelado${paginacao}${truncadoAviso}:`
      : `${quantidade} ticket(s) com SLA congelado${paginacao}${truncadoAviso}:`;

  return [
    cabecalho,
    ...tickets.map((ticket) => `- ${formatTicket(ticket)}`),
  ].join("\n");
}

function formatTicketsBySituacao(data, situacaoLabel) {
  if (data.encontrado === false) {
    return data.motivo ?? "Não foi possível aplicar os filtros informados.";
  }

  const tickets = data.tickets ?? [];

  if (tickets.length === 0) {
    return `Nenhum ticket ${situacaoLabel} foi encontrado.`;
  }

  const quantidade = data.quantidade ?? tickets.length;

  const truncadoAviso = data.truncado
    ? " (resultado parcial: consulta truncada por volume de tickets)"
    : "";

  const paginacao =
    data.paginas !== undefined && data.paginas > 1
      ? ` (página ${data.pagina} de ${data.paginas})`
      : "";

  const cabecalho =
    tickets.length < quantidade
      ? `Exibindo ${tickets.length} de ${quantidade} ticket(s) ${situacaoLabel}${paginacao}${truncadoAviso}:`
      : `${quantidade} ticket(s) ${situacaoLabel}${paginacao}${truncadoAviso}:`;

  return [
    cabecalho,
    ...tickets.map((ticket) => `- ${formatTicket(ticket)}`),
  ].join("\n");
}

function formatOldestOpenTickets(data) {
  if (data.encontrado === false) {
    return data.motivo ?? "Não foi possível aplicar os filtros informados.";
  }

  const tickets = data.tickets ?? [];

  if (tickets.length === 0) {
    return "Nenhum ticket aberto foi encontrado.";
  }

  const truncadoAviso = data.truncado
    ? " (resultado parcial: consulta truncada por volume de tickets)"
    : "";

  const paginacao =
    data.paginas !== undefined && data.paginas > 1
      ? ` (página ${data.pagina} de ${data.paginas})`
      : "";

  return [
    `${tickets.length} ticket(s) aberto(s) mais antigo(s) de ${data.quantidade_total_abertos ?? tickets.length} no total${paginacao}${truncadoAviso}:`,
    ...tickets.map((ticket) => `- ${formatTicket(ticket)}`),
  ].join("\n");
}

function formatMostRecentTickets(data) {
  if (data.encontrado === false) {
    return data.motivo ?? "Não foi possível aplicar os filtros informados.";
  }

  const tickets = data.tickets ?? [];

  if (tickets.length === 0) {
    return "Nenhum ticket foi encontrado para os filtros informados.";
  }

  const truncadoAviso = data.truncado
    ? " (resultado parcial: consulta truncada por volume de tickets)"
    : "";

  const paginacao =
    data.paginas !== undefined && data.paginas > 1
      ? ` (página ${data.pagina} de ${data.paginas})`
      : "";

  return [
    `${tickets.length} ticket(s) mais recente(s) de ${data.quantidade_total ?? tickets.length} no total${paginacao}${truncadoAviso}:`,
    ...tickets.map((ticket) => `- ${formatTicket(ticket)}`),
  ].join("\n");
}

function formatOperationalSummary(data) {
  if (data.encontrado === false) {
    return data.motivo ?? "Não foi possível aplicar os filtros informados.";
  }

  const truncadoAviso = data.truncado
    ? " (resultado parcial: consulta truncada por volume de tickets)"
    : "";

  const linhas = [
    `Visão geral de ${data.total} ticket(s)${truncadoAviso}:`,
    `- Abertos: ${data.abertos}; fechados: ${data.fechados}`,
    `- Sem operador atribuído: ${data.sem_operador}`,
    `- Com SLA congelado: ${data.congelados}`,
    `- Abertos há mais de 7 dias: ${data.abertos_com_mais_de_7_dias}`,
  ];

  if (data.por_prioridade?.length > 0) {
    linhas.push(
      "Por prioridade:",
      ...data.por_prioridade.map((row) => `- ${decodeHtmlEntities(row.chave)}: ${row.quantidade}`),
    );
  }

  return linhas.join("\n");
}

function formatOperatorWorkload(data) {
  if (data.encontrado === false) {
    return data.motivo ?? "Não foi possível aplicar os filtros informados.";
  }

  const linhas = [
    `Carga de trabalho de ${decodeHtmlEntities(data.operador)}: ${data.total} ticket(s) no total ` +
      `(${data.abertos} aberto(s), ${data.fechados} fechado(s)).`,
    `- Com SLA congelado: ${data.congelados}`,
    `- Prioridade alta ou urgente (entre os abertos): ${data.prioridade_alta_ou_urgente}`,
  ];

  linhas.push(
    data.mais_antigo_aberto
      ? `- Ticket aberto mais antigo: #${data.mais_antigo_aberto.numero}, há ${data.mais_antigo_aberto.dias_em_aberto} dia(s) `
        + `(desde ${formatDate(data.mais_antigo_aberto.opening_date)})`
      : "- Nenhum ticket em aberto no momento.",
  );

  return linhas.join("\n");
}

function formatOne(toolResult) {
  const { tool, dados } = toolResult;

  switch (tool) {
    case "listar_areas_tickets":
      return formatAreasList(dados);

    case "listar_prioridades_tickets":
      return formatPrioritiesList(dados);

    case "listar_canais_tickets":
      return formatChannelsList(dados);

    case "listar_status_tickets":
      return formatTicketStatusesList(dados);

    case "listar_departamentos_tickets":
      return formatDepartmentsList(dados);

    case "listar_usuarios_tickets":
    case "buscar_usuarios_por_nome":
      return formatUsersList(dados);

    case "buscar_ticket_por_numero":
      return formatTicketDetail(dados);

    case "listar_tickets":
      return formatTicketList(dados);

    case "resumo_tickets_por_status":
      return formatTicketSummary(dados, "status");

    case "resumo_tickets_por_prioridade":
      return formatTicketSummary(dados, "prioridade");

    case "resumo_tickets_por_area":
      return formatTicketSummary(dados, "área");

    case "resumo_tickets_por_operador":
      return formatTicketSummary(dados, "operador");

    case "resumo_tickets_por_departamento":
      return formatTicketSummary(dados, "departamento");

    case "resumo_tickets_por_cliente":
      return formatTicketSummary(dados, "cliente");

    case "buscar_tickets_por_texto":
      return formatTicketsBySituacao(dados, "encontrado(s) para o texto pesquisado");

    case "listar_tickets_congelados":
      return formatFrozenTickets(dados);

    case "listar_tickets_abertos":
      return formatTicketsBySituacao(dados, "aberto(s)");

    case "listar_tickets_fechados":
      return formatTicketsBySituacao(dados, "fechado(s)");

    case "listar_tickets_sem_operador":
      return formatTicketsBySituacao(dados, "sem operador atribuído");

    case "listar_tickets_abertos_mais_antigos":
      return formatOldestOpenTickets(dados);

    case "listar_tickets_mais_recentes":
      return formatMostRecentTickets(dados);

    case "resumo_operacional_tickets":
      return formatOperationalSummary(dados);

    case "analisar_carga_operador":
      return formatOperatorWorkload(dados);

    default:
      throw new Error(
        "Resultado de tool não suportado pelo formatador.",
      );
  }
}

export function formatToolResults(toolResults) {
  if (!Array.isArray(toolResults) || toolResults.length === 0) {
    throw new Error(
      "Nenhum resultado de tool foi informado ao formatador.",
    );
  }

  return toolResults.map(formatOne).join("\n\n");
}
