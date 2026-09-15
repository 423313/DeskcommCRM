---
impacto: nada_mudou
secao: corrigido
titulo: O registro de auditoria não pode mais ser esvaziado de uma vez
---
A tabela de auditoria já não aceitava alteração nem exclusão de linha, mas ainda permitia que ela fosse esvaziada por inteiro em uma única instrução — resíduo da geração do banco, sem uso em lugar nenhum do produto. Esse privilégio foi removido. A limpeza legítima, que apaga apenas registros mais antigos que o prazo de retenção configurado, continua funcionando como antes.
