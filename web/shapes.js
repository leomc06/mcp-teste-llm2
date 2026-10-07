// Reconhece formas de dados já presentes em `dadosConsultados` (o JSON cru
// de cada tool, enviado em toda resposta) pra oferecer tabela/gráfico sem
// depender de como a pergunta foi digitada. Puro, sem DOM — testável com
// node:test. `web/` não compartilha código com `agent/`, então essa
// detecção é uma reimplementação pequena e independente, não um import de
// agent/response-formatter.js.

// listar_areas_tickets/listar_prioridades_tickets/listar_canais_tickets/
// listar_status_tickets/listar_departamentos_tickets/listar_usuarios_tickets/
// buscar_usuarios_por_nome — todos devolvem {quantidade, <chave>: [{id,
// name, ...}]}, mesmo par id/name em todos (confirmado contra a API real).
const CATALOG_ARRAY_KEYS = ["areas", "prioridades", "canais", "status", "departamentos", "usuarios"];

// analisar_carga_operador/analisar_atividade_cliente — mesmo conjunto de
// contadores pra UM operador/cliente só (não um breakdown por categoria,
// por isso não é "resumo", e não tem sem_operador/abertos_com_mais_de_7_dias,
// por isso não é "operacional").
function isIndividualShape(dados) {
  return Boolean(dados)
    && Number.isFinite(dados.total)
    && Number.isFinite(dados.abertos)
    && Number.isFinite(dados.fechados)
    && Number.isFinite(dados.congelados)
    && Number.isFinite(dados.prioridade_alta_ou_urgente);
}

export function detectTabularShape(dadosConsultados) {
  if (!Array.isArray(dadosConsultados)) {
    return null;
  }

  // "Compare X e Y" chama a MESMA tool 2x (uma pra cada lado) — tanto a
  // forma "individual" quanto um ticket único aparecem duplicados em
  // dadosConsultados nesse caso. Mostrar tabela/gráfico só do primeiro lado
  // (o que o loop abaixo faria sem essa contagem prévia), descartando o
  // segundo em silêncio, seria pior que não oferecer nada — o texto da
  // resposta (formatComparison) já cobre os dois lados.
  const individualCount = dadosConsultados.filter((item) => isIndividualShape(item?.dados)).length;
  const ticketUnicoCount = dadosConsultados.filter(
    (item) => item?.dados?.ticket && typeof item.dados.ticket === "object",
  ).length;

  for (const item of dadosConsultados) {
    const dados = item?.dados;

    if (!dados || typeof dados !== "object") {
      continue;
    }

    if (Array.isArray(dados.resumo)) {
      return {
        kind: "resumo",
        tool: item.tool,
        total: dados.total_tickets,
        filtros: dados.filtros ?? {},
        rows: dados.resumo.map((row) => ({
          label: row.chave,
          value: row.quantidade,
          percent: row.percentual,
        })),
      };
    }

    if (
      Number.isFinite(dados.abertos)
      && Number.isFinite(dados.fechados)
      && Number.isFinite(dados.sem_operador)
      && Number.isFinite(dados.congelados)
      && Number.isFinite(dados.abertos_com_mais_de_7_dias)
    ) {
      return {
        kind: "operacional",
        tool: item.tool,
        filtros: dados.filtros ?? {},
        rows: [
          { label: "Abertos", value: dados.abertos },
          { label: "Fechados", value: dados.fechados },
          { label: "Sem operador", value: dados.sem_operador },
          { label: "Congelados", value: dados.congelados },
          { label: "Abertos +7 dias", value: dados.abertos_com_mais_de_7_dias },
        ],
        porPrioridade: Array.isArray(dados.por_prioridade)
          ? dados.por_prioridade.map((row) => ({
            label: row.chave,
            value: row.quantidade,
          }))
          : [],
      };
    }

    if (individualCount === 1 && isIndividualShape(dados)) {
      return {
        kind: "individual",
        tool: item.tool,
        nome: dados.operador ?? dados.cliente,
        rows: [
          { label: "Total", value: dados.total },
          { label: "Abertos", value: dados.abertos },
          { label: "Fechados", value: dados.fechados },
          { label: "Congelados", value: dados.congelados },
          { label: "Prioridade alta ou urgente", value: dados.prioridade_alta_ou_urgente },
        ],
      };
    }

    const catalogKey = CATALOG_ARRAY_KEYS.find((chave) => Array.isArray(dados[chave]));

    if (catalogKey !== undefined) {
      return {
        kind: "catalogo",
        tool: item.tool,
        rows: dados[catalogKey],
      };
    }

    // Listagens paginadas (`listar_tickets` e afins) só trazem a página
    // atual — já pré-paginado no servidor MCP — então nunca representam o
    // conjunto completo. `isPartial` marca isso pra quem consome a forma
    // (B não oferece gráfico aqui, só tabela).
    if (Array.isArray(dados.tickets)) {
      return {
        kind: "lista",
        tool: item.tool,
        isPartial: true,
        rows: dados.tickets,
      };
    }

    // buscar_ticket_por_numero — reaproveita a forma "lista" com 1 linha só
    // (mesmas colunas, mesma tabela/CSV/PDF), já que é o mesmo tipo de
    // registro (ticket), só que um único resultado completo, não paginado.
    if (ticketUnicoCount === 1 && dados.ticket && typeof dados.ticket === "object") {
      return {
        kind: "lista",
        tool: item.tool,
        isPartial: false,
        rows: [dados.ticket],
      };
    }
  }

  return null;
}

// Mesma projeção de colunas usada pela tabela (web/app.js) e pelo export
// CSV — um único lugar decide "quais colunas" pra uma forma, pra não
// desalinhar as duas visões.
export function buildTableRows(shape) {
  if (shape.kind === "lista") {
    return {
      headers: ["Número", "Status", "Prioridade", "Área", "Operador", "Abertura"],
      rows: shape.rows.map((ticket) => [
        ticket.number,
        ticket.status,
        ticket.priority,
        ticket.area,
        ticket.operator,
        ticket.opening_date,
      ]),
    };
  }

  if (shape.kind === "catalogo") {
    return {
      headers: ["ID", "Nome"],
      rows: shape.rows.map((entrada) => [entrada.id, entrada.name]),
    };
  }

  const hasPercent = shape.rows.some((row) => row.percent !== undefined);

  return {
    headers: hasPercent
      ? ["Categoria", "Quantidade", "Percentual"]
      : ["Categoria", "Quantidade"],
    rows: shape.rows.map((row) => (
      hasPercent
        ? [row.label, row.value, row.percent !== undefined ? `${row.percent}%` : "-"]
        : [row.label, row.value]
    )),
  };
}

export function escapeCsvField(value) {
  const text = value === undefined || value === null ? "" : String(value);

  return /[",\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

// Achado ao vivo: a primeira versão desses chips usava o mecanismo de
// continuação (agent/continuation.js), gerando algo como "e desses só os
// Urgente" pra colar na frase anterior. Só que a frase anterior ("resumo
// operacional"/"resumo por X") ainda tem a palavra "resumo" presente depois
// do merge — e `isDashboardIntent`/`hasResumoIntent` são checados ANTES de
// qualquer branch de listagem no roteador, então o merge sempre voltava pro
// mesmo tool de resumo, sem filtrar nada (confirmado testando os dois
// turnos de verdade contra o servidor). Por isso os chips aqui NÃO usam
// continuação — constroem uma pergunta nova e autônoma ("Liste os tickets
// com prioridade Urgente na área Suporte"), usando os filtros que a própria
// tool já devolveu em `dados.filtros`. Isso sempre aponta pra uma tool de
// listagem (listar_tickets/listar_tickets_abertos/...), que de fato filtra.
function describeFiltros(filtros = {}, excludeField) {
  const parts = [];

  if (filtros.area && excludeField !== "area") {
    parts.push(`na área ${filtros.area}`);
  }

  if (filtros.departamento && excludeField !== "departamento") {
    parts.push(`do departamento ${filtros.departamento}`);
  }

  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

// "status" fica de fora de propósito: alguns valores (ex.: "ENCERRADA",
// "CANCELADO") colidem com a checagem de contradição do roteador
// ("tickets com status ENCERRADA" é lido como um status que não combina
// com "fechado"/"encerrado" e vira pedido de esclarecimento, não uma
// listagem) — sem um valor seguro de frase pra todo status, melhor não
// oferecer o chip do que oferecer um que as vezes falha.
const DIMENSION_DRILLDOWN_BY_TOOL = {
  resumo_tickets_por_prioridade: { field: "prioridade", phrase: (label) => `com prioridade ${label}` },
  resumo_tickets_por_area: { field: "area", phrase: (label) => `na área ${label}` },
  resumo_tickets_por_operador: { field: "operador", phrase: (label) => `do operador ${label}` },
  resumo_tickets_por_departamento: { field: "departamento", phrase: (label) => `do departamento ${label}` },
  resumo_tickets_por_cliente: { field: "cliente", phrase: (label) => `do cliente ${label}` },
};

export function buildRefinementChips(shape) {
  if (!shape) {
    return [];
  }

  if (shape.kind === "operacional") {
    const abertos = shape.rows.find((row) => row.label === "Abertos");
    const fechados = shape.rows.find((row) => row.label === "Fechados");
    const chips = [];

    if (abertos && abertos.value > 0) {
      chips.push({
        label: "Só os abertos",
        pergunta: `Liste os tickets abertos${describeFiltros(shape.filtros)}`,
      });
    }

    if (fechados && fechados.value > 0) {
      chips.push({
        label: "Só os fechados",
        pergunta: `Liste os tickets fechados${describeFiltros(shape.filtros)}`,
      });
    }

    return chips;
  }

  if (shape.kind === "resumo") {
    const dimension = DIMENSION_DRILLDOWN_BY_TOOL[shape.tool];

    if (!dimension) {
      return [];
    }

    // Sem limite de quantidade: o pedido é mostrar sempre TODAS as
    // combinações possíveis (uma categoria presente no resumo = uma chip),
    // não só as primeiras — o usuário notou que só 4 apareciam e queria
    // todas (ex.: 8 áreas no resumo por área deviam virar 8 chips).
    return shape.rows.map((row) => ({
      label: `Só ${row.label}`,
      pergunta: `Liste os tickets ${dimension.phrase(row.label)}${describeFiltros(shape.filtros, dimension.field)}`,
    }));
  }

  return [];
}

export function buildCsv(shape) {
  if (!shape) {
    return "";
  }

  const { headers, rows } = buildTableRows(shape);

  return [headers, ...rows]
    .map((row) => row.map(escapeCsvField).join(","))
    .join("\r\n");
}
