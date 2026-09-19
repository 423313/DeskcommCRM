---
impacto: capacidade_nova
secao: alterado
titulo: Quem assume uma conversa da IA recebe o contexto — e o aviso se resolve sozinho
---

O sistema já sabia guardar o contexto de cada passagem do atendimento automático para uma pessoa.
Agora ele **preenche** esse contexto, em todos os caminhos: quando o cliente pede um atendente,
quando ele parece pedir para não receber mais mensagens, quando a própria IA decide chamar alguém,
quando o limite de gasto com IA é atingido, quando alguém da equipe escala um caso, quando o
sistema detecta irritação na conversa e quando um assistente externo aciona a passagem.

O que muda, na prática:

- **Quem assume a conversa lê o porquê, o que a IA já tentou e o que o cliente pediu.**
  Antes o aviso dizia só um código em inglês — e em metade dos caminhos nem isso.
- **O aviso da Central se fecha sozinho** quando alguém assume a conversa ou a devolve para o
  automático. Antes ele ficava aberto para sempre — e, pior, um aviso aberto impedia o próximo de
  nascer: o cliente pedia um atendente de novo e ninguém era avisado.
- **"O cliente já foi avisado" passou a ser verdade.** O sistema afirmava isso mesmo quando a
  mensagem não tinha saído (canal fora do ar, número em aquecimento, canal excluído, contato sem
  telefone). Agora ele diz o que aconteceu de verdade, e por quê — que é o que muda a primeira
  frase que a pessoa digita ao abrir a conversa.
- **O aviso da Central ficou curto.** O resumo da conversa saiu de lá e foi para dentro do próprio
  atendimento: na Central, qualquer pessoa da equipe enxerga os avisos, inclusive quem não tem
  permissão para abrir aquela conversa.
- **Dois pedidos seguidos não somem mais.** Quando uma segunda passagem acontece na mesma conversa,
  ela vira um acréscimo no aviso que já existe, em vez de ser descartada em silêncio.

Dois avisos honestos:

- **O primeiro atendimento depois desta atualização pode custar um pouco mais em IA.** As
  instruções que a IA recebe mudaram, e a economia que reaproveita instruções repetidas recomeça do
  zero uma vez por conta. Depois disso, volta ao normal.
- **Se você usa um assistente externo pelo MCP**, o campo `original_reason` saiu do registro de
  auditoria. O texto não se perdeu: ele passou para dentro da passagem, onde o pedido de
  esquecimento de um cliente consegue alcançá-lo — no registro de auditoria, não conseguia.

Você não precisa fazer nada: a atualização já traz tudo pronto.
