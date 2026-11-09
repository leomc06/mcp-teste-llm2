# MCP + Claude — consulta em linguagem natural a tickets

Sistema **somente leitura**: nenhuma tool disponível cria, edita, fecha ou
cancela tickets — só consulta. Qualquer pedido de escrita em linguagem
natural é recusado antes mesmo de chegar ao modelo (`agent/write-policy.js`).

## Arquitetura (visão rápida)

```
Usuário → web/ (frontend estático)
  → agent/server.js (HTTP, sem framework)
      → agent/tickets-routing.js: só o pré-filtro de esclarecimento
        (ambiguidade/contradição óbvia), determinístico e sem custo,
        ANTES de qualquer chamada à API paga
  → agent/llm-router.js: o Claude (API da Anthropic) decide a tool e os
    argumentos a partir da pergunta em linguagem livre (tool-calling de
    verdade, não regex) — e também sintetiza prosa sobre o resultado já
    obtido (resumo_ticket/resumo_executivo), nunca decide o quê buscar
  → agent/mcp-client.js (stdio) → src/server.js (servidor MCP, 27 tools)
  → src/tickets-api.js (cliente HTTP da API de tickets)
  → agent/response-formatter.js monta a resposta final em texto
```

## Requisitos

- Node.js 20+
- npm
- Uma API key da Anthropic (console.anthropic.com) — cobrança por token, ver
  `ANTHROPIC_API_KEY` abaixo
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
`TICKETS_API_LOGIN`, `TICKETS_API_APP` e `ANTHROPIC_API_KEY` com os valores
reais. O `.env` nunca é versionado — confira que ele não aparece em
`git status`.

Todas as demais variáveis do `.env.example` são opcionais (já têm um
default sensato) — a tabela abaixo documenta cada uma:

| Variável | Default | Para que serve |
|---|---|---|
| `AGENT_HOST` | `127.0.0.1` | Endereço em que o backend escuta. **Não mude pra `0.0.0.0`/rede sem colocar autenticação e HTTPS na frente** — o header `X-User-Id` é só um rótulo de auditoria, não autenticação real (qualquer valor passa). |
| `AGENT_PORT` | `3100` | Porta do backend. |
| `AGENT_REQUEST_TIMEOUT_MS` | — | Timeout máximo por requisição ao endpoint de consulta. |
| `AGENT_MAX_CONCURRENT_REQUESTS` | — | Quantas consultas podem processar ao mesmo tempo (global, não por usuário). Acima disso, `429 agente_ocupado`. |
| `AGENT_RATE_LIMIT_WINDOW_MS` | `60000` | Janela do limite de requisições por IP. |
| `AGENT_RATE_LIMIT_MAX_REQUESTS` | `30` | Quantas requisições um mesmo IP pode fazer dentro da janela acima antes de `429 limite_de_requisicoes`. |
| `ANTHROPIC_API_KEY` | — | Key da API da Anthropic (obrigatória, sem default — o servidor recusa subir sem ela). Nunca commitar a key de verdade. |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | Modelo usado pra interpretar a pergunta e sintetizar resumos. |
| `ANTHROPIC_TIMEOUT_MS` | `20000` | Timeout de chamada à API da Anthropic. |
| `TICKETS_API_BASE_URL` / `TOKEN` / `LOGIN` / `APP` | — | Credenciais da API de tickets (obrigatórias, sem default). |
| `TICKETS_API_TIMEOUT_MS` | `10000` | Timeout por requisição à API de tickets. |
| `TICKETS_API_METADATA_CACHE_TTL_MS` | `300000` | TTL do cache em memória dos catálogos (status/área/prioridade/canal/departamento/operador) — eles mudam raramente, então repetir a busca a cada pergunta é desperdício. |
| `TICKETS_API_FAN_OUT_CONCURRENCY` | `8` | Teto de chamadas concorrentes nas tools de resumo que contam 1 item de catálogo por vez (ex.: "resumo por operador"). |
| `TICKETS_API_SLA_CHECK_LIMIT` | `1000` | Acima de quantos candidatos `listar_tickets_vencidos` recusa a rajada de checagem de SLA (1 chamada por ticket) e pede pra restringir o filtro. |

### 3. Iniciar o backend agente

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

### 4. Encerrar

No terminal do backend, `Ctrl+C` (isso também encerra o servidor MCP filho).

## Rodando via Docker (alternativa ao passo a passo acima)

```bash
cp .env.example .env   # preencha TICKETS_API_* e ANTHROPIC_API_KEY como no passo 2 acima
docker compose up -d
```

Acesse `http://127.0.0.1:3100`, igual ao modo local. O `docker-compose.yml`
sobe 1 serviço: `agent` (backend + servidor MCP, builda a partir do
`Dockerfile` deste repo).

Detalhes que importam se for mexer nisso:
- `.env` **não é copiado pra imagem** (está no `.dockerignore`) — é
  injetado em runtime via `env_file:` no compose. Nunca rebuilde a imagem
  com credenciais dentro dela.
- `AGENT_HOST` do seu `.env` local é sobrescrito explicitamente no
  `docker-compose.yml` (precisa escutar em `0.0.0.0` pra a porta publicada
  funcionar) — se você adicionar novas variáveis de ambiente no futuro,
  cheque se alguma delas também precisa desse tipo de override pra container.
- `run-agent.sh`/`run-mcp.sh` só fazem `source .env` se o arquivo existir
  fisicamente — em container, sem esse arquivo, contam com as variáveis já
  injetadas pelo `docker run --env-file`/`env_file:` do compose.

## Rodando os testes (opcional)

```bash
npm test
```

Roda `node --check` em todos os arquivos e a suíte `node --test` (roteamento,
formatação, cliente da API de tickets, cliente da Anthropic, whitelist do
cliente MCP, rate limiter e sanitização — tudo com mocks, não precisa da API
de tickets real nem da API da Anthropic de pé).

O que a suíte **não** cobre: as 27 tools MCP em si (`src/server.js`) e a
camada HTTP do backend (`agent/server.js`) de ponta a ponta — isso só é
exercitado pelo teste de integração abaixo, contra a stack real.

Com o backend já de pé em outro terminal, dá pra rodar também o
teste de integração ponta a ponta (usa a API de tickets real configurada no
`.env`):

```bash
node --env-file=.env integration-agent.mjs        # todos os casos
node --env-file=.env integration-agent.mjs 1       # só o caso 1
```
