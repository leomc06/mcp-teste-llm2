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

// F4 (auditoria de robustez): faltava a forma feminina ("e AS"/"só AS"),
// "agora"/"agora só" e "quantas são?" como marcadores de alta confiança.
test("detectsContinuation: novos marcadores (forma feminina, 'agora', 'quantas são')", () => {
  assert.equal(detectsContinuation("e as urgentes?"), true);
  assert.equal(detectsContinuation("só as de Infraestrutura"), true);
  assert.equal(detectsContinuation("apenas as fechadas"), true);
  assert.equal(detectsContinuation("Agora somente as de Infraestrutura."), true);
  assert.equal(detectsContinuation("Agora faça um gráfico."), true);
  assert.equal(detectsContinuation("Quantas são?"), true);
  assert.equal(detectsContinuation("Quantos é?"), true);
});

// Achado na auditoria: um pedido de formato "solto" (sem nenhuma palavra do
// domínio de tickets) não tinha como ser roteado standalone — falhava o
// portão de domínio e devolvia "não entendi", mesmo havendo uma pergunta
// anterior pra mesclar. Reusa o mesmo vocabulário de tabela/gráfico do
// roteador (isBareFormatoRequest), não duplica numa 3ª lista.
test("detectsContinuation: pedido de formato solto (sem palavra do domínio) conta como continuação", () => {
  assert.equal(detectsContinuation("Faça um gráfico."), true);
  assert.equal(detectsContinuation("Coloque isso em uma tabela."), true);
  assert.equal(detectsContinuation("Mostre isso graficamente."), true);
  // Com palavra do domínio ("tickets"), não é mais um pedido "solto" — seria
  // avaliado como pergunta nova de verdade, não precisa de continuação.
  assert.equal(detectsContinuation("Mostre os tickets abertos em uma tabela."), false);
});

test("mergeContinuation: concatena com um espaço, aparando as pontas", () => {
  assert.equal(
    mergeContinuation("Resumo por status na área Suporte.  ", "  e desses só os abertos"),
    "Resumo por status na área Suporte. e desses só os abertos",
  );
});
