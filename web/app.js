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

let baseQuestion = null;

function updateCharacterCount() {
  characterCount.textContent =
    `${questionInput.value.length} / 2000`;
}

function setLoading(isLoading) {
  loadingPanel.hidden = !isLoading;
  submitButton.disabled = isLoading;
  form.setAttribute("aria-busy", String(isLoading));
}

function hideResults() {
  errorPanel.hidden = true;
  responsePanel.hidden = true;
  sources.hidden = true;
  pagination.hidden = true;
}

function showError(message) {
  errorMessage.textContent = message;
  errorPanel.hidden = false;
}

function renderSources(items) {
  sourceList.replaceChildren();

  if (!Array.isArray(items) || items.length === 0) {
    sources.hidden = true;
    return;
  }

  for (const item of items) {
    const fragment = sourceTemplate.content.cloneNode(true);

    fragment.querySelector(".source-number").textContent =
      `OS ${item.numero}`;

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
  answer.textContent = data.resposta ?? "Resposta não disponível.";

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

async function submitQuestion(pergunta) {
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
  submitQuestion(`${baseQuestion} (página ${current - 1})`);
});

paginationNext.addEventListener("click", () => {
  const current = Number(pagination.dataset.currentPage ?? "1");
  submitQuestion(`${baseQuestion} (página ${current + 1})`);
});

updateCharacterCount();
