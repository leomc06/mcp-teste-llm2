// Limitador de taxa simples em memória (janela deslizante por chave), pra
// impedir que um único IP martele o endpoint indefinidamente — distinto do
// controle de concorrência (AGENT_MAX_CONCURRENT_REQUESTS), que só limita
// quantas requisições estão em andamento AO MESMO TEMPO, não quantas por
// minuto. Limitação conhecida: é em memória (zera ao reiniciar o processo,
// não funciona se o backend rodar em mais de uma instância) — suficiente
// pro deployment atual (processo único), não substitui um rate limiter
// distribuído (Redis, etc.) se isso vier a rodar em múltiplas réplicas.
export function createRateLimiter({ windowMs, maxRequests }) {
  const hitsByKey = new Map();

  return {
    check(key, now = Date.now()) {
      const timestamps = (hitsByKey.get(key) ?? []).filter(
        (timestamp) => now - timestamp < windowMs,
      );

      if (timestamps.length >= maxRequests) {
        hitsByKey.set(key, timestamps);

        return {
          allowed: false,
          retryAfterMs: windowMs - (now - timestamps[0]),
        };
      }

      timestamps.push(now);
      hitsByKey.set(key, timestamps);

      return { allowed: true };
    },

    // Evita crescimento indefinido do Map com chaves que pararam de mandar
    // requisição — chamar periodicamente (não é crítico: cada `check()` já
    // poda a própria chave lida, isso só limpa chaves totalmente ociosas).
    prune(now = Date.now()) {
      for (const [key, timestamps] of hitsByKey.entries()) {
        const vivos = timestamps.filter((timestamp) => now - timestamp < windowMs);

        if (vivos.length === 0) {
          hitsByKey.delete(key);
        } else {
          hitsByKey.set(key, vivos);
        }
      }
    },
  };
}
