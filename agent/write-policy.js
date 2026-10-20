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

// Pretérito imperfeito do subjuntivo ("se eu fechasse", "que você
// atualizasse") — achado testando o lote de perguntas ao vivo: "Precisava
// que você ATUALIZASSE pra mim o status do chamado 4830, pode ser?" (e
// variações como "Seria bom se você FECHASSE o ticket", "Queria que você
// CANCELASSE o chamado") passavam direto pelo guard, porque nem
// imperativeVerbs nem infinitiveVerbs cobrem essa conjugação — um pedido de
// escrita real, só disfarçado numa forma verbal diferente (indireta/
// educada), era tratado como leitura. normalizeText já tira acento antes de
// isWriteRequest testar qualquer padrão, por isso as formas aqui são
// escritas sem acento ("concluisse", não "concluísse").
const subjunctiveVerbs = [
  "criasse",
  "cadastrasse",
  "registrasse",
  "alterasse",
  "atualizasse",
  "modificasse",
  "mudasse",
  "trocasse",
  "editasse",
  "marcasse",
  "concluisse",
  "encerrasse",
  "fechasse",
  "cancelasse",
  "excluisse",
  "apagasse",
  "removesse",
  "reabrisse",
  "atribuisse",
  "reatribuisse",
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

// Particípio dos mesmos verbos de escrita acima — cobre a voz passiva com
// "ser" (achado testando o lote de perguntas ao vivo): "O ticket 1050 PODE
// SER MARCADO COMO RESOLVIDO?" e "Isso aqui precisa SER CANCELADO" não
// batiam em nenhuma lista (imperativo/subjuntivo/infinitivo são outra
// conjugação), então um pedido de escrita disfarçado em "ser + particípio"
// passava como se fosse leitura. Só "ser" (infinitivo) dispara — "foi
// marcado"/"está cancelado" (particípio depois de um verbo CONJUGADO no
// passado/presente) é uma pergunta sobre o estado atual, não um pedido pra
// mudar; a frase real de pedido sempre usa "ser" cru, depois de um modal
// (pode/deve/precisa) ou isolado.
const participleVerbs = [
  "criado",
  "cadastrado",
  "registrado",
  "alterado",
  "atualizado",
  "modificado",
  "mudado",
  "trocado",
  "editado",
  "marcado",
  "concluido",
  "encerrado",
  "fechado",
  "cancelado",
  "excluido",
  "apagado",
  "removido",
  "reaberto",
  "atribuido",
  "reatribuido",
];

// "Será que esse chamado vai ser fechado logo?" (achado testando o lote de
// perguntas ao vivo): falso positivo da 1ª versão deste padrão, que
// disparava com "ser + particípio" sozinho, sem exigir nenhum modal antes
// — essa frase é uma PERGUNTA ESPECULATIVA sobre o que vai acontecer
// (previsão/expectativa), não um pedido pra fazer algo, mas "vai ser
// fechado" batia do mesmo jeito. Só os modais que exprimem permissão/
// obrigação/necessidade (pode/deve/precisa/...) fazem a voz passiva soar
// como um PEDIDO de verdade — "vai" (futuro simples, só afirma o que vai
// acontecer) foi removido de propósito, é o caso que não devia disparar.
const PASSIVE_REQUEST_MODAL_SOURCE =
  "(?:pode|poderia|deve|deveria|precisa|precisaria|necessita|tem\\s+que|teria\\s+que|teria\\s+de)";

const passivePattern = new RegExp(
  `\\b${PASSIVE_REQUEST_MODAL_SOURCE}\\s+ser\\s+(?:${participleVerbs.join("|")})\\b`,
  "u",
);

const sqlWritePattern =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b/u;

const imperativePattern = new RegExp(
  `\\b(?:${imperativeVerbs.join("|")})\\b`,
  "u",
);

const subjunctivePattern = new RegExp(
  `\\b(?:${subjunctiveVerbs.join("|")})\\b`,
  "u",
);

const directInfinitivePattern = new RegExp(
  `^(?:por favor\\s+)?(?:${infinitiveVerbs.join("|")})\\b`,
  "u",
);

// "dava pra"/"da pra"/"seria possível" (achado testando o lote de
// perguntas ao vivo): "Dava pra você atualizar o status do ticket 4830?"
// não batia em nenhum prefixo reconhecido — a mesma ideia coloquial de
// "poderia", só com outras palavras. "voce\s+"/"tu\s+" opcional entre o
// prefixo e o verbo (achado junto): a frase real tem "você" no meio ("dava
// pra VOCÊ atualizar"), que o conector antigo (só "que" opcional) não
// previa.
const requestPrefixPattern = new RegExp(
  [
    "\\b",
    "(?:",
    "quero|preciso|desejo|solicito|",
    "pode|poderia|",
    "gostaria\\s+de|",
    "dava\\s+pra|dava\\s+para|da\\s+pra|da\\s+para|seria\\s+possivel|",
    "vamos|tente|favor",
    ")",
    "\\s+(?:que\\s+)?(?:voce\\s+|tu\\s+)?",
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
    || subjunctivePattern.test(text)
    || directInfinitivePattern.test(text)
    || requestPrefixPattern.test(text)
    || passivePattern.test(text)
  );
}
