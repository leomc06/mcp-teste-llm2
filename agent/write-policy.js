import {
  normalizeText,
} from "./routing-utils.js";

// Cada verbo aqui tem as 2 formas de imperativo do português: a formal
// ("você", usada numa ordem mais polida — "FECHE o ticket") e a informal
// ("tu", mas usada coloquialmente com "você" também, muito comum na fala e
// escrita cotidiana no Brasil — "FECHA o ticket", "FECHA esse chamado pra
// mim") — achado testando o lote de perguntas ao vivo: "Fecha o ticket
// 1234, por favor" não era bloqueado pelo guard (só "Feche" era
// reconhecido), um pedido de escrita real passando como se fosse leitura.
const imperativeVerbs = [
  "crie",
  "cria",
  "cadastre",
  "cadastra",
  "registre",
  "registra",
  "altere",
  "altera",
  "atualize",
  "atualiza",
  "modifique",
  "modifica",
  "mude",
  "muda",
  "troque",
  "troca",
  "edite",
  "edita",
  "marque",
  "marca",
  "conclua",
  "conclui",
  "encerre",
  "encerra",
  "feche",
  "fecha",
  "cancele",
  "cancela",
  "exclua",
  "exclui",
  "apague",
  "apaga",
  "remova",
  "remove",
  "reabra",
  "reabre",
  "atribua",
  "atribui",
  "reatribua",
  "reatribui",
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
