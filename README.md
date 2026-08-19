# MCP + Ollama — consulta em linguagem natural a um banco Postgres

Servidor MCP (Model Context Protocol) somente-leitura + backend agente local que
traduz perguntas em português para consultas SQL seguras, usando um LLM local
(Ollama) para decidir qual "tool" chamar. Os dados de exemplo são fictícios:
ordens de serviço e clientes.

## Como funciona

```text
Usuário (interface web)
  ↓ pergunta em português
Backend agente (agent/server.js)
  ↓ roteamento determinístico (regex) OU decisão do LLM
Ollama (function calling, modelo qwen2.5:3b)
  ↓ escolhe uma tool + argumentos
Cliente MCP (agent/mcp-client.js)
  ↓ JSON-RPC via STDIO
Servidor MCP (src/server.js)
  ↓ SQL parametrizado, usuário somente-leitura
PostgreSQL
```

Pontos de segurança que valem destacar:

- O servidor MCP só executa `SELECT`s parametrizados; o Postgres conecta com um
  usuário dedicado (`mcp_reader`) que só tem `GRANT SELECT`, roda em transação
  somente-leitura (`default_transaction_read_only`) e tem `statement_timeout`
  curto.
- Antes de chamar o LLM, o backend já bloqueia perguntas que pedem escrita
  (`agent/write-policy.js`) — não depende do modelo se comportar bem.
- Sempre que a pergunta bate com um padrão conhecido (`agent/os-routing.js`,
  `agent/client-routing.js`), a tool e os argumentos são escolhidos por regra,
  não pelo LLM — mais previsível e mais barato. O LLM só decide livremente
  quando a pergunta é ambígua.

## Requisitos

- Node.js 20+
- npm
- Docker e Docker Compose
- [Ollama](https://ollama.com) instalado localmente, com o modelo `qwen2.5:3b`

## Passo a passo para rodar do zero

### 1. Clonar e instalar dependências

```bash
git clone https://github.com/leomc06/mcp-teste-llm2.git
cd mcp-teste-llm2
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` e troque os valores marcados como `troque` (usuário, senha e nome
do banco Postgres, e a senha do usuário somente-leitura `mcp_reader`). O
`.env` nunca é versionado — confira que ele não aparece em `git status`.

### 3. Subir o PostgreSQL

```bash
docker compose up -d
```

Isso cria o container `mcp-teste-llm` e roda automaticamente, na primeira
subida do volume, o script `db/init.sh` — que cria as tabelas, os dados de
exemplo e o usuário `mcp_reader`. As migrations ficam em `db/migrations/` e
são aplicadas em ordem (`001`, `002`, `003`, ...) via `\ir` dentro do
`init.sh`.

> Se o container já existir de uma execução anterior e você adicionar uma
> migration nova, o `init.sh` **não** roda de novo sozinho (o volume já tem
> dados). Aplique a migration manualmente:
> ```bash
> docker compose exec -T postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB> -f - < db/migrations/00X_nome.sql
> ```

### 4. Preparar o Ollama

```bash
sudo systemctl start ollama
ollama pull qwen2.5:3b
```

### 5. Rodar os testes (opcional, mas recomendado)

```bash
npm test
```

Roda `node --check` em todos os arquivos e a suíte `node --test` (só lógica
de roteamento e formatação, não precisa do Postgres nem do Ollama de pé).

### 6. Iniciar o backend agente

```bash
npm run start:agent
```

O backend sobe o servidor MCP automaticamente (via STDIO), conecta no
Postgres e serve a interface web. Acesse:

```text
http://127.0.0.1:3100
```

Faça perguntas como:

- "Quais OS estão atrasadas?"
- "Liste as OS do responsável Carlos."
- "Quantas OS o cliente Bruno Santos já resolveu?"
- "Quais clientes estão inativos?"

### 7. Encerrar

No terminal do backend, `Ctrl+C` (isso também encerra o servidor MCP filho).

```bash
sudo systemctl stop ollama
docker compose stop   # para o Postgres sem apagar dados/volumes
```

## Estrutura do projeto

```text
src/server.js            servidor MCP: define as tools e faz as queries SQL
agent/server.js          backend HTTP: recebe a pergunta, orquestra tudo
agent/os-routing.js      roteamento por regex das perguntas sobre OS
agent/client-routing.js  roteamento por regex das perguntas sobre clientes
agent/tool-selector.js   junta as duas rotas e decide quais tools expor ao LLM
agent/agent-loop.js      loop de function calling com o Ollama
agent/mcp-client.js      cliente MCP + allowlist de tools permitidas
agent/write-policy.js    bloqueio de perguntas que pedem escrita
agent/response-formatter.js  formata o resultado das tools em texto
db/init.sh               script de inicialização do Postgres (roles, grants)
db/migrations/           migrations SQL, aplicadas em ordem
web/                      interface web estática
test/                     testes (node --test)
integration-agent.mjs     teste de integração ponta a ponta (precisa da stack de pé)
```

## Rodando testes de integração

Com o backend (`npm run start:agent`) e o Ollama já de pé em outro terminal:

```bash
npm run test:integration
```

## Tools disponíveis

O servidor MCP expõe tools de consulta sobre **ordens de serviço** (buscar por
número, listar abertas/atrasadas/recentes, filtrar por status, prioridade,
responsável, solicitante ou cliente, histórico, resumos e tempo médio de
resolução) e sobre **clientes** (listar, listar inativos/recentes, buscar por
id/e-mail/nome, domínios de e-mail, resumos). A lista completa e atualizada
das tools liberadas para o agente está em `allowedToolNames`, no início de
`agent/mcp-client.js`.
