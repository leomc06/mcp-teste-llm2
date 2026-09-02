# MCP + Ollama — consulta em linguagem natural a tickets

Servidor MCP (Model Context Protocol) somente-leitura + backend agente local que
traduz perguntas em português para chamadas à API interna de tickets
(chamados), usando um LLM local (Ollama) para decidir qual "tool" chamar.

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
  ↓ HTTP (headers token/login/app)
API de tickets do sistema interno
```

Pontos de segurança que valem destacar:

- O servidor MCP só expõe tools de **leitura** sobre tickets; não há tools de
  criar, atualizar, mudar status ou comentar.
- Antes de chamar o LLM, o backend já bloqueia perguntas que pedem escrita
  (`agent/write-policy.js`) — não depende do modelo se comportar bem.
- Sempre que a pergunta bate com um padrão conhecido
  (`agent/tickets-routing.js`), a tool e os argumentos são escolhidos por
  regra, não pelo LLM — mais previsível e mais barato. O LLM só decide
  livremente quando a pergunta é ambígua.

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

### 3. Preparar o Ollama

```bash
sudo systemctl start ollama
ollama pull qwen2.5:3b
```

### 4. Rodar os testes (opcional, mas recomendado)

```bash
npm test
```

Roda `node --check` em todos os arquivos e a suíte `node --test` (só lógica
de roteamento e formatação, não precisa da API de tickets nem do Ollama de
pé).

### 5. Iniciar o backend agente

```bash
npm run start:agent
```

O backend sobe o servidor MCP automaticamente (via STDIO) e serve a
interface web. Acesse:

```text
http://127.0.0.1:3100
```

Faça perguntas como:

- "Busque o ticket 4830."
- "Liste os tickets da área de Redes."
- "Resumo dos tickets por status."
- "Quais tickets estão congelados?"
- "Quais áreas de ticket existem?"

### 6. Encerrar

No terminal do backend, `Ctrl+C` (isso também encerra o servidor MCP filho).

```bash
sudo systemctl stop ollama
```

## Estrutura do projeto

```text
src/server.js             servidor MCP: define as tools e chama a API de tickets
src/tickets-api.js         cliente HTTP da API de tickets
agent/server.js            backend HTTP: recebe a pergunta, orquestra tudo
agent/tickets-routing.js   roteamento por regex das perguntas sobre tickets
agent/routing-utils.js     utilitários genéricos de texto reusados pelo roteamento
agent/tool-selector.js     decide qual tool expor ao LLM a partir da rota
agent/agent-loop.js        loop de function calling com o Ollama
agent/mcp-client.js        cliente MCP + allowlist de tools permitidas
agent/write-policy.js      bloqueio de perguntas que pedem escrita
agent/response-formatter.js  formata o resultado das tools em texto
web/                       interface web estática
test/                      testes (node --test)
integration-agent.mjs      teste de integração ponta a ponta (precisa da stack de pé)
```

## Rodando testes de integração

Com o backend (`npm run start:agent`) e o Ollama já de pé em outro terminal:

```bash
npm run test:integration
```

## Tools disponíveis

O servidor MCP expõe 20 tools de consulta sobre **tickets** (chamados): busca
por número (com comentários e anexos), listagem com filtros por
status/área/departamento/operador/cliente/prioridade/período (ISO ou por
extenso, com paginação), resumos por status/prioridade/área/operador/
departamento (com totais de abertos/fechados), tickets abertos, fechados,
sem operador atribuído, com SLA congelado, mais antigos ainda abertos, mais
recentes, e listagem das tabelas de apoio (áreas, prioridades, canais,
status, departamentos, usuários). A lista completa e atualizada das tools
liberadas para o agente está em `allowedToolNames`, no início de
`agent/mcp-client.js`, e a descrição de cada uma em `tools`, na raiz do
projeto.
