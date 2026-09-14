---
impacto: nada_mudou
secao: corrigido
titulo: Excluir contato não destrói mais o histórico quando a ficha não sai
---

Excluir um contato que tinha compromisso na agenda nunca funcionava — e, na
tentativa, levava junto as mensagens e as conversas dele. O CRM apagava o
histórico primeiro e só então esbarrava no vínculo que barra a exclusão da
ficha: a tela dizia "Erro interno", o contato continuava lá e as conversas
tinham ido embora sem volta.

Antes de apagar qualquer coisa, o CRM agora confere os vínculos que barram a
exclusão e devolve o mesmo aviso de vínculo pendente, com o histórico intacto.
E toda tentativa que não completa passa a ficar registrada na auditoria, com o
que chegou a ser apagado antes do erro — "ninguém excluiu" e "tentei e barrou"
deixam de ser a mesma linha em branco.

Você não precisa fazer nada para adotar.
