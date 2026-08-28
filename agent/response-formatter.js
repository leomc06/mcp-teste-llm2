function label(value) {
  return String(value).replaceAll("_", " ");
}

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

function formatMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? ""));

  if (!match) {
    return value;
  }

  const [, ano, mes] = match;

  return `${mes}/${ano}`;
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

function formatOrder(ordem) {
  const parts = [
    `OS ${ordem.numero}: ${ordem.titulo}`,
    `status: ${label(ordem.status)}`,
    `prioridade: ${label(ordem.prioridade)}`,
    `responsável: ${ordem.responsavel ?? "não atribuído"}`,
  ];

  if (typeof ordem.atrasada === "boolean") {
    parts.push(`atrasada: ${ordem.atrasada ? "sim" : "não"}`);
  }

  if (Number.isInteger(ordem.horas_atraso)) {
    parts.push(`horas de atraso: ${ordem.horas_atraso}`);
  }

  return parts.join("; ");
}

function formatOrderList(data) {
  const ordens = data.ordens_servico ?? [];

  if (ordens.length === 0) {
    return "Nenhuma ordem de serviço foi encontrada para os filtros informados.";
  }

  return [
    `${data.quantidade ?? ordens.length} ordem(ns) de serviço encontrada(s):`,
    ...ordens.map((ordem) => `- ${formatOrder(ordem)}`),
  ].join("\n");
}

function formatOrderByNumber(data) {
  if (!data.encontrado || !data.ordem_servico) {
    return "A ordem de serviço informada não foi encontrada.";
  }

  const ordem = data.ordem_servico;
  const details = [formatOrder(ordem)];

  if (ordem.descricao) {
    details.push(`Descrição: ${ordem.descricao}`);
  }

  if (ordem.prazo) {
    details.push(`Prazo: ${formatDateTime(ordem.prazo)}`);
  }

  if (ordem.concluida_em) {
    details.push(`Conclusão: ${formatDateTime(ordem.concluida_em)}`);
  }

  return details.join("\n");
}

function formatHistory(data) {
  if (!data.encontrado || !data.ordem_servico) {
    return "A ordem de serviço informada não foi encontrada.";
  }

  const eventos = data.historico ?? [];

  const header = [
    `Histórico da OS ${data.ordem_servico.numero}: ${data.ordem_servico.titulo}`,
    `Status atual: ${label(data.ordem_servico.status)}`,
  ];

  if (eventos.length === 0) {
    return [
      ...header,
      "Nenhum evento foi encontrado no período consultado.",
    ].join("\n");
  }

  return [
    ...header,
    ...eventos.map(
      (evento) =>
        `- ${formatDateTime(evento.registrado_em)}: ${label(evento.status)}; ${evento.descricao}; autor: ${evento.autor}`,
    ),
  ].join("\n");
}

function formatHistoryList(data) {
  const eventos = data.eventos ?? [];

  if (eventos.length === 0) {
    return "Nenhum evento de histórico foi encontrado no período consultado.";
  }

  return [
    `${data.quantidade ?? eventos.length} evento(s) de histórico no período de ${data.periodo_dias} dias:`,
    ...eventos.map(
      (evento) =>
        `- ${formatDateTime(evento.registrado_em)}: OS ${evento.os_numero} (${evento.os_titulo}); ${label(evento.status)}; ${evento.descricao}; autor: ${evento.autor}`,
    ),
  ].join("\n");
}

function formatFilterSuffix(data) {
  const parts = [];

  if (data.responsavel) {
    parts.push(`responsável: ${data.responsavel}`);
  }

  if (data.solicitante) {
    parts.push(`solicitante: ${data.solicitante}`);
  }

  return parts.length === 0 ? "" : ` (${parts.join("; ")})`;
}

function formatStatusSummary(data) {
  const rows = data.resumo ?? [];

  return [
    `Resumo de ${data.total ?? 0} OS por status no período de ${data.periodo_dias} dias${formatFilterSuffix(data)}:`,
    ...rows.map(
      (row) =>
        `- ${label(row.status)}: ${row.quantidade}; atrasadas: ${row.atrasadas}`,
    ),
  ].join("\n");
}

function formatPrioritySummary(data) {
  const rows = data.resumo ?? [];

  return [
    `Resumo de ${data.total ?? 0} OS por prioridade no período de ${data.periodo_dias} dias${formatFilterSuffix(data)}:`,
    ...rows.map(
      (row) =>
        `- ${label(row.prioridade)}: total ${row.total}; pendentes ${row.pendentes}; atrasadas ${row.atrasadas}; concluídas ${row.concluidas}; canceladas ${row.canceladas}`,
    ),
  ].join("\n");
}

function formatGeneralSummary(data) {
  return [
    `Total de ${data.total ?? 0} OS no período de ${data.periodo_dias} dias:`,
    `abertas: ${data.abertas}; em andamento: ${data.em_andamento}; aguardando: ${data.aguardando}; concluídas: ${data.concluidas}; canceladas: ${data.canceladas}`,
    `atrasadas: ${data.atrasadas}`,
  ].join("\n");
}

function formatPersonSummary(data, pessoaLabel) {
  const rows = data.resumo ?? [];

  if (rows.length === 0) {
    return `Nenhum ${pessoaLabel} foi encontrado no período informado.`;
  }

  return [
    `Resumo de OS por ${pessoaLabel} no período de ${data.periodo_dias} dias:`,
    ...rows.map(
      (row) => `- ${row.nome}: total ${row.total}; atrasadas ${row.atrasadas}`,
    ),
  ].join("\n");
}

function formatAverageResolutionTime(data) {
  if (!data.quantidade_concluidas) {
    return "Nenhuma OS concluída foi encontrada para calcular o tempo médio de resolução no período informado.";
  }

  const filtros = [];

  if (data.prioridade) {
    filtros.push(`prioridade: ${label(data.prioridade)}`);
  }

  if (data.responsavel) {
    filtros.push(`responsável: ${data.responsavel}`);
  }

  const sufixo = filtros.length === 0 ? "" : ` (${filtros.join("; ")})`;

  return [
    `Tempo médio de resolução (${data.quantidade_concluidas} OS concluída(s) no período de ${data.periodo_dias} dias)${sufixo}:`,
    `média: ${data.horas_medias}h; mínimo: ${data.horas_minimas}h; máximo: ${data.horas_maximas}h`,
  ].join("\n");
}

function formatEndereco(cliente) {
  const numero = cliente.endereco_numero ? `, ${cliente.endereco_numero}` : "";
  const cidadeUf =
    cliente.endereco_cidade && cliente.endereco_estado
      ? `${cliente.endereco_cidade}/${cliente.endereco_estado}`
      : cliente.endereco_cidade ?? cliente.endereco_estado;

  const complemento = [cliente.endereco_bairro, cidadeUf, cliente.endereco_cep]
    .filter(Boolean)
    .join(" - ");

  return `${cliente.endereco_rua}${numero}${complemento ? " - " + complemento : ""}`;
}

function formatClient(cliente) {
  const parts = [
    `Cliente ${cliente.id}: ${cliente.nome}`,
    `e-mail: ${cliente.email}`,
    `status: ${cliente.ativo ? "ativo" : "inativo"}`,
    `cadastro: ${formatDate(cliente.criado_em)}`,
  ];

  if (cliente.documento_numero) {
    const rotulo = cliente.documento_tipo === "cnpj" ? "CNPJ" : "CPF";
    parts.push(`${rotulo}: ${cliente.documento_numero}`);
  }

  if (cliente.rg) {
    parts.push(`RG: ${cliente.rg}`);
  }

  if (cliente.telefone_celular) {
    parts.push(`celular: ${cliente.telefone_celular}`);
  }

  if (cliente.telefone_whatsapp) {
    parts.push(`WhatsApp: ${cliente.telefone_whatsapp}`);
  }

  if (cliente.endereco_rua) {
    parts.push(`endereço: ${formatEndereco(cliente)}`);
  }

  if (cliente.genero) {
    parts.push(`gênero: ${cliente.genero}`);
  }

  if (cliente.profissao) {
    parts.push(`profissão: ${cliente.profissao}`);
  }

  return parts.join("; ");
}

function formatClientList(data) {
  const clientes = data.clientes ?? [];

  if (clientes.length === 0) {
    return "Nenhum cliente foi encontrado para os filtros informados.";
  }

  return [
    `${data.quantidade ?? clientes.length} cliente(s) encontrado(s):`,
    ...clientes.map((cliente) => `- ${formatClient(cliente)}`),
  ].join("\n");
}

function formatClientSearch(data) {
  if (!data.encontrado || !data.cliente) {
    return "O cliente informado não foi encontrado.";
  }

  return formatClient(data.cliente);
}

function formatClientSummary(data) {
  return [
    `Resumo de clientes: total ${data.total}`,
    `Ativos: ${data.ativos}`,
    `Inativos: ${data.inativos}`,
    `Primeiro cadastro: ${
      data.primeiro_cadastro
        ? formatDate(data.primeiro_cadastro)
        : "não informado"
    }`,
    `Último cadastro: ${
      data.ultimo_cadastro
        ? formatDate(data.ultimo_cadastro)
        : "não informado"
    }`,
  ].join("\n");
}

function formatClientsByMonth(data) {
  const rows = data.resumo ?? [];

  if (rows.length === 0) {
    return "Nenhum cadastro de cliente foi encontrado.";
  }

  return [
    `${data.quantidade_meses} mês(es) com cadastros de clientes:`,
    ...rows.map(
      (row) =>
        `- ${formatMonth(row.mes)}: total ${row.total}; ativos ${row.ativos}`,
    ),
  ].join("\n");
}

function formatEmailDomains(data) {
  const domains = data.dominios ?? [];

  if (domains.length === 0) {
    return "Nenhum domínio de e-mail foi encontrado.";
  }

  return [
    `${data.quantidade ?? domains.length} domínio(s) encontrado(s):`,
    ...domains.map(
      (item) => `- ${item.dominio}: ${item.quantidade} cliente(s)`,
    ),
  ].join("\n");
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

  const paginacao =
    data.paginas !== undefined
      ? ` (página ${data.pagina} de ${data.paginas})`
      : "";

  return [
    `${data.total ?? tickets.length} ticket(s) encontrado(s)${paginacao}:`,
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
  details.push(`Comentários: ${entries.length}`);

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

  return [
    `Resumo de ${data.total_tickets ?? 0} ticket(s) por ${dimensaoLabel}${truncadoAviso}:`,
    ...resumo.map((row) => `- ${row.chave}: ${row.quantidade}`),
  ].join("\n");
}

function formatFrozenTickets(data) {
  if (data.encontrado === false) {
    return data.motivo ?? "Não foi possível aplicar os filtros informados.";
  }

  const tickets = data.tickets ?? [];

  if (tickets.length === 0) {
    return "Nenhum ticket com SLA congelado foi encontrado.";
  }

  const truncadoAviso = data.truncado
    ? " (resultado parcial: consulta truncada por volume de tickets)"
    : "";

  return [
    `${data.quantidade ?? tickets.length} ticket(s) com SLA congelado${truncadoAviso}:`,
    ...tickets.map((ticket) => `- ${formatTicket(ticket)}`),
  ].join("\n");
}

function formatOne(toolResult) {
  const { tool, dados } = toolResult;

  switch (tool) {
    case "buscar_os_por_numero":
      return formatOrderByNumber(dados);

    case "listar_os_abertas":
case "listar_os_recentes":
case "listar_os_por_status":
case "listar_os_por_prioridade":
case "listar_os_atrasadas":
case "listar_os_por_responsavel":
case "listar_os_por_solicitante":
case "listar_os_por_cliente":
  return formatOrderList(dados);

    case "consultar_historico_os":
      return formatHistory(dados);

    case "listar_historico_os":
      return formatHistoryList(dados);

    case "resumo_os_por_status":
      return formatStatusSummary(dados);

    case "resumo_os_por_prioridade":
      return formatPrioritySummary(dados);

    case "resumo_geral_os":
      return formatGeneralSummary(dados);

    case "resumo_os_por_responsavel":
      return formatPersonSummary(dados, "responsável");

    case "resumo_os_por_solicitante":
      return formatPersonSummary(dados, "solicitante");

    case "tempo_medio_resolucao_os":
      return formatAverageResolutionTime(dados);

    case "listar_clientes":
    case "listar_clientes_inativos":
    case "listar_clientes_recentes":
    case "buscar_clientes_por_nome":
      return formatClientList(dados);

    case "buscar_cliente_por_id":
    case "buscar_cliente_por_email":
      return formatClientSearch(dados);

    case "resumo_clientes":
      return formatClientSummary(dados);

    case "listar_dominios_email":
      return formatEmailDomains(dados);

    case "resumo_clientes_por_mes":
      return formatClientsByMonth(dados);

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

    case "listar_tickets_congelados":
      return formatFrozenTickets(dados);

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
