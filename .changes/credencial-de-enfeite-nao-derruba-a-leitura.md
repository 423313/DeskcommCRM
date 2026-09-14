---
impacto: nada_mudou
secao: corrigido
titulo: Credencial ainda não configurada deixa de derrubar a leitura
---

Toda credencial que ainda não foi preenchida — o segredo de webhook de uma
sessão nova, por exemplo — era gravada como um byte de enfeite só para
satisfazer a coluna. E o CRM, ao ler qualquer credencial, tentava decifrar esse
byte como se fosse uma cifra de verdade: a leitura estourava toda vez, no mesmo
registro, sem parar.

O efeito prático não estava na tela — quem lê uma credencial já tratava o erro
como "não configurada". Estava no log, que enchia de erro permanente e
indistinguível de uma chave mestra trocada, que é o único caso em que esse erro
diz a verdade. Agora a leitura só tenta decifrar o que pode ser uma cifra: valor
ausente, curto demais ou sem cara de pacote devolve "não configurada". Cifra de
verdade que não abre continua aparecendo.

Você não precisa fazer nada para adotar: aplicar a atualização basta, e as
credenciais já gravadas seguem onde estão.
