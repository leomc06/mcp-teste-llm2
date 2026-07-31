import assert from "node:assert/strict";
import test from "node:test";

import {
  isWriteRequest,
} from "../agent/write-policy.js";

const blockedQuestions = [
  "Crie uma nova OS.",
  "Cadastre uma nova ordem de serviço.",
  "Registre um novo chamado.",
  "Altere a OS 1001 para concluída.",
  "Atualize a prioridade da OS 1002.",
  "Modifique o responsável da OS 1003.",
  "Mude a prioridade da OS 1002.",
  "Troque o responsável da OS 1001.",
  "Edite a OS 1004.",
  "Marque a OS 1002 como concluída.",
  "Conclua a OS 1002.",
  "Encerre a OS 1003.",
  "Feche a OS 1001.",
  "Cancele a OS 1004.",
  "Exclua a OS 1003.",
  "Apague a OS 1004.",
  "Remova a OS 1003.",
  "Reabra a OS 1004.",
  "Atribua a OS 1001 ao Carlos.",
  "Reatribua a OS 1002 para Maria.",
  "Cancelar a OS 1004.",
  "Por favor, concluir a OS 1002.",
  "Quero cancelar a OS 1004.",
  "Preciso alterar a prioridade da OS 1003.",
  "Pode fechar a OS 1001.",
  "Poderia reabrir a OS 1002?",
  "Gostaria de atribuir a OS 1001 ao Carlos.",
  "Vamos remover a OS 1004.",
  "Execute UPDATE ordens_servico SET status = 'concluida'.",
  "DELETE FROM ordens_servico.",
  "DROP TABLE ordens_servico.",
  "TRUNCATE TABLE ordens_servico.",
  "GRANT ALL ON ordens_servico TO usuario.",
];

const allowedQuestions = [
  "Quantas OS estão concluídas?",
  "Liste as OS canceladas.",
  "Quem concluiu a OS 1002?",
  "Quem cancelou a OS 1004?",
  "Mostre as OS que foram alteradas ontem.",
  "Quais OS foram fechadas?",
  "Liste as OS removidas do relatório, se essa informação existir no histórico.",
  "Qual técnico está atribuído à OS 1001?",
  "Mostre o histórico de alterações da OS 1002.",
  "Quem é o responsável pela OS 1005?",
  "Quais OS estão abertas?",
  "Quais OS foram reabertas?",
  "Quem registrou a OS 1003?",
  "Quando a prioridade foi atualizada?",
  "Quais chamados foram encerrados?",
  "Mostre as ordens modificadas nesta semana.",
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
