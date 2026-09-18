---
impacto: nada_mudou
secao: corrigido
titulo: O filtro por marcador do Inbox procura onde você marca
---

O Inbox tem uma caixa de marcadores para a pessoa do outro lado — a mesma da
ficha do contato e a mesma que a campanha lê. O filtro da lista de conversas,
porém, procurava numa segunda caixa, a da conversa, que quase ninguém usa à
mão: ela é onde o atendimento automático encosta os próprios marcadores.

O efeito era marcar um cliente, filtrar por esse marcador e receber "nenhuma
conversa". Sem erro, sem aviso — a leitura natural é que o CRM perdeu o
marcador. E a lista de opções do filtro sofria do mesmo desencontro: oferecia
os marcadores da conversa, então o que você acabara de escrever no contato nem
aparecia para ser escolhido.

Agora as duas pontas leem a mesma tabela: o filtro casa com `contacts.tags` e a
lista de opções vem dos marcadores em uso nos contatos da organização. Marcar
uma pessoa e procurá-la pelo marcador passa a devolver as conversas dela.

Os marcadores de conversa continuam existindo e continuam servindo ao que o
atendimento automático aplica; o que mudou é só a pergunta que a barra de
filtro faz. Conversa de grupo, que não tem contato, segue aparecendo
normalmente quando nenhum marcador está filtrado.

Nada muda para quem opera: nenhuma variável nova, nenhum passo na atualização.
