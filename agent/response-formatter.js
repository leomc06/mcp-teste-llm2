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

function formatHistoryList(data) {
  const eventos = data.eventos ?? [];

  if (eventos.length === 0) {
    return "Nenhum evento de histórico foi encontrado no período consultado.";
  }

  return [
    `${data.quantidade ?? eventos.length} evento(s) de histórico no período de ${data.periodo_dias} dias:`,
    ...eventos.map(
      (evento) =>
        `- ${evento.registrado_em}: OS ${evento.os_numero} (${evento.os_titulo}); ${label(evento.status)}; ${evento.descricao}; autor: ${evento.autor}`,
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
    `cadastro: ${cliente.criado_em}`,
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
    `Primeiro cadastro: ${data.primeiro_cadastro ?? "não informado"}`,
    `Último cadastro: ${data.ultimo_cadastro ?? "não informado"}`,
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
      (row) => `- ${row.mes}: total ${row.total}; ativos ${row.ativos}`,
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
