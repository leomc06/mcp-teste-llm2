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
  → agent/mcp-client.js (stdio) → src/server.js (servidor MCP, 24 tools)
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
| `AGENT_HOST` | `127.0.0.1` | Endereço em que o backend escuta. **Não mude pra `0.0.0.0`/rede sem colocar autenticação e HTTPS na frente** — ver "Limitações conhecidas" abaixo. |
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

### 5. Encerrar

No terminal do backend, `Ctrl+C` (isso também encerra o servidor MCP filho).

```bash
sudo systemctl stop ollama
```

## Rodando os testes (opcional)

```bash
npm test
```

Roda `node --check` em todos os arquivos e a suíte `node --test` (roteamento,
formatação, cliente da API de tickets, cliente do Ollama, whitelist do
cliente MCP, rate limiter e sanitização — tudo com mocks, não precisa da API
de tickets real nem do Ollama de pé).

O que a suíte **não** cobre: as 24 tools MCP em si (`src/server.js`) e a
camada HTTP do backend (`agent/server.js`) de ponta a ponta — isso só é
exercitado pelo teste de integração abaixo, contra a stack real.

Com o backend e o Ollama já de pé em outro terminal, dá pra rodar também o
teste de integração ponta a ponta (usa a API de tickets real configurada no
`.env`):

```bash
node --env-file=.env integration-agent.mjs        # todos os casos
node --env-file=.env integration-agent.mjs 1       # só o caso 1
```

## Limitações conhecidas

- **Sem autenticação real.** O header `X-User-Id` é só um rótulo de
  auditoria (qualquer valor passa, não é validado contra identidade
  nenhuma) — quem tiver acesso de rede ao backend tem acesso de leitura a
  todos os tickets. Isso é aceitável rodando só em `127.0.0.1`/rede
  interna confiável; **não exponha `AGENT_HOST` numa rede não confiável sem
  colocar autenticação e HTTPS na frente** (reverse proxy, por exemplo).
  Rate limiting por IP existe (`AGENT_RATE_LIMIT_*`), mas não substitui
  controle de acesso.
- **Truncamento em consultas muito amplas.** Buscas sem filtro suficiente
  (ex.: período antigo sem área/departamento) só varrem os ~1000 tickets
  mais recentes antes de desistir — a resposta avisa quando isso acontece
  ("resultado parcial"), mas o número pode não ser o total exato.
- **Só uma tool por pergunta.** Perguntas que exigem comparar duas
  entidades numa única resposta (ex.: "compare a carga do Fábio com a do
  Cesar") não são suportadas automaticamente — faça duas perguntas
  separadas.
- **Prioridade e cliente/solicitante não são filtráveis no servidor da API
  de tickets** — só status, área, departamento e operador são. Isso afeta
  o desempenho e a exatidão de consultas amplas por esses dois campos.
