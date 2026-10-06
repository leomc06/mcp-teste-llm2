import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMarkdownSubset,
  tokenizeInline,
} from "../web/markdown-subset.js";

test("parseMarkdownSubset: parágrafo simples", () => {
  const blocks = parseMarkdownSubset("Total de tickets: 15");

  assert.deepEqual(blocks, [
    { type: "p", lines: ["Total de tickets: 15"] },
  ]);
});

test("parseMarkdownSubset: lista de marcadores", () => {
  const blocks = parseMarkdownSubset(
    "Resumo:\n- ENCERRADA: 9 (60%)\n- CANCELADO: 6 (40%)",
  );

  assert.deepEqual(blocks, [
    { type: "p", lines: ["Resumo:"] },
    { type: "ul", items: ["ENCERRADA: 9 (60%)", "CANCELADO: 6 (40%)"] },
  ]);
});

test("parseMarkdownSubset: tabela em pipe, descarta linha separadora", () => {
  const blocks = parseMarkdownSubset(
    "| Categoria | Quantidade |\n| --- | --- |\n| Abertos | 6 |",
  );

  assert.deepEqual(blocks, [
    {
      type: "table",
      rows: [
        ["Categoria", "Quantidade"],
        ["Abertos", "6"],
      ],
    },
  ]);
});

test("parseMarkdownSubset: parágrafo multi-linha preserva as linhas", () => {
  const blocks = parseMarkdownSubset("Linha 1\nLinha 2");

  assert.deepEqual(blocks, [
    { type: "p", lines: ["Linha 1", "Linha 2"] },
  ]);
});

test("parseMarkdownSubset: linhas em branco separam blocos", () => {
  const blocks = parseMarkdownSubset("Parágrafo 1\n\nParágrafo 2");

  assert.deepEqual(blocks, [
    { type: "p", lines: ["Parágrafo 1"] },
    { type: "p", lines: ["Parágrafo 2"] },
  ]);
});

test("parseMarkdownSubset: texto vazio não quebra", () => {
  assert.deepEqual(parseMarkdownSubset(""), []);
  assert.deepEqual(parseMarkdownSubset(undefined), []);
});

test("tokenizeInline: negrito isolado", () => {
  assert.deepEqual(tokenizeInline("**Resumo automático**: texto"), [
    { bold: true, text: "Resumo automático" },
    { bold: false, text: ": texto" },
  ]);
});

test("tokenizeInline: sem negrito retorna um único segmento", () => {
  assert.deepEqual(tokenizeInline("ENCERRADA: 9 (60%)"), [
    { bold: false, text: "ENCERRADA: 9 (60%)" },
  ]);
});

test("tokenizeInline: texto vazio não quebra", () => {
  assert.deepEqual(tokenizeInline(""), []);
});
