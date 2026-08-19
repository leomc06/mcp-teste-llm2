import {
  hasAmbiguousRequesterExtraction,
  hasAmbiguousResponsibleExtraction,
  normalizeText,
  routeOsQuestion,
} from "./os-routing.js";
import { routeClientQuestion } from "./client-routing.js";

const PERSON_LOOKUP_PATTERN =
  /\b(?:informa\w*|dados|detalhes)\s+(?:sobre|de|do|da)\s+\S/u;

const AMBIGUOUS_PERSON_TOOL_CHECKS = Object.freeze({
  listar_por_responsavel: hasAmbiguousResponsibleExtraction,
  listar_por_solicitante: hasAmbiguousRequesterExtraction,
});

export function selectToolDecision(
  pergunta,
  availableTools,
) {
  const text = normalizeText(pergunta);

  const osRoute = routeOsQuestion(pergunta);

  const mentionsClient = /\bclientes?\b/.test(text);
  const looksLikePersonLookup = PERSON_LOOKUP_PATTERN.test(text);

  const clientRoute =
    mentionsClient || looksLikePersonLookup
      ? routeClientQuestion(pergunta)
      : null;

  let route =
    mentionsClient
      ? clientRoute
      : (osRoute ?? clientRoute);

  const ambiguityCheck =
    !mentionsClient && osRoute
      ? AMBIGUOUS_PERSON_TOOL_CHECKS[osRoute.intent]
      : undefined;

  if (ambiguityCheck?.(pergunta)) {
    route = {
      ...osRoute,
      toolNames: [
        ...osRoute.toolNames,
        "listar_os_por_cliente",
      ],
    };
  }

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
