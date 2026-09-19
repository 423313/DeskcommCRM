---
impacto: nada_mudou
secao: corrigido
titulo: O marcador do contato é gravado em caixa baixa onde você o escrever
---

O marcador de contato podia ser gravado em caixa mista. Escrever **VIP** na ficha do contato guardava
`VIP`; o filtro procurava por `vip` e não achava — o contato marcado não aparecia na lista, sem erro
nenhum. Pior na hora de tirar: o marcador já gravado em caixa mista não era alcançado por nenhuma
remoção, e o chip seguia na ficha.

Agora **a mesma regra normaliza o marcador na escrita e na leitura**, em todos os caminhos onde ele
entra: a ficha do contato, a importação por CSV, a API e as ações da assistente (MCP). Marcador
escrito como **VIP**, com espaço nas pontas ou repetido na mesma lista entra como `vip` — uma vez só.
O filtro passa a encontrar o que foi gravado, e a lista de sugestões para de oferecer a mesma
etiqueta em duas formas.

Os marcadores que **já estavam gravados** em caixa mista são ajustados sozinhos na atualização: a
migration que acompanha este PR normaliza a coluna de marcadores dos contatos existentes e é
idempotente — rodar de novo não muda nada.

Nada muda para quem opera: nenhuma variável nova, nenhum passo na atualização, nenhum marcador é
apagado (o teto de vinte marcadores da importação por CSV continua igual).
