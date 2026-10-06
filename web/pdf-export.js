// Gera um PDF de verdade no navegador, sem lib/CDN (mesma decisão
// arquitetural dos gráficos em SVG hand-rolled de charts.js). Reaproveita
// as mesmas colunas do export CSV (buildTableRows, em shapes.js) pra que
// as duas visões nunca desalinhem.
//
// Monta a sintaxe PDF (cabeçalho, objetos, xref, trailer) como uma string
// onde cada caractere representa 1 byte — só usa fontes padrão (Helvetica
// e Courier, sem embutir nenhuma), que todo leitor de PDF já conhece.
import { buildTableRows } from "./shapes.js";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const LINE_HEIGHT = 14;
const TITLE_FONT_SIZE = 16;
const BODY_FONT_SIZE = 9;
const MAX_ROWS_PER_PAGE = 40;
const COURIER_CHAR_WIDTH_RATIO = 0.6;

// Mesma paleta de web/styles.css (:root) — mantém o PDF com a identidade
// visual do app. Atualize os dois juntos se a paleta mudar lá.
const PDF_COLORS = {
  background: "#1a232b",
  border: "#435562",
  text: "#eef2f4",
  muted: "#9fb2bc",
  accent: "#2fae8e",
  accentText: "#0e2420",
};

function hexToRgbTriplet(hex) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16) / 255);
  return channels.map((channel) => channel.toFixed(3)).join(" ");
}

const FILL = Object.fromEntries(
  Object.entries(PDF_COLORS).map(([key, hex]) => [key, hexToRgbTriplet(hex)]),
);

function slugifyForFileName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .toLowerCase();
}

function formatDateForFileName(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}${min}`;
}

// Nome de arquivo legível: nome da tool consultada + data/hora, em vez de
// "tickets-<timestamp>" (achado ao vivo: o usuário queria identificar o
// relatório pelo nome, não por um número grande sem significado).
export function buildPdfFileName(shape, now = new Date()) {
  const tool = shape?.tool ? slugifyForFileName(shape.tool) : "relatorio-tickets";
  return `${tool}-${formatDateForFileName(now)}.pdf`;
}

function sanitizeLatin1(value) {
  return Array.from(String(value))
    .map((ch) => (ch.codePointAt(0) <= 255 ? ch : "?"))
    .join("");
}

function escapePdfLiteral(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function toPdfText(text) {
  return escapePdfLiteral(sanitizeLatin1(text));
}

function availableCharsFor(fontSize) {
  const usableWidth = PAGE_WIDTH - MARGIN * 2;
  const charWidth = fontSize * COURIER_CHAR_WIDTH_RATIO;
  return Math.max(10, Math.floor(usableWidth / charWidth));
}

function chunkRows(rows, size) {
  const chunks = [];

  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }

  return chunks.length > 0 ? chunks : [[]];
}

export function computeColumnWidths(headers, rows, maxTotalChars) {
  const desired = headers.map((header, colIndex) => {
    let max = sanitizeLatin1(header).length;

    for (const row of rows) {
      const len = sanitizeLatin1(row[colIndex] ?? "").length;
      if (len > max) {
        max = len;
      }
    }

    return Math.max(max + 2, 6);
  });

  const total = desired.reduce((sum, width) => sum + width, 0);

  if (total <= maxTotalChars) {
    return desired;
  }

  const scale = maxTotalChars / total;
  return desired.map((width) => Math.max(6, Math.floor(width * scale)));
}

function padRow(cols, widths) {
  return cols
    .map((value, i) => {
      const width = widths[i];
      const text = sanitizeLatin1(value === undefined || value === null ? "-" : value);
      return text.slice(0, width).padEnd(width);
    })
    .join("");
}

function buildPageContentStream({ title, subtitle, headerLine, bodyLines, isFirstPage }) {
  const ops = [];

  function textLine(y, size, font, fillColor, text) {
    ops.push("BT");
    ops.push(`${fillColor} rg`);
    ops.push(`/${font} ${size} Tf`);
    ops.push(`${MARGIN} ${y} Td`);
    ops.push(`(${toPdfText(text)}) Tj`);
    ops.push("ET");
  }

  // Fundo da página (--background) e barra de destaque no topo (--accent) —
  // mesmas cores do .response-panel/.app-topbar-mark da interface.
  ops.push(`${FILL.background} rg`);
  ops.push(`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT} re f`);
  ops.push(`${FILL.accent} rg`);
  ops.push(`0 ${PAGE_HEIGHT - 6} ${PAGE_WIDTH} 6 re f`);

  textLine(
    PAGE_HEIGHT - MARGIN,
    TITLE_FONT_SIZE,
    "F1",
    FILL.text,
    isFirstPage ? title : `${title} (cont.)`,
  );

  let cursorY = PAGE_HEIGHT - MARGIN - 24;

  if (isFirstPage && subtitle) {
    textLine(cursorY, BODY_FONT_SIZE, "F2", FILL.muted, subtitle);
    cursorY -= LINE_HEIGHT * 1.5;
  }

  // Faixa de cabeçalho da tabela (--accent) com texto em --accent-text pro
  // contraste — mesmo par de cores do botão de toggle ativo na interface.
  ops.push(`${FILL.accent} rg`);
  ops.push(`${MARGIN - 4} ${cursorY - 3} ${PAGE_WIDTH - (MARGIN - 4) * 2} ${LINE_HEIGHT + 2} re f`);
  textLine(cursorY, BODY_FONT_SIZE, "F2", FILL.accentText, headerLine);
  cursorY -= LINE_HEIGHT;

  // Linha separadora sob cada registro (--border), espelhando o
  // border-bottom dos <td> da tabela HTML.
  ops.push(`${FILL.border} RG`);
  ops.push("0.5 w");

  for (const bodyLine of bodyLines) {
    textLine(cursorY, BODY_FONT_SIZE, "F2", FILL.text, bodyLine);
    const ruleY = cursorY - 3;
    ops.push(`${MARGIN - 4} ${ruleY} m`);
    ops.push(`${PAGE_WIDTH - MARGIN + 4} ${ruleY} l`);
    ops.push("S");
    cursorY -= LINE_HEIGHT;
  }

  return ops.join("\n");
}

function assemblePdf(pageContents) {
  const pageCount = pageContents.length;
  const fontF1Num = 3;
  const fontF2Num = 4;
  const firstPageObjNum = 5;
  const firstContentObjNum = firstPageObjNum + pageCount;

  const objects = [];

  objects.push({ num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" });

  const kids = [];
  for (let i = 0; i < pageCount; i++) {
    kids.push(`${firstPageObjNum + i} 0 R`);
  }
  objects.push({
    num: 2,
    body: `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`,
  });

  objects.push({
    num: fontF1Num,
    body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  });
  objects.push({
    num: fontF2Num,
    body: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  });

  for (let i = 0; i < pageCount; i++) {
    objects.push({
      num: firstPageObjNum + i,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] `
        + `/Resources << /Font << /F1 ${fontF1Num} 0 R /F2 ${fontF2Num} 0 R >> >> `
        + `/Contents ${firstContentObjNum + i} 0 R >>`,
    });
  }

  for (let i = 0; i < pageCount; i++) {
    objects.push({ num: firstContentObjNum + i, stream: pageContents[i] });
  }

  objects.sort((a, b) => a.num - b.num);

  let pdf = "%PDF-1.4\n";
  const offsets = new Map();

  for (const obj of objects) {
    offsets.set(obj.num, pdf.length);

    pdf += obj.stream !== undefined
      ? `${obj.num} 0 obj\n<< /Length ${obj.stream.length} >>\nstream\n${obj.stream}\nendstream\nendobj\n`
      : `${obj.num} 0 obj\n${obj.body}\nendobj\n`;
  }

  const maxObjNum = objects[objects.length - 1].num;
  const xrefOffset = pdf.length;

  let xref = `xref\n0 ${maxObjNum + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= maxObjNum; n++) {
    xref += `${String(offsets.get(n)).padStart(10, "0")} 00000 n \n`;
  }

  pdf += xref;
  pdf += `trailer\n<< /Size ${maxObjNum + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

export function buildPdfDocument({ title, subtitle, headers, rows }) {
  const maxTotalChars = availableCharsFor(BODY_FONT_SIZE);
  const widths = computeColumnWidths(headers, rows, maxTotalChars);
  const headerLine = padRow(headers, widths);
  const pageChunks = chunkRows(rows, MAX_ROWS_PER_PAGE);

  const pageContents = pageChunks.map((chunk, pageIndex) =>
    buildPageContentStream({
      title,
      subtitle,
      headerLine,
      bodyLines: chunk.map((row) => padRow(row, widths)),
      isFirstPage: pageIndex === 0,
    }));

  return assemblePdf(pageContents);
}

export function pdfStringToBytes(pdfString) {
  const bytes = new Uint8Array(pdfString.length);

  for (let i = 0; i < pdfString.length; i++) {
    bytes[i] = pdfString.charCodeAt(i) & 0xff;
  }

  return bytes;
}

export function buildPdfBytes(shape, question) {
  if (!shape) {
    return null;
  }

  const { headers, rows } = buildTableRows(shape);
  const subtitleParts = [];

  if (question) {
    subtitleParts.push(sanitizeLatin1(question).slice(0, 70));
  }

  subtitleParts.push(`Gerado em ${new Date().toLocaleString("pt-BR")}`);

  const pdfString = buildPdfDocument({
    title: "Relatorio de tickets",
    subtitle: subtitleParts.join(" - "),
    headers,
    rows,
  });

  return pdfStringToBytes(pdfString);
}
