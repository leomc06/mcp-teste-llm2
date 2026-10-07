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

test("buildCsv: forma 'catalogo' exporta ID e Nome", () => {
  const csv = buildCsv({
    kind: "catalogo",
    rows: [
      { id: 10, name: "Suporte", active: true },
      { id: 7, name: "Redes e Segurança", active: true },
    ],
  });

  assert.equal(csv, "ID,Nome\r\n10,Suporte\r\n7,Redes e Segurança");
});

test("buildCsv: forma 'individual' (carga/atividade) usa o mesmo cabeçalho genérico de Categoria/Quantidade", () => {
  const csv = buildCsv({
    kind: "individual",
    nome: "Fabio Gali",
    rows: [
      { label: "Total", value: 10 },
      { label: "Abertos", value: 4 },
    ],
  });

  assert.equal(csv, "Categoria,Quantidade\r\nTotal,10\r\nAbertos,4");
});
