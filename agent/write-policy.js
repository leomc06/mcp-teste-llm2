import {
  normalizeText,
} from "./os-routing.js";

const imperativeVerbs = [
  "crie",
  "cadastre",
  "registre",
  "altere",
  "atualize",
  "modifique",
  "mude",
  "troque",
  "edite",
  "marque",
  "conclua",
  "encerre",
  "feche",
  "cancele",
  "exclua",
  "apague",
  "remova",
  "reabra",
  "atribua",
  "reatribua",
];

const infinitiveVerbs = [
  "criar",
  "cadastrar",
  "registrar",
  "alterar",
  "atualizar",
  "modificar",
  "mudar",
  "trocar",
  "editar",
  "marcar",
  "concluir",
  "encerrar",
  "fechar",
  "cancelar",
  "excluir",
  "apagar",
  "remover",
  "reabrir",
  "atribuir",
  "reatribuir",
];

const sqlWritePattern =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b/u;

const imperativePattern = new RegExp(
  `\\b(?:${imperativeVerbs.join("|")})\\b`,
  "u",
);

const directInfinitivePattern = new RegExp(
  `^(?:por favor\\s+)?(?:${infinitiveVerbs.join("|")})\\b`,
  "u",
);

const requestPrefixPattern = new RegExp(
  [
    "\\b",
    "(?:",
    "quero|preciso|desejo|solicito|",
    "pode|poderia|",
    "gostaria\\s+de|",
    "vamos|tente|favor",
    ")",
    "\\s+(?:que\\s+)?",
    `(?:${[
      ...imperativeVerbs,
      ...infinitiveVerbs,
    ].join("|")})`,
    "\\b",
  ].join(""),
  "u",
);

export function isWriteRequest(pergunta) {
  const text = normalizeText(pergunta);

  return (
    sqlWritePattern.test(text)
    || imperativePattern.test(text)
    || directInfinitivePattern.test(text)
    || requestPrefixPattern.test(text)
  );
}
