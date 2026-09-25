import assert from "node:assert/strict";
import test from "node:test";

import { formatToolResults, hasSummarizableTicketContent } from "../agent/response-formatter.js";
import { AgentError } from "../agent/agent-error.js";

function format(tool, dados) {
  return formatToolResults([{ tool, dados }]);
}

test("formata a lista de tickets, incluindo a data de abertura sem hora bruta", () => {
  const resposta = format("listar_tickets", {
    filtros: { status: undefined },
    total: 1,
    pagina: 1,
    paginas: 1,
    tickets: [
      {
        number: 1,
        opening_date: "2026-08-20 09:15:00",
        priority: "Alta",
        area: "DEFAULT",
        issue: "Rede",
        description: "Sem acesso à internet",
        operator: "admin",
        status: "Aguardando atendimento",
        is_frozen: false,
      },
    ],
  });

  assert.match(resposta, /Ticket 1: Rede/);
  assert.match(resposta, /aberto em: 20\/08\/2026 09:15/);
  assert.doesNotMatch(resposta, /2026-08-20 09:15:00/);
});

test("formata a lista de tickets incluindo o cliente (solicitante)", () => {
  const resposta = format("listar_tickets", {
    filtros: {},
    total: 1,
    pagina: 1,
    paginas: 1,
    tickets: [
      {
        number: 2,
        opening_date: "2026-08-20 09:15:00",
        priority: "Alta",
        area: "Suporte",
        issue: "Rede",
        contact_name: "Diego Mota",
        operator: "admin",
        status: "Aguardando atendimento",
        is_frozen: false,
      },
    ],
  });

  assert.match(resposta, /cliente: Diego Mota/);
});

test("deixa claro quando a lista exibida é menor que o total encontrado (ex.: 'primeiros N')", () => {
  const resposta = format("listar_tickets", {
    filtros: { area: "Suporte", limite: 5 },
    total: 4285,
    pagina: 1,
    paginas: 857,
    tickets: [
      {
        number: 1,
        opening_date: "2026-08-20 09:15:00",
        priority: "Baixa",
        area: "Suporte",
        issue: "Rede",
        operator: "admin",
        status: "Aguardando atendimento",
        is_frozen: false,
      },
    ],
  });

  assert.match(resposta, /Exibindo 1 de 4285 ticket\(s\) encontrado\(s\) \(página 1 de 857\):/);
});

test("avisa quando a lista de tickets foi truncada por volume", () => {
  const resposta = format("listar_tickets", {
    filtros: {},
    total: 1,
    pagina: 1,
    paginas: 1,
    truncado: true,
    tickets: [
      {
        number: 1,
        opening_date: "2026-08-20 09:15:00",
        priority: "Alta",
        area: "DEFAULT",
        issue: "Rede",
        operator: "admin",
        status: "Aguardando atendimento",
        is_frozen: false,
      },
    ],
  });

  assert.match(resposta, /resultado parcial: consulta truncada por volume de tickets/);
});

test("deixa claro quando a lista de tickets fechados exibida é menor que o total (limite aplicado)", () => {
  const resposta = format("listar_tickets_fechados", {
    quantidade: 960,
    truncado: false,
    tickets: [
      {
        number: 4848,
        opening_date: "2026-08-31 12:24:00",
        priority: "Baixa",
        area: "Redes e Segurança",
        issue: "DNS",
        operator: "Helpdesk",
        status: "ENCERRADA",
        is_frozen: true,
      },
    ],
  });

  assert.match(resposta, /Exibindo 1 de 960 ticket\(s\) fechado\(s\):/);
});

test("formata o detalhe do ticket com SLA e datas ISO em hora de Brasília", () => {
  const resposta = format("buscar_ticket_por_numero", {
    encontrado: true,
    ticket: {
      number: 1,
      opening_date: "2026-08-20 09:15:00",
      priority: "Alta",
      area: "DEFAULT",
      issue: "Rede",
      description: "Sem acesso à internet",
      operator: "admin",
      status: "Aguardando atendimento",
      treatment_date: "2026-08-27 16:10:52",
      closure_date: null,
      is_frozen: true,
      lifetime: {
        result_sla_response: 4,
        result_sla_solution: 1,
      },
      entries: [],
      files: [],
    },
  });

  assert.match(resposta, /Ticket 1: Rede/);
  assert.match(resposta, /Início do tratamento: 27\/08\/2026 16:10/);
  assert.match(resposta, /SLA de resposta: excedeu o SLA; SLA de solução: não definido/);
  assert.match(resposta, /SLA congelado: sim/);
  assert.doesNotMatch(resposta, /2026-08-27T16:10/);
});

test("formata os comentários (entries) do ticket, não só a contagem", () => {
  const resposta = format("buscar_ticket_por_numero", {
    encontrado: true,
    ticket: {
      number: 3289,
      opening_date: "2026-02-25 09:00:00",
      priority: "Baixa",
      area: "WEB",
      issue: "Portal",
      operator: "admin",
      status: "ENCERRADA",
      entries: [
        {
          entry: "Em atendimento",
          author: "Bruno de Souza Castro",
          date: "2026-02-25 09:18:13",
          type: 2,
        },
        {
          entry: "Arquivos identificados, renomeados e processamento seguindo sem conflito.",
          author: "Bruno de Souza Castro",
          date: "2026-02-25 09:31:43",
          type: 4,
        },
      ],
      files: [],
    },
  });

  assert.match(resposta, /Comentários \(2\):/);
  assert.match(resposta, /\[25\/02\/2026 09:18\] Bruno de Souza Castro: Em atendimento/);
  assert.match(resposta, /Arquivos identificados, renomeados e processamento seguindo sem conflito\./);
});

test("P12 da auditoria: HTML cru na descrição e nos comentários do detalhe do ticket é removido", () => {
  const resposta = format("buscar_ticket_por_numero", {
    encontrado: true,
    ticket: {
      number: 4830,
      opening_date: "2026-02-25 09:00:00",
      priority: "Baixa",
      area: "WEB",
      issue: "Portal",
      operator: "admin",
      status: "ENCERRADA",
      description: "Prezado,<br />\r\nSem acesso ao sistema.<br /><br />Att,",
      entries: [
        {
          entry: "Verificado <b>com o cliente</b><br />segue em análise.",
          author: "Bruno de Souza Castro",
          date: "2026-02-25 09:18:13",
          type: 2,
        },
      ],
      files: [],
    },
  });

  assert.doesNotMatch(resposta, /<br|<b>|<\/b>/);
  assert.match(resposta, /Descrição: Prezado, Sem acesso ao sistema\. Att,/);
  assert.match(resposta, /Verificado com o cliente segue em análise\./);
});

test("hasSummarizableTicketContent: true com descrição real", () => {
  assert.equal(
    hasSummarizableTicketContent({ description: "Usuário sem acesso ao sistema desde ontem.", entries: [] }),
    true,
  );
});

test("hasSummarizableTicketContent: true só com comentário, mesmo sem descrição", () => {
  assert.equal(
    hasSummarizableTicketContent({
      description: "",
      entries: [{ entry: "Verificado com o cliente, resolvido.", author: "x", date: "2026-01-01", type: 2 }],
    }),
    true,
  );
});

test("hasSummarizableTicketContent: false sem descrição real nem comentário", () => {
  assert.equal(hasSummarizableTicketContent({ description: "", entries: [] }), false);
  assert.equal(hasSummarizableTicketContent({ description: null, entries: [] }), false);
});

test("hasSummarizableTicketContent: false quando só sobra HTML/espaço depois de limpar", () => {
  assert.equal(
    hasSummarizableTicketContent({
      description: "<br />  <br/> ",
      entries: [{ entry: "<b></b>", author: "x", date: "2026-01-01", type: 2 }],
    }),
    false,
  );
});

test("P14 da auditoria: formatToolResults sem resultado nenhum lança AgentError, não Error genérico", () => {
  assert.throws(
    () => formatToolResults([]),
    (error) => error instanceof AgentError && error.code === "nenhum_resultado_informado",
  );
});

test("P14 da auditoria: tool sem formatador conhecido lança AgentError, não Error genérico", () => {
  assert.throws(
    () => format("tool_inexistente", {}),
    (error) => error instanceof AgentError && error.code === "resultado_nao_suportado",
  );
});

test("ticket não encontrado retorna mensagem amigável", () => {
  const resposta = format("buscar_ticket_por_numero", {
    encontrado: false,
    ticket: null,
  });

  assert.match(resposta, /não foi encontrado/);
});

test("formata resumo de tickets por status", () => {
  const resposta = format("resumo_tickets_por_status", {
    filtros: {},
    total_tickets: 3,
    truncado: false,
    resumo: [
      { chave: "Aguardando atendimento", quantidade: 2 },
      { chave: "Em atendimento", quantidade: 1 },
    ],
  });

  assert.match(resposta, /Resumo de 3 ticket\(s\) por status:/);
  assert.match(resposta, /- Aguardando atendimento: 2/);
});

test("formata resumo de tickets por status com totais de abertos e fechados", () => {
  const resposta = format("resumo_tickets_por_status", {
    filtros: {},
    total_tickets: 3,
    truncado: false,
    abertos: 2,
    fechados: 1,
    resumo: [
      { chave: "Aguardando atendimento", quantidade: 2 },
      { chave: "Encerrada", quantidade: 1 },
    ],
  });

  assert.match(resposta, /Total abertos: 2; total fechados: 1/);
});

test("formata resumo de tickets por prioridade com totais de abertos e fechados", () => {
  const resposta = format("resumo_tickets_por_prioridade", {
    filtros: {},
    total_tickets: 3,
    truncado: false,
    abertos: 1,
    fechados: 2,
    resumo: [
      { chave: "Alta", quantidade: 1 },
      { chave: "Baixa", quantidade: 2 },
    ],
  });

  assert.match(resposta, /Total abertos: 1; total fechados: 2/);
});

test("formata resumo de tickets por área com totais de abertos e fechados", () => {
  const resposta = format("resumo_tickets_por_area", {
    filtros: {},
    total_tickets: 5,
    truncado: false,
    abertos: 4,
    fechados: 1,
    resumo: [
      { chave: "Suporte", quantidade: 5 },
    ],
  });

  assert.match(resposta, /Total abertos: 4; total fechados: 1/);
});

test("Img 36: resumo operacional destaca os tickets abertos mais antigos ainda sem solução", () => {
  const resposta = format("resumo_operacional_tickets", {
    total: 10,
    truncado: false,
    abertos: 6,
    fechados: 4,
    sem_operador: 1,
    congelados: 2,
    por_prioridade: [{ chave: "Urgente", quantidade: 1 }],
    abertos_com_mais_de_7_dias: 3,
    mais_antigos_em_aberto: [
      { numero: 100, issue: "Impressora não liga", opening_date: "2026-01-01 10:00:00", dias_em_aberto: 90 },
      { numero: 200, issue: "VPN caindo", opening_date: "2026-02-01 10:00:00", dias_em_aberto: 60 },
    ],
  });

  assert.match(resposta, /Mais antigos ainda em aberto:/);
  assert.match(resposta, /- #100 \(Impressora não liga\): há 90 dia\(s\)/);
  assert.match(resposta, /- #200 \(VPN caindo\): há 60 dia\(s\)/);
});

test("resumo operacional sem tickets abertos não mostra a seção de mais antigos", () => {
  const resposta = format("resumo_operacional_tickets", {
    total: 4,
    truncado: false,
    abertos: 0,
    fechados: 4,
    sem_operador: 0,
    congelados: 0,
    por_prioridade: [],
    abertos_com_mais_de_7_dias: 0,
    mais_antigos_em_aberto: [],
  });

  assert.doesNotMatch(resposta, /Mais antigos ainda em aberto:/);
});

test("resumo operacional sem filtros avisa explicitamente que é sobre todos os tickets", () => {
  const resposta = format("resumo_operacional_tickets", {
    total: 4,
    truncado: false,
    abertos: 0,
    fechados: 4,
    sem_operador: 0,
    congelados: 0,
    por_prioridade: [],
    abertos_com_mais_de_7_dias: 0,
    mais_antigos_em_aberto: [],
  });

  assert.match(resposta, /^Nenhum filtro aplicado \(todos os tickets\)\.\n/);
});

test("resumo operacional com filtros descreve área, departamento e período no topo", () => {
  const resposta = format("resumo_operacional_tickets", {
    filtros: { area: "Redes", departamento: "TI", dataInicio: "2010-01-01", dataFim: "2010-01-02" },
    total: 0,
    truncado: false,
    abertos: 0,
    fechados: 0,
    sem_operador: 0,
    congelados: 0,
    por_prioridade: [],
    abertos_com_mais_de_7_dias: 0,
    mais_antigos_em_aberto: [],
  });

  assert.match(
    resposta,
    /^Filtros aplicados: área: Redes, departamento: TI, a partir de 01\/01\/2010, até 02\/01\/2010\.\n/,
  );
});

test("formata lista de áreas de ticket", () => {
  const resposta = format("listar_areas_tickets", {
    quantidade: 2,
    areas: [
      { id: 1, name: "DEFAULT", active: true },
      { id: 2, name: "Redes", active: false },
    ],
  });

  assert.match(resposta, /2 área\(s\) de ticket encontrada\(s\):/);
  assert.match(resposta, /- Redes \(inativa\)/);
});

test("formata lista de tickets mais recentes", () => {
  const resposta = format("listar_tickets_mais_recentes", {
    quantidade_total: 42,
    truncado: false,
    tickets: [
      {
        number: 4850,
        opening_date: "2026-09-01 07:47:00",
        priority: "Baixa",
        area: "Suporte",
        issue: "Rede",
        operator: "admin",
        status: "AGUARDANDO ATENDIMENTO",
        is_frozen: false,
      },
    ],
  });

  assert.match(resposta, /1 ticket\(s\) mais recente\(s\) de 42 no total:/);
  assert.match(resposta, /Ticket 4850: Rede/);
});

test("formata lista de tickets com SLA vencido, incluindo o detalhe do SLA por ticket", () => {
  const resposta = format("listar_tickets_vencidos", {
    quantidade_total: 2,
    truncado: false,
    tickets: [
      {
        number: 100,
        opening_date: "2026-01-05 08:00:00",
        priority: "Alta",
        area: "Suporte",
        issue: "Rede",
        operator: "admin",
        status: "ENCERRADA",
        is_frozen: false,
        lifetime: { result_sla_response: 4, result_sla_solution: 2 },
      },
    ],
  });

  assert.match(resposta, /1 ticket\(s\) com SLA vencido de 2 no total:/);
  assert.match(resposta, /Ticket 100: Rede/);
  assert.match(resposta, /SLA de resposta: excedeu o SLA; SLA de solução: dentro do SLA/);
});

test("avisa quando o filtro de tickets vencidos tem candidatos demais pra checar o SLA real", () => {
  const resposta = format("listar_tickets_vencidos", {
    muitos_para_verificar: true,
    quantidade_candidatos: 4320,
    limite_verificacao: 100,
  });

  assert.match(resposta, /4320 ticket\(s\)/);
  assert.match(resposta, /restringir por área, departamento, operador, cliente ou período/);
});

test("formata lista de tickets mais antigos (entre todos, abertos e fechados)", () => {
  const resposta = format("listar_tickets_mais_antigos", {
    quantidade_total: 4899,
    truncado: false,
    tickets: [
      {
        number: 1,
        opening_date: "2020-01-05 08:00:00",
        priority: "Baixa",
        area: "Suporte",
        issue: "Rede",
        operator: "admin",
        status: "ENCERRADA",
        is_frozen: false,
      },
    ],
  });

  assert.match(resposta, /1 ticket\(s\) mais antigo\(s\) de 4899 no total:/);
  assert.match(resposta, /Ticket 1: Rede/);
});

test("busca por texto inclui o comentário de abertura (sem tags HTML), pra dar contexto de onde o termo bateu", () => {
  const resposta = format("buscar_tickets_por_texto", {
    quantidade: 1,
    truncado: false,
    pagina: 1,
    paginas: 1,
    tickets: [
      {
        number: 4831,
        opening_date: "2026-08-28 14:25:00",
        priority: "Baixa",
        area: "Redes e Segurança",
        issue: "Ativação de ponto de rede",
        description: "5- Endereço IP (em caso de VOIP/IMPRESSORAS): <br />\r\n6- MAC Address: 88:AE:DD:39:C2:84",
        contact_name: "Daniel Guimarães do Lago",
        operator: "Helpdesk",
        status: "ENCERRADA",
        is_frozen: false,
      },
    ],
  });

  assert.match(resposta, /comentário de abertura: 5- Endereço IP \(em caso de VOIP\/IMPRESSORAS\): 6- MAC Address/);
  assert.doesNotMatch(resposta, /<br \/>/);
});

test("outros tipos de listagem (ex.: tickets abertos) não incluem o comentário de abertura, pra não inflar a resposta", () => {
  const resposta = format("listar_tickets_abertos", {
    quantidade: 1,
    truncado: false,
    pagina: 1,
    paginas: 1,
    tickets: [
      {
        number: 4900,
        opening_date: "2026-09-01 07:47:00",
        priority: "Baixa",
        area: "Suporte",
        issue: "Rede",
        description: "Descrição bem detalhada que não deveria aparecer aqui.",
        operator: "admin",
        status: "AGUARDANDO ATENDIMENTO",
        is_frozen: false,
      },
    ],
  });

  assert.doesNotMatch(resposta, /comentário de abertura/);
  assert.doesNotMatch(resposta, /Descrição bem detalhada/);
});

test("o trecho do comentário de abertura fica CENTRADO no termo pesquisado, não sempre a partir do início", () => {
  const preambulo = "Prezado GRS, ".repeat(30); // empurra o termo bem além dos primeiros 300 caracteres
  const resposta = format("buscar_tickets_por_texto", {
    texto: "impressora",
    quantidade: 1,
    truncado: false,
    pagina: 1,
    paginas: 1,
    tickets: [
      {
        number: 4831,
        opening_date: "2026-08-28 14:25:00",
        priority: "Baixa",
        area: "Redes e Segurança",
        issue: "Ativação de ponto de rede",
        description: `${preambulo}5- Endereço IP (em caso de VOIP/IMPRESSORAS): valor`,
        operator: "Helpdesk",
        status: "ENCERRADA",
        is_frozen: false,
      },
    ],
  });

  assert.match(resposta, /IMPRESSORAS/);
});
