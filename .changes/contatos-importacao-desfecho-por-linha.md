---
impacto: nada_mudou
secao: corrigido
titulo: Importação de contatos contabiliza repetições sem perder linhas válidas
---

Ao importar contatos por CSV, cada linha repetida agora aparece no total de
duplicados do relatório. Uma linha rejeitada na validação ou na gravação não
impede a importação de outra linha válida com o mesmo telefone ou e-mail. Se
uma linha é pulada por ter um e-mail já cadastrado, seu telefone ainda não
gravado continua disponível para as linhas seguintes. Crédito: @Tong-bit-art.
