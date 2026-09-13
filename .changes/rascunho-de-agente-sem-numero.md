---
impacto: nada_mudou
secao: corrigido
titulo: O rascunho do agente de IA salva antes de haver WhatsApp conectado
---

Numa instalação nova, quem escrevia o prompt do atendente e tentava salvar não conseguia: o
editor exigia escolher "por qual número ele atende" — e, sem nenhum aparelho pareado, o seletor
abria vazio. Não havia opção a escolher, e o texto recém-escrito não tinha como ser guardado.
Escrever quem o agente é e conectar o celular são dois dias diferentes na vida de quem instala.

Agora o número é requisito para PUBLICAR, não para rascunhar. Sem ele o rascunho salva, e o
botão "Publicar" explica o que falta e para onde ir (Conexões). Publicar sem número continua
recusado em três camadas independentes — o botão, a função do banco
(`fn_publish_ai_agent_version`) e o próprio runtime, que só executa versão publicada.

No mesmo passo, o botão "Publicar" deixa de travar para quem usa a chave de IA da instalação
(a do `.env`): a régua pedia uma linha na tela de Credenciais, e essa escolha não é uma linha —
quem instalou pelo kit via o botão desabilitado para sempre, mandando escolher a chave que
tinha acabado de escolher.
