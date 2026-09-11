import assert from "node:assert/strict";
import test from "node:test";

import { createRateLimiter } from "../agent/rate-limiter.js";

test("permite até maxRequests dentro da janela, depois bloqueia", () => {
  const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 3 });
  const now = 1000000;

  assert.equal(limiter.check("1.2.3.4", now).allowed, true);
  assert.equal(limiter.check("1.2.3.4", now + 10).allowed, true);
  assert.equal(limiter.check("1.2.3.4", now + 20).allowed, true);

  const quarta = limiter.check("1.2.3.4", now + 30);
  assert.equal(quarta.allowed, false);
  assert.ok(quarta.retryAfterMs > 0);
});

test("chaves diferentes têm contadores independentes", () => {
  const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 });
  const now = 1000000;

  assert.equal(limiter.check("1.1.1.1", now).allowed, true);
  assert.equal(limiter.check("2.2.2.2", now).allowed, true);
  assert.equal(limiter.check("1.1.1.1", now + 1).allowed, false);
});

test("libera de novo depois que a janela passa (sliding window)", () => {
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 2 });
  const now = 1000000;

  assert.equal(limiter.check("x", now).allowed, true);
  assert.equal(limiter.check("x", now + 100).allowed, true);
  assert.equal(limiter.check("x", now + 200).allowed, false);

  // depois que a janela do primeiro hit expira, ele "some" da contagem
  assert.equal(limiter.check("x", now + 1100).allowed, true);
});

test("retryAfterMs reflete quando a janela abre de novo", () => {
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 1 });
  const now = 1000000;

  limiter.check("x", now);
  const bloqueado = limiter.check("x", now + 300);

  assert.equal(bloqueado.retryAfterMs, 700);
});

test("prune() remove chaves totalmente ociosas sem afetar chaves ainda ativas", () => {
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 5 });
  const now = 1000000;

  limiter.check("ociosa", now);
  limiter.check("ativa", now + 2000);

  limiter.prune(now + 2000);

  // "ociosa" foi podada (janela expirou) → volta a ter cota cheia
  assert.equal(limiter.check("ociosa", now + 2001).allowed, true);
  // "ativa" continua com seu hit contando normalmente
  const segundaAtiva = limiter.check("ativa", now + 2002);
  assert.equal(segundaAtiva.allowed, true);
});
