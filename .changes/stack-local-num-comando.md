---
impacto: capacidade_nova
secao: adicionado
titulo: Um comando sobe o DeskcommCRM inteiro na sua própria máquina
---

Até aqui, rodar o DeskcommCRM fora de um servidor exigia montar tudo à mão: banco, autenticação, WhatsApp e fila, cada um com a sua configuração. O instalador da VPS não serve para isso, porque ele assume domínio próprio e proxy na frente.

Agora existe um caminho local: `./ubuntu-local-installer.sh` prepara a máquina, sobe o banco com a estrutura oficial do produto, gera as chaves, levanta a aplicação, o worker, o WhatsApp e a fila, e cria o usuário administrador — imprimindo no fim o endereço e a senha. Depois disso, `pnpm local:up`, `local:status`, `local:logs` e `local:down` cuidam do dia a dia. O passo a passo está em `docs/SETUP.md`.

Para quem opera uma VPS nada muda: é ferramenta de quem desenvolve ou avalia o produto na própria máquina, e nenhum arquivo da instalação em servidor foi tocado.

Contribuição de @betoarts (#714).
