---
impacto: nada_mudou
secao: corrigido
titulo: PDF sem texto deixa de virar "falha de infraestrutura" quando a frase do erro mudar
---

A leitura de PDF distingue dois casos: o arquivo que abriu inteiro e não tem letra selecionável (é conteúdo, não defeito) e a falha de verdade ao ler. Até agora essa distinção era feita comparando a FRASE do erro, em inglês. Passa a ser feita por um motivo próprio, que não muda quando alguém traduzir ou reescrever a mensagem — e alguém vai traduzir, porque essa frase chega a quem usa.

Sem isso, no dia em que a frase mudasse, todo PDF escaneado passaria a ser registrado como falha de infraestrutura, enchendo o log de alarme falso e escondendo a falha real no meio.

Nada a fazer na instalação.
