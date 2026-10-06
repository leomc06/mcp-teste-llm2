// Subconjunto seguro de markdown usado pela interface web para renderizar
// `resposta` como HTML real (negrito, listas, tabelas) em vez de texto
// puro. Deliberadamente pequeno: só o que os formatters de
// agent/response-formatter.js já produzem (linhas "- item", e futuras
// tabelas em pipe) mais **negrito**. Puro/sem DOM, pra poder ser testado
// com node:test sem precisar de jsdom — quem usa `document` fica em
// app.js.

export function tokenizeInline(text) {
  return String(text ?? "")
    .split(/(\*\*[^*]+\*\*)/)
    .filter((part) => part.length > 0)
    .map((part) => {
      const match = /^\*\*([^*]+)\*\*$/.exec(part);
      return match
        ? { bold: true, text: match[1] }
        : { bold: false, text: part };
    });
}

const TABLE_ROW_PATTERN = /^\s*\|.*\|\s*$/;
const BULLET_LINE_PATTERN = /^-\s+/;
const TABLE_SEPARATOR_CELL_PATTERN = /^:?-+:?$/;

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseMarkdownSubset(rawText) {
  const lines = String(rawText ?? "").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (TABLE_ROW_PATTERN.test(line)) {
      const tableLines = [];

      while (i < lines.length && TABLE_ROW_PATTERN.test(lines[i])) {
        tableLines.push(lines[i]);
        i += 1;
      }

      const rows = tableLines
        .map(splitTableRow)
        .filter(
          (cells) =>
            !cells.every((cell) => TABLE_SEPARATOR_CELL_PATTERN.test(cell)),
        );

      blocks.push({ type: "table", rows });
      continue;
    }

    if (BULLET_LINE_PATTERN.test(line)) {
      const items = [];

      while (i < lines.length && BULLET_LINE_PATTERN.test(lines[i])) {
        items.push(lines[i].replace(BULLET_LINE_PATTERN, ""));
        i += 1;
      }

      blocks.push({ type: "ul", items });
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const paragraphLines = [];

    while (
      i < lines.length
      && lines[i].trim() !== ""
      && !TABLE_ROW_PATTERN.test(lines[i])
      && !BULLET_LINE_PATTERN.test(lines[i])
    ) {
      paragraphLines.push(lines[i]);
      i += 1;
    }

    blocks.push({ type: "p", lines: paragraphLines });
  }

  return blocks;
}
