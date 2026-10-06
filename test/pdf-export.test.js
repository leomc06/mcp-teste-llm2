import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPdfBytes,
  buildPdfDocument,
  computeColumnWidths,
  pdfStringToBytes,
} from "../web/pdf-export.js";

function xrefOffsetsAreValid(pdfString) {
  const startxrefMatch = pdfString.match(/startxref\n(\d+)\n%%EOF$/);
  assert.ok(startxrefMatch, "arquivo deve terminar com startxref/%%EOF");

  const xrefOffset = Number(startxrefMatch[1]);
  assert.equal(pdfString.slice(xrefOffset, xrefOffset + 4), "xref");

  const lineRegex = /(\d{10}) 00000 n \n/g;
  let match;
  let objectNumber = 1;

  while ((match = lineRegex.exec(pdfString)) !== null) {
    const offset = Number(match[1]);
    const expectedStart = `${objectNumber} 0 obj`;
    assert.equal(
      pdfString.slice(offset, offset + expectedStart.length),
      expectedStart,
      `offset do objeto ${objectNumber} deve apontar pro início dele`,
    );
    objectNumber += 1;
  }
}

test("buildPdfBytes: sem shape retorna null", () => {
  assert.equal(buildPdfBytes(null, "pergunta"), null);
});

test("buildPdfBytes: shape válido gera bytes de PDF bem formado", () => {
  const shape = {
    kind: "resumo",
    rows: [
      { label: "ENCERRADA", value: 9, percent: 60 },
      { label: "CANCELADO", value: 6, percent: 40 },
    ],
  };

  const bytes = buildPdfBytes(shape, "Resumo por status");
  assert.ok(bytes instanceof Uint8Array);

  const asString = Buffer.from(bytes).toString("latin1");
  assert.ok(asString.startsWith("%PDF-1.4\n"));
  assert.ok(asString.endsWith("%%EOF"));
  xrefOffsetsAreValid(asString);
});

test("buildPdfDocument: uma única página quando as linhas cabem", () => {
  const pdf = buildPdfDocument({
    title: "Teste",
    subtitle: "subtítulo",
    headers: ["Categoria", "Quantidade"],
    rows: [["ENCERRADA", 9], ["CANCELADO", 6]],
  });

  const countMatch = pdf.match(/\/Count (\d+)/);
  assert.equal(countMatch[1], "1");
  xrefOffsetsAreValid(pdf);
});

test("buildPdfDocument: pagina quando excede o limite por página", () => {
  const rows = Array.from({ length: 95 }, (_, i) => [`Ticket ${i}`, i]);

  const pdf = buildPdfDocument({
    title: "Teste",
    subtitle: "",
    headers: ["Categoria", "Quantidade"],
    rows,
  });

  const countMatch = pdf.match(/\/Count (\d+)/);
  assert.equal(countMatch[1], "3");
  xrefOffsetsAreValid(pdf);
});

test("buildPdfDocument: textos com parênteses/barras não corrompem a estrutura", () => {
  const pdf = buildPdfDocument({
    title: "Relatório (teste)",
    subtitle: "Pergunta com \\ e (parênteses) e acentos: ção, ã, ê",
    headers: ["Categoria", "Quantidade"],
    rows: [["Suporte (TI)", 1], ["C:\\pasta", 2]],
  });

  xrefOffsetsAreValid(pdf);
  assert.ok(pdf.includes("\\(teste\\)"));
  assert.ok(pdf.includes("C:\\\\pasta"));
});

test("computeColumnWidths: sem precisar encolher, usa a largura desejada", () => {
  const widths = computeColumnWidths(
    ["Categoria", "Quantidade"],
    [["ENCERRADA", 9]],
    200,
  );

  assert.deepEqual(widths, [11, 12]);
});

test("computeColumnWidths: encolhe proporcionalmente quando excede o orçamento", () => {
  const widths = computeColumnWidths(
    ["Categoria", "Quantidade"],
    [["ENCERRADA", 9]],
    10,
  );

  const total = widths.reduce((sum, w) => sum + w, 0);
  assert.ok(total <= 10 || widths.every((w) => w === 6));
  assert.ok(widths.every((w) => w >= 6));
});

test("pdfStringToBytes: cada caractere vira um byte 0-255", () => {
  const bytes = pdfStringToBytes("AB\u00e7");
  assert.deepEqual(Array.from(bytes), [65, 66, 0xe7]);
});
