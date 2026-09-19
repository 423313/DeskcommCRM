---
impacto: nada_mudou
secao: corrigido
titulo: A instalação já termina com os modelos da OpenRouter no seletor do agente
---

Os modelos dos provedores diretos vêm no banco desde a instalação, mas os da OpenRouter são
centenas e mudam sozinhos: quem os traz é uma rodada diária do agendador, às 04:15 UTC. Numa
instalação concluída depois desse horário, quem entrava para criar o primeiro agente encontrava o
seletor de modelos vazio, com a chave da OpenRouter já cadastrada e funcionando — e só no dia
seguinte descobria que não era defeito. É a primeira tela que se abre para testar a IA.

Agora, assim que o app responde que está saudável, o próprio instalador pede essa sincronização uma
vez. O catálogo já está lá quando a instalação termina.

Se a openrouter.ai estiver fora do ar naquele minuto, a instalação **continua e termina normal**:
o instalador avisa na tela que não conseguiu agora e que o agendador tenta de novo às 04:15 UTC.
Nenhum passo novo, nenhuma variável nova, e quem já tem o CRM instalado não precisa fazer nada —
para essas instalações o catálogo já veio por uma rodada do agendador.

Trabalho de @betoarts, recortado do #714.
