function label(value) {
  return String(value).replaceAll("_", " ");
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
    details.push(`Prazo: ${ordem.prazo}`);
  }

  if (ordem.concluida_em) {
    details.push(`Conclusão: ${ordem.concluida_em}`);
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
        `- ${evento.registrado_em}: ${label(evento.status)}; ${evento.descricao}; autor: ${evento.autor}`,
    ),
  ].join("\n");
}

function formatStatusSummary(data) {
  const rows = data.resumo ?? [];

  return [
    `Resumo de ${data.total ?? 0} OS por status no período de ${data.periodo_dias} dias:`,
    ...rows.map(
      (row) =>
        `- ${label(row.status)}: ${row.quantidade}; atrasadas: ${row.atrasadas}`,
    ),
  ].join("\n");
}

function formatPrioritySummary(data) {
  const rows = data.resumo ?? [];

  return [
    `Resumo de ${data.total ?? 0} OS por prioridade no período de ${data.periodo_dias} dias:`,
    ...rows.map(
      (row) =>
        `- ${label(row.prioridade)}: total ${row.total}; pendentes ${row.pendentes}; atrasadas ${row.atrasadas}; concluídas ${row.concluidas}; canceladas ${row.canceladas}`,
    ),
  ].join("\n");
}

function formatClient(cliente) {
  return [
    `Cliente ${cliente.id}: ${cliente.nome}`,
    `e-mail: ${cliente.email}`,
    `status: ${cliente.ativo ? "ativo" : "inativo"}`,
    `cadastro: ${cliente.criado_em}`,
  ].join("; ");
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
    `Primeiro cadastro: ${data.primeiro_cadastro ?? "não informado"}`,
    `Último cadastro: ${data.ultimo_cadastro ?? "não informado"}`,
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

function formatOne(toolResult) {
  const { tool, dados } = toolResult;

  switch (tool) {
    case "buscar_os_por_numero":
      return formatOrderByNumber(dados);

    case "listar_os_abertas":
case "listar_os_por_status":
case "listar_os_atrasadas":
case "listar_os_por_responsavel":
case "listar_os_por_solicitante":
  return formatOrderList(dados);

    case "consultar_historico_os":
      return formatHistory(dados);

    case "resumo_os_por_status":
      return formatStatusSummary(dados);

    case "resumo_os_por_prioridade":
      return formatPrioritySummary(dados);

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
