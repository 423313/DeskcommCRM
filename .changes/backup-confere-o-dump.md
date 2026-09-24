---
impacto: nada_mudou
secao: alterado
titulo: O backup confere se o arquivo do banco pode ser lido antes de dizer que terminou
---

O backup do banco era dado como pronto assim que o arquivo era escrito. Um arquivo cortado no meio (por disco cheio ou processo interrompido) passava como backup bom e só dava problema na hora de restaurar. Agora o backup confere o arquivo inteiro: se ele estiver corrompido, o backup falha, o arquivo é apagado para ninguém confiar nele, e a atualização não segue sem um backup válido. Crédito: @bonito-system.
