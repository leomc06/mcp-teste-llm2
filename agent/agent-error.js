// Módulo dedicado (em vez de viver em agent-loop.js, onde estava antes) pra
// response-formatter.js poder lançar AgentError também (achado P14 da
// auditoria end-to-end) sem criar import circular — agent-loop.js importa
// de response-formatter.js, então response-formatter.js importar AgentError
// de volta de agent-loop.js criaria um ciclo.
export class AgentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AgentError";
    this.code = code;
  }
}
