import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsv, escapeCsvField } from "../web/shapes.js";

test("escapeCsvField: valor normal não é alterado", () => {
  assert.equal(escapeCsvField("ENCERRADA"), "ENCERRADA");
  assert.equal(escapeCsvField(9), "9");
});

test("escapeCsvField: campo com vírgula é envolvido em aspas", () => {
  assert.equal(escapeCsvField("Suporte, TI"), '"Suporte, TI"');
});

test("escapeCsvField: campo com aspas duplica as aspas internas", () => {
  assert.equal(escapeCsvField('Ticket "urgente"'), '"Ticket ""urgente"""');
});

test("escapeCsvField: undefined/null vira campo vazio", () => {
  assert.equal(escapeCsvField(undefined), "");
  assert.equal(escapeCsvField(null), "");
});

test("buildCsv: forma 'resumo' gera cabeçalho com percentual", () => {
  const csv = buildCsv({
    kind: "resumo",
    rows: [
      { label: "ENCERRADA", value: 9, percent: 60 },
      { label: "CANCELADO", value: 6, percent: 40 },
    ],
  });

  assert.equal(
    csv,
    "Categoria,Quantidade,Percentual\r\nENCERRADA,9,60%\r\nCANCELADO,6,40%",
  );
});

test("buildCsv: forma sem shape retorna string vazia", () => {
  assert.equal(buildCsv(null), "");
});

test("buildCsv: forma 'operacional' sem rows ainda exporta só o cabeçalho", () => {
  const csv = buildCsv({ kind: "operacional", rows: [] });

  assert.equal(csv, "Categoria,Quantidade");
});
