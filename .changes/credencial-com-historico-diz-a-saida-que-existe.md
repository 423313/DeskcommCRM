---
impacto: nada_mudou
secao: corrigido
titulo: A credencial usada por versão antiga explica por que não sai e qual é a saída
---

Uma chave de IA que só é usada por versões antigas de agentes — as que já foram
substituídas por uma publicação mais nova — não pode ser excluída: o banco
guarda o histórico apontando para ela. A tentativa de excluir, porém, ensinava
um caminho que não existe: "aponte essa versão para outra chave". Versão já
publicada tem o conteúdo congelado e o próprio banco recusa trocar a chave dela,
então quem seguia a instrução batia numa parede sem saber o que fazer.

Agora a recusa diz a verdade. Ela nomeia o agente e a versão onde o uso está,
avisa que esse uso é congelado e que a chave não sai enquanto o histórico
existir, e mostra a saída que de fato existe: "Editar credencial". Editar troca a
chave — ou só o nome dela — na MESMA credencial, então as versões que já apontam
para ela continuam válidas e o próximo atendimento já sai com a chave nova. Com
a chave vazada, a recomendação de revogá-la no painel do provedor continua
valendo, e a exclusão segue disponível para as chaves que ninguém usa.

O aviso da tela de credenciais foi junto: passar o mouse na chave em uso conta a
mesma história, em vez de prometer o repontar impossível. A contagem que a tela
mostra é a mesma que o servidor usa para decidir, nas duas listas.

Para quem opera, nada muda no banco: nenhuma migração, nenhum ajuste, nada a
rodar na atualização. O que muda é o que a tela responde quando a exclusão não é
possível.
