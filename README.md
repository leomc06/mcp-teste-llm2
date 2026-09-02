# MCP + Ollama — consulta em linguagem natural a tickets

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

Roda `node --check` em todos os arquivos e a suíte `node --test` (só lógica
de roteamento e formatação, não precisa da API de tickets nem do Ollama de
pé).

Com o backend e o Ollama já de pé em outro terminal, dá pra rodar também o
teste de integração ponta a ponta:

```bash
npm run test:integration
```
