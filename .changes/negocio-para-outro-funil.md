---
impacto: capacidade_nova
secao: adicionado
titulo: Levar um negócio aberto para outro funil (o clone que a P-01 mandava usar)
---

Negócio que começou no funil errado (ou que muda de natureza no meio do caminho —
o pedido de suporte que virou venda) não tinha por onde sair: o quadro só sabe
trocar a etapa DENTRO do mesmo funil, e quem tentava pela API recebia "não é
permitido, clone o negócio" — apontando para um clone que não existia em lugar
nenhum do produto. A instrução apontava para o vazio.

Agora existe a troca de funil, por enquanto pela API (`POST
/api/v1/leads/[id]/clone`); o botão no quadro vem na fatia seguinte. O negócio é
criado no funil de destino (na primeira etapa aberta, ou na etapa que você
escolher) com os mesmos dados — título, contato, valor, dono, previsão, tags e os
campos personalizados que o funil de destino declara — e a origem é encerrada
como perdida. Cada lado guarda o ponteiro para o outro: o novo negócio registra
de onde veio, o antigo registra para onde foi.

Duas coisas que a troca NÃO faz, de propósito: negócio já encerrado não é clonado
(reescrever um ganho como perda apagaria o desfecho que alguém registrou) e trocar
de etapa dentro do mesmo funil continua sendo o arrastar de sempre, sem encerrar
nada.
