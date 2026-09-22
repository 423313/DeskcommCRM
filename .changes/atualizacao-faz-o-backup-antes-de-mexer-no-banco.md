---
impacto: nada_mudou
secao: corrigido
titulo: A atualização da VPS faz o backup de segurança que ela promete antes de mexer no banco
---

Toda atualização anuncia o passo "Backup de segurança (antes de mexer no banco)" — e o backup não acontecia. O script procurava o `backup.sh` a partir do diretório de onde o comando foi digitado, não de onde ele próprio está: chamado de `/root`, por exemplo, ele não achava o arquivo, e a atualização parava ali (ou, no modo assistido, seguia depois de avisar que o backup havia falhado).

Agora o caminho do backup é resolvido antes de o script entrar na pasta do projeto, como o próprio script já mandava fazer. Atualizando de qualquer diretório, o backup roda de verdade e a mensagem de "backup feito" corresponde ao que aconteceu. Quem opera a VPS não precisa fazer nada.

Contribuição de @webtecnica (#1476).
