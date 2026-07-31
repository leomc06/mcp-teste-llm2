# MCP Ollama

## Arquitetura

```text
Usuário
  ↓
Interface web
  ↓
Backend agente
  ↓
Ollama
  ↓
Cliente MCP
  ↓
Servidor MCP
  ↓
PostgreSQL
```

1. O usuário envia uma pergunta pela interface.
2. O backend valida a pergunta.
3. O Ollama escolhe uma tool.
4. O cliente MCP chama o servidor MCP.
5. O servidor consulta o PostgreSQL.
6. O backend formata o resultado.
7. A interface apresenta a resposta.

## Como executar

Requisitos:

- Node.js 20 ou superior;
- npm;
- Docker e Docker Compose;
- Ollama;
- modelo `qwen2.5:3b` no Ollama.

Na raiz do projeto, crie e configure o arquivo de ambiente:

```bash
cp .env.example .env
nano .env
```

Instale as dependências:

```bash
npm install
```

Inicie o PostgreSQL:

```bash
docker compose up -d
```

Inicie o Ollama e baixe o modelo, caso ainda não esteja instalado localmente:

```bash
sudo systemctl start ollama
ollama pull qwen2.5:3b
```

Inicie o backend agente:

```bash
npm run start:agent
```

O backend inicia o MCP Server automaticamente por STDIO e também disponibiliza a interface web. Acesse:

```text
http://127.0.0.1:3100
```

## Como encerrar

No terminal do backend, pressione:

```text
Ctrl+C
```

Isso também encerra o MCP Server iniciado pelo backend.

Pare o Ollama:

```bash
sudo systemctl stop ollama
```

Pare o PostgreSQL sem excluir dados ou volumes:

```bash
docker compose stop
```
