# MCP + Ollama — consulta em linguagem natural a tickets

Sistema **somente leitura**: nenhuma tool disponível cria, edita, fecha ou
cancela tickets — só consulta. Qualquer pedido de escrita em linguagem
natural é recusado antes mesmo de chegar ao modelo (`agent/write-policy.js`).

## Arquitetura (visão rápida)

```
Usuário → web/ (frontend estático)
  → agent/server.js (HTTP, sem framework)
      → agent/tickets-routing.js decide a tool E os parâmetros por regex,
        SEM depender do LLM pra isso (baixo risco de "alucinação de tool")
  → agent/agent-loop.js chama o Ollama só pra formalizar a chamada da tool
    já decidida (o Ollama não escolhe livremente qual tool usar)
  → agent/mcp-client.js (stdio) → src/server.js (servidor MCP, 27 tools)
  → src/tickets-api.js (cliente HTTP da API de tickets)
  → agent/response-formatter.js monta a resposta final em texto
```

## Requisitos

- Node.js 20+
- npm
- [Ollama](https://ollama.com) instalado localmente, com o modelo `qwen2.5:3b`
- Acesso à API interna de tickets (URL base, token, login e app já
  provisionados por quem administra o sistema)

## Passo a passo para rodar do zero

### 1. Clonar e instalar dependências

```bash
git clone https://github.com/leomc06/mcp-teste-llm2-tickets.git
cd mcp-teste-llm2-tickets
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` e preencha `TICKETS_API_BASE_URL`, `TICKETS_API_TOKEN`,
`TICKETS_API_LOGIN` e `TICKETS_API_APP` com os valores reais da API de
tickets. O `.env` nunca é versionado — confira que ele não aparece em
`git status`.

Todas as demais variáveis do `.env.example` são opcionais (já têm um
default sensato) — a tabela abaixo documenta cada uma:

| Variável | Default | Para que serve |
|---|---|---|
| `AGENT_HOST` | `127.0.0.1` | Endereço em que o backend escuta. **Não mude pra `0.0.0.0`/rede sem colocar autenticação e HTTPS na frente** — o header `X-User-Id` é só um rótulo de auditoria, não autenticação real (qualquer valor passa). |
| `AGENT_PORT` | `3100` | Porta do backend. |
| `AGENT_REQUEST_TIMEOUT_MS` | — | Timeout máximo por requisição ao endpoint de consulta. |
| `AGENT_MAX_TOOL_CALLS` | — | Máximo de chamadas de tool por pergunta. |
| `AGENT_MAX_CONCURRENT_REQUESTS` | — | Quantas consultas podem processar ao mesmo tempo (global, não por usuário). Acima disso, `429 agente_ocupado`. |
| `AGENT_RATE_LIMIT_WINDOW_MS` | `60000` | Janela do limite de requisições por IP. |
| `AGENT_RATE_LIMIT_MAX_REQUESTS` | `30` | Quantas requisições um mesmo IP pode fazer dentro da janela acima antes de `429 limite_de_requisicoes`. |
| `OLLAMA_BASE_URL` | — | URL do Ollama local. |
| `OLLAMA_MODEL` | — | Modelo usado (`qwen2.5:3b`). |
| `OLLAMA_NUM_THREAD` | — | Threads que o Ollama usa pra inferência. |
| `OLLAMA_TIMEOUT_MS` | — | Timeout de chamada ao Ollama. |
| `TICKETS_API_BASE_URL` / `TOKEN` / `LOGIN` / `APP` | — | Credenciais da API de tickets (obrigatórias, sem default). |
| `TICKETS_API_TIMEOUT_MS` | `10000` | Timeout por requisição à API de tickets. |
| `TICKETS_API_METADATA_CACHE_TTL_MS` | `300000` | TTL do cache em memória dos catálogos (status/área/prioridade/canal/departamento/operador) — eles mudam raramente, então repetir a busca a cada pergunta é desperdício. |
| `TICKETS_API_FAN_OUT_CONCURRENCY` | `8` | Teto de chamadas concorrentes nas tools de resumo que contam 1 item de catálogo por vez (ex.: "resumo por operador"). |
| `TICKETS_API_SLA_CHECK_LIMIT` | `1000` | Acima de quantos candidatos `listar_tickets_vencidos` recusa a rajada de checagem de SLA (1 chamada por ticket) e pede pra restringir o filtro. |

### 3. Preparar o Ollama

```bash
sudo systemctl start ollama
ollama pull qwen2.5:3b
```

### 4. Iniciar o backend agente

```bash
npm run start:agent
```

O backend sobe o servidor MCP automaticamente e serve a interface web.
Acesse:

```text
http://127.0.0.1:3100
```

Faça perguntas como:

- "Busque o ticket 4830."
- "Liste os tickets da área de Redes."
- "Resumo dos tickets por status."
- "Quais tickets estão congelados?"
- "Quais áreas de ticket existem?"
- "Compare a carga do Fábio Gali com a do Cesar Augusto de Mello."
- "Compare o ticket 100 com o ticket 200."

### 5. Encerrar

No terminal do backend, `Ctrl+C` (isso também encerra o servidor MCP filho).

```bash
sudo systemctl stop ollama
```

## Rodando via Docker (alternativa ao passo a passo acima)

```bash
cp .env.example .env   # preencha TICKETS_API_* como no passo 2 acima
docker compose up -d
docker compose exec ollama ollama pull qwen2.5:3b   # só na primeira vez
```

Acesse `http://127.0.0.1:3100`, igual ao modo local. O `docker-compose.yml`
sobe 2 serviços: `agent` (backend + servidor MCP, builda a partir do
`Dockerfile` deste repo) e `ollama` (imagem oficial `ollama/ollama`, modelo
persistido num volume nomeado — não precisa baixar de novo a cada
`docker compose up`).

Detalhes que importam se for mexer nisso:
- `.env` **não é copiado pra imagem** (está no `.dockerignore`) — é
  injetado em runtime via `env_file:` no compose. Nunca rebuilde a imagem
  com credenciais dentro dela.
- `OLLAMA_BASE_URL` e `AGENT_HOST` do seu `.env` local são sobrescritos
  explicitamente no `docker-compose.yml` (o serviço `agent` precisa
  alcançar `ollama` pelo nome do serviço, não por `127.0.0.1`, e precisa
  escutar em `0.0.0.0` pra a porta publicada funcionar) — se você adicionar
  novas variáveis de ambiente no futuro, cheque se alguma delas também
  precisa desse tipo de override pra container.
- `run-agent.sh`/`run-mcp.sh` só fazem `source .env` se o arquivo existir
  fisicamente — em container, sem esse arquivo, contam com as variáveis já
  injetadas pelo `docker run --env-file`/`env_file:` do compose.
- Rodar `docker compose down -v` remove também o volume do modelo do Ollama
  (vai precisar baixar de novo). `docker compose down` (sem `-v`) preserva.

## Rodando os testes (opcional)

```bash
npm test
```

Roda `node --check` em todos os arquivos e a suíte `node --test` (roteamento,
formatação, cliente da API de tickets, cliente do Ollama, whitelist do
cliente MCP, rate limiter e sanitização — tudo com mocks, não precisa da API
de tickets real nem do Ollama de pé).

O que a suíte **não** cobre: as 27 tools MCP em si (`src/server.js`) e a
camada HTTP do backend (`agent/server.js`) de ponta a ponta — isso só é
exercitado pelo teste de integração abaixo, contra a stack real.

Com o backend e o Ollama já de pé em outro terminal, dá pra rodar também o
teste de integração ponta a ponta (usa a API de tickets real configurada no
`.env`):

```bash
node --env-file=.env integration-agent.mjs        # todos os casos
node --env-file=.env integration-agent.mjs 1       # só o caso 1
```
