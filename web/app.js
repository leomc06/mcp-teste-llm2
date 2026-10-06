import { parseMarkdownSubset, tokenizeInline } from "./markdown-subset.js";
import {
  detectTabularShape,
  buildTableRows,
  buildCsv,
  buildRefinementChips,
} from "./shapes.js";
import { renderBarChart, renderPieChart } from "./charts.js";
import { buildPdfBytes } from "./pdf-export.js";

const form = document.querySelector("#query-form");
const questionInput = document.querySelector("#question");
const characterCount = document.querySelector("#character-count");
const submitButton = document.querySelector("#submit-button");

const loadingPanel = document.querySelector("#loading");
const errorPanel = document.querySelector("#error-panel");
const errorMessage = document.querySelector("#error-message");

const responsePanel = document.querySelector("#response-panel");
const answer = document.querySelector("#answer");
const duration = document.querySelector("#duration");

const sources = document.querySelector("#sources");
const sourceCount = document.querySelector("#source-count");
const sourceList = document.querySelector("#source-list");
const sourceTemplate = document.querySelector("#source-template");

const requestId = document.querySelector("#request-id");
const toolsUsed = document.querySelector("#tools-used");

const pagination = document.querySelector("#pagination");
const paginationPrev = document.querySelector("#pagination-prev");
const paginationStatus = document.querySelector("#pagination-status");
const paginationNext = document.querySelector("#pagination-next");

const viewToggle = document.querySelector("#view-toggle");
const viewToggleButtons = viewToggle.querySelectorAll(".view-toggle-button[data-view]");
const viewTable = document.querySelector("#view-table");
const viewChart = document.querySelector("#view-chart");
const csvExportButton = document.querySelector("#csv-export");
const pdfExportButton = document.querySelector("#pdf-export");

const refinementChips = document.querySelector("#refinement-chips");

let baseQuestion = null;
let currentShape = null;
let chartSubView = "barra";
// Guarda a pergunta EFETIVA devolvida pelo servidor (já com continuação
// anterior mesclada, se houve) — não a digitada crua — pra encadear 3+
// turnos sem perder contexto a cada novo "e desses...".
let lastEffectiveQuestion = null;

function updateCharacterCount() {
  characterCount.textContent =
    `${questionInput.value.length} / 2000`;
}

function setLoading(isLoading) {
  loadingPanel.hidden = !isLoading;
  submitButton.disabled = isLoading;
  form.setAttribute("aria-busy", String(isLoading));
}

function appendInlineRun(parent, text) {
  for (const segment of tokenizeInline(text)) {
    if (segment.bold) {
      const strong = document.createElement("strong");
      strong.textContent = segment.text;
      parent.append(strong);
    } else {
      parent.append(document.createTextNode(segment.text));
    }
  }
}

function renderMarkdownSubset(rawText) {
  const container = document.createElement("div");

  for (const block of parseMarkdownSubset(rawText)) {
    if (block.type === "table") {
      const table = document.createElement("table");
      table.className = "data-table";
      const tbody = document.createElement("tbody");

      for (const row of block.rows) {
        const tr = document.createElement("tr");

        for (const cell of row) {
          const td = document.createElement("td");
          appendInlineRun(td, cell);
          tr.append(td);
        }

        tbody.append(tr);
      }

      table.append(tbody);
      container.append(table);
    } else if (block.type === "ul") {
      const ul = document.createElement("ul");

      for (const item of block.items) {
        const li = document.createElement("li");
        appendInlineRun(li, item);
        ul.append(li);
      }

      container.append(ul);
    } else {
      const p = document.createElement("p");

      block.lines.forEach((line, index) => {
        if (index > 0) {
          p.append(document.createElement("br"));
        }

        appendInlineRun(p, line);
      });

      container.append(p);
    }
  }

  return container;
}

function hideResults() {
  errorPanel.hidden = true;
  responsePanel.hidden = true;
  sources.hidden = true;
  pagination.hidden = true;
  viewToggle.hidden = true;
  viewTable.hidden = true;
  viewChart.hidden = true;
  // Evita que um chip gerado pela resposta anterior ainda seja clicável
  // depois que uma pergunta nova (possivelmente não relacionada) já foi
  // enviada — some daqui antes da resposta nova chegar, não só depois.
  refinementChips.hidden = true;
}

function showError(message) {
  errorMessage.textContent = message;
  errorPanel.hidden = false;
}

function setActiveView(view) {
  answer.hidden = view !== "texto";
  viewTable.hidden = view !== "tabela";
  viewChart.hidden = view !== "grafico";

  for (const button of viewToggleButtons) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.view === view),
    );
  }
}

function renderTableView(shape) {
  viewTable.replaceChildren();

  if (!shape) {
    return;
  }

  const { headers, rows } = buildTableRows(shape);

  const table = document.createElement("table");
  table.className = "data-table";

  const headerRow = document.createElement("tr");
  for (const header of headers) {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.append(th);
  }
  table.append(headerRow);

  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const value of row) {
      const td = document.createElement("td");
      td.textContent = value === undefined || value === null ? "-" : String(value);
      tr.append(td);
    }
    table.append(tr);
  }

  viewTable.append(table);
}

function renderChartView(shape) {
  viewChart.replaceChildren();

  if (!shape || shape.kind === "lista") {
    return;
  }

  const pieEligible =
    shape.kind === "resumo"
    && shape.rows.length <= 6
    && shape.rows.every((row) => row.percent !== undefined);

  if (pieEligible) {
    const subToggle = document.createElement("div");
    subToggle.className = "chart-sub-toggle";

    for (const kind of ["barra", "pizza"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = kind === "barra" ? "Barra" : "Pizza";
      button.className = "chart-sub-toggle-button";
      button.setAttribute("aria-pressed", String(chartSubView === kind));
      button.addEventListener("click", () => {
        chartSubView = kind;
        renderChartView(shape);
      });
      subToggle.append(button);
    }

    viewChart.append(subToggle);
  } else {
    chartSubView = "barra";
  }

  const chartContainer = document.createElement("div");
  const drew = chartSubView === "pizza" && pieEligible
    ? renderPieChart(chartContainer, shape.rows)
    : renderBarChart(chartContainer, shape.rows);

  if (!drew) {
    const note = document.createElement("p");
    note.className = "chart-empty-note";
    note.textContent = "Nenhum dado no período.";
    viewChart.append(note);
    return;
  }

  viewChart.append(chartContainer);
}

function renderViewToggle(shape) {
  currentShape = shape;

  const chartButton = viewToggle.querySelector('[data-view="grafico"]');

  if (!shape) {
    viewToggle.hidden = true;
    csvExportButton.hidden = true;
    pdfExportButton.hidden = true;
    setActiveView("texto");
    return;
  }

  chartButton.hidden = shape.kind === "lista";
  viewToggle.hidden = false;
  csvExportButton.hidden = false;
  pdfExportButton.hidden = false;

  renderTableView(shape);
  renderChartView(shape);
  setActiveView("texto");
}

viewToggleButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.view));
});

function renderRefinementChips(shape) {
  refinementChips.replaceChildren();

  const chips = buildRefinementChips(shape);

  if (chips.length === 0) {
    refinementChips.hidden = true;
    return;
  }

  for (const chip of chips) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "refinement-chip";
    button.textContent = chip.label;
    button.addEventListener("click", () => submitQuestion(chip.pergunta));
    refinementChips.append(button);
  }

  refinementChips.hidden = false;
}

csvExportButton.addEventListener("click", () => {
  if (!currentShape) {
    return;
  }

  const csvText = buildCsv(currentShape);
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `tickets-${Date.now()}.csv`;
  link.click();

  URL.revokeObjectURL(url);
});

pdfExportButton.addEventListener("click", () => {
  if (!currentShape) {
    return;
  }

  const pdfBytes = buildPdfBytes(currentShape, lastEffectiveQuestion);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `tickets-${Date.now()}.pdf`;
  link.click();

  URL.revokeObjectURL(url);
});

function renderSources(items) {
  sourceList.replaceChildren();

  if (!Array.isArray(items) || items.length === 0) {
    sources.hidden = true;
    return;
  }

  for (const item of items) {
    const fragment = sourceTemplate.content.cloneNode(true);

    fragment.querySelector(".source-number").textContent =
      `Ticket ${item.numero}`;

    fragment.querySelector(".source-tool").textContent =
      item.tool;

    sourceList.append(fragment);
  }

  sourceCount.textContent =
    `${items.length} fonte${items.length === 1 ? "" : "s"}`;

  sources.hidden = false;
}

function findPaginatedResult(dadosConsultados) {
  if (!Array.isArray(dadosConsultados)) {
    return null;
  }

  for (const item of dadosConsultados) {
    const dados = item?.dados;

    if (
      dados
      && Number.isFinite(dados.pagina)
      && Number.isFinite(dados.paginas)
    ) {
      return dados;
    }
  }

  return null;
}

function renderPagination(dadosConsultados) {
  const info = findPaginatedResult(dadosConsultados);

  if (!info || info.paginas <= 1 || !baseQuestion) {
    pagination.hidden = true;
    return;
  }

  paginationStatus.textContent =
    `Página ${info.pagina} de ${info.paginas}`;

  paginationPrev.disabled = info.pagina <= 1;
  paginationNext.disabled = info.pagina >= info.paginas;

  pagination.dataset.currentPage = String(info.pagina);
  pagination.dataset.totalPages = String(info.paginas);
  pagination.hidden = false;
}

function renderResponse(data) {
  answer.replaceChildren();
  answer.append(
    renderMarkdownSubset(data.resposta ?? "Resposta não disponível."),
  );

  duration.textContent = Number.isFinite(data.duracaoMs)
    ? `${(data.duracaoMs / 1000).toFixed(1)} s`
    : "";

  requestId.textContent = data.requestId ?? "-";

  toolsUsed.textContent =
    Array.isArray(data.toolsUtilizadas)
    && data.toolsUtilizadas.length > 0
      ? data.toolsUtilizadas.join(", ")
      : "Nenhuma";

  renderSources(data.fontes);
  renderPagination(data.dadosConsultados);
  const shape = detectTabularShape(data.dadosConsultados);
  renderViewToggle(shape);
  renderRefinementChips(shape);

  const viewPreferida = data.visualizacaoPreferida;
  if (shape && (viewPreferida === "tabela" || viewPreferida === "grafico")) {
    setActiveView(viewPreferida);
  }

  responsePanel.hidden = false;
}

async function readResponse(response) {
  try {
    return await response.json();
  } catch {
    return {
      mensagem: "O servidor retornou uma resposta inválida.",
    };
  }
}

questionInput.addEventListener("input", updateCharacterCount);

questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

async function submitQuestion(pergunta, { includeContinuation = true } = {}) {
  hideResults();
  setLoading(true);

  try {
    const response = await fetch("/api/ia/consultar-os", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": "interface-local",
      },
      body: JSON.stringify({
        pergunta,
        perguntaAnterior: includeContinuation
          ? (lastEffectiveQuestion ?? undefined)
          : undefined,
      }),
      signal: AbortSignal.timeout(310000),
    });

    const data = await readResponse(response);

    if (!response.ok) {
      throw new Error(
        data.mensagem
        ?? "Não foi possível concluir a consulta.",
      );
    }

    renderResponse(data);

    // Paginação não participa da cadeia de continuação (ver plano item F) —
    // só atualiza o contexto quando a pergunta veio do formulário ou de um
    // chip de refinamento.
    if (includeContinuation) {
      lastEffectiveQuestion = data.perguntaEfetiva ?? pergunta;
    }
  } catch (error) {
    if (
      error?.name === "TimeoutError"
      || error?.name === "AbortError"
    ) {
      showError(
        "A consulta excedeu o tempo máximo. Tente novamente.",
      );
    } else {
      showError(
        error?.message
        ?? "Não foi possível conectar ao servidor.",
      );
    }
  } finally {
    setLoading(false);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const question = questionInput.value.trim();

  if (!question) {
    form.reportValidity();
    return;
  }

  baseQuestion = question;
  submitQuestion(question);
});

paginationPrev.addEventListener("click", () => {
  const current = Number(pagination.dataset.currentPage ?? "1");
  submitQuestion(`${baseQuestion} (página ${current - 1})`, { includeContinuation: false });
});

paginationNext.addEventListener("click", () => {
  const current = Number(pagination.dataset.currentPage ?? "1");
  submitQuestion(`${baseQuestion} (página ${current + 1})`, { includeContinuation: false });
});

updateCharacterCount();
