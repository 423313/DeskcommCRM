---
impacto: nada_mudou
secao: corrigido
titulo: O construtor de fluxos deixa de ampliar a tela para 200% no primeiro nó
---

Num fluxo novo, ainda vazio, o primeiro nó adicionado fazia a tela saltar para o zoom máximo (200%): o enquadramento automático, que existe para mostrar o fluxo inteiro ao abrir, ficava guardado para quando aparecesse o primeiro nó — e enquadrar um nó só é ampliá-lo. Os nós seguintes nasciam fora da vista. Agora o enquadramento vale só para quem abre um fluxo que já tem nós; o fluxo vazio fica no zoom normal. Nada muda para quem opera a VPS.
