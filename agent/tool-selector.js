import { routeTicketQuestion } from "./tickets-routing.js";

export function selectToolDecision(
  pergunta,
  availableTools,
) {
  const route = routeTicketQuestion(pergunta);

  const selectedNames = new Set(
    route?.toolNames ?? [],
  );

  const tools = availableTools.filter((tool) =>
    selectedNames.has(tool.function.name)
  );

  return {
    tools,
    route,
  };
}

export function selectTools(
  pergunta,
  availableTools,
) {
  return selectToolDecision(
    pergunta,
    availableTools,
  ).tools;
}
