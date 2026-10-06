import { test } from "node:test";
import assert from "node:assert/strict";
import { detectsContinuation, mergeContinuation } from "../agent/continuation.js";

test("detectsContinuation: reconhece os marcadores de alta confiança no início da frase", () => {
  assert.equal(detectsContinuation("e desses, só os urgentes?"), true);
  assert.equal(detectsContinuation("Desses, quantos estão fechados?"), true);
  assert.equal(detectsContinuation("e os abertos?"), true);
  assert.equal(detectsContinuation("só os abertos"), true);
  assert.equal(detectsContinuation("apenas os urgentes"), true);
  assert.equal(detectsContinuation("e quanto aos fechados?"), true);
  assert.equal(detectsContinuation("E DESSES quantos estão abertos?"), true);
});

test("detectsContinuation: acento/caixa não importam (normalizeText)", () => {
  assert.equal(detectsContinuation("SÓ OS URGENTES"), true);
  assert.equal(detectsContinuation("E QUANTO AOS CANCELADOS"), true);
});

test("detectsContinuation: marcador no meio da frase não conta (só no início)", () => {
  assert.equal(detectsContinuation("quantos tickets tem? e desses quantos fechados"), false);
});

test("detectsContinuation: frase sem marcador retorna false", () => {
  assert.equal(detectsContinuation("Quantos tickets estão abertos na área Suporte?"), false);
  assert.equal(detectsContinuation(""), false);
});

test("mergeContinuation: concatena com um espaço, aparando as pontas", () => {
  assert.equal(
    mergeContinuation("Resumo por status na área Suporte.  ", "  e desses só os abertos"),
    "Resumo por status na área Suporte. e desses só os abertos",
  );
});
