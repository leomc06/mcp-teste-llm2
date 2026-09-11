# Imagem única pro backend (agent/server.js) + servidor MCP (src/server.js,
# spawnado como processo filho via stdio pelo próprio backend — por isso
# ambos vivem na mesma imagem, não em containers separados).
FROM node:20-slim

WORKDIR /app

# Copia primeiro só os manifests pra cachear a camada de `npm install`
# (só reinstala se package.json/package-lock.json mudarem).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

# .env NÃO é copiado pra imagem (está no .dockerignore) — as credenciais da
# API de tickets são injetadas em runtime, via `docker run --env-file` ou
# `env_file:`/`environment:` no docker-compose. Ver README (seção Docker).
ENV AGENT_HOST=0.0.0.0

EXPOSE 3100

CMD ["./run-agent.sh"]
