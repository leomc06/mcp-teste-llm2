import assert from "node:assert/strict";
import test from "node:test";

import {
  isWriteRequest,
} from "../agent/write-policy.js";

const blockedQuestions = [
  "Crie um novo ticket.",
  "Cadastre um novo chamado.",
  "Registre um novo ticket.",
  "Altere o ticket 1001 para concluído.",
  "Atualize a prioridade do ticket 1002.",
  "Modifique o operador do ticket 1003.",
  "Mude a prioridade do ticket 1002.",
  "Troque o operador do ticket 1001.",
  "Edite o ticket 1004.",
  "Marque o ticket 1002 como concluído.",
  "Conclua o ticket 1002.",
  "Encerre o ticket 1003.",
  "Feche o ticket 1001.",
  "Cancele o ticket 1004.",
  "Exclua o ticket 1003.",
  "Apague o ticket 1004.",
  "Remova o ticket 1003.",
  "Reabra o ticket 1004.",
  "Atribua o ticket 1001 ao Carlos.",
  "Reatribua o ticket 1002 para Maria.",
  "Cancelar o ticket 1004.",
  "Por favor, concluir o ticket 1002.",
  "Quero cancelar o ticket 1004.",
  "Preciso alterar a prioridade do ticket 1003.",
  "Pode fechar o ticket 1001.",
  "Poderia reabrir o ticket 1002?",
  "Gostaria de atribuir o ticket 1001 ao Carlos.",
  "Vamos remover o ticket 1004.",
  "Execute UPDATE tickets SET status = 'encerrado'.",
  "DELETE FROM tickets.",
  "DROP TABLE tickets.",
  "TRUNCATE TABLE tickets.",
  "GRANT ALL ON tickets TO usuario.",
  // Imperativo informal ("tu", mas comum na fala/escrita cotidiana mesmo
  // com "você") — achado testando o lote de perguntas ao vivo: só a forma
  // formal ("Feche") era bloqueada, "Fecha o ticket 1234, por favor" (bem
  // mais comum no dia a dia) passava como se fosse uma leitura.
  "Fecha o ticket 1234, por favor.",
  "Cancela o ticket 1004.",
  "Atualiza a prioridade do ticket 1002.",
  "Marca o ticket 1002 como concluído.",
  // Pretérito imperfeito do subjuntivo (pedido indireto/educado) — achado
  // testando o lote de perguntas ao vivo: "Precisava que você atualizasse
  // pra mim o status do chamado 4830, pode ser?" e variações similares
  // ("seria bom se", "queria que") não eram reconhecidas como escrita,
  // porque nem o imperativo nem o infinitivo cobrem essa conjugação.
  "Precisava que você atualizasse pra mim o status do chamado 4830, pode ser?",
  "Seria bom se você fechasse o ticket 4830.",
  "Queria que você cancelasse o chamado 4830.",
  "Atualizasse o status do ticket 4830 pra mim?",
  // "dava pra"/"da pra"/"seria possível" (achado junto): prefixo de pedido
  // coloquial que faltava, com "você" opcional entre o prefixo e o verbo.
  "Dava pra você atualizar o status do ticket 4830?",
  "Dá pra você fechar o ticket 4830?",
  "Seria possível cancelar o chamado 4830?",
];

const allowedQuestions = [
  "Quantos tickets estão encerrados?",
  "Liste os tickets cancelados.",
  "Quem concluiu o ticket 1002?",
  "Quem cancelou o ticket 1004?",
  "Mostre os tickets que foram alterados ontem.",
  "Quais tickets foram fechados?",
  "Liste os tickets removidos do relatório, se essa informação existir no histórico.",
  "Qual operador está atribuído ao ticket 1001?",
  "Mostre o histórico de alterações do ticket 1002.",
  "Quem é o operador do ticket 1005?",
  "Quais tickets estão abertos?",
  "Quais tickets foram reabertos?",
  "Quem registrou o ticket 1003?",
  "Quando a prioridade foi atualizada?",
  "Quais tickets foram encerrados?",
  "Mostre os tickets modificados nesta semana.",
];

test("bloqueia intenção de escrita", () => {
  for (const question of blockedQuestions) {
    assert.equal(
      isWriteRequest(question),
      true,
      question,
    );
  }
});

test("permite consultas sobre ações passadas", () => {
  for (const question of allowedQuestions) {
    assert.equal(
      isWriteRequest(question),
      false,
      question,
    );
  }
});
