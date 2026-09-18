---
impacto: nada_mudou
secao: corrigido
titulo: Conserto do sistema passa a valer já na primeira atualização, não na seguinte
---
A atualização carregava as rotinas do instalador antes de trocar para a versão nova, então um conserto que vivesse numa dessas rotinas só entrava em vigor na atualização seguinte. Foi o que aconteceu com o conserto que tira o segredo da linha de tarefas agendadas: quem atualizou continuava com a linha antiga até rodar a atualização outra vez.

Não há nada a fazer: a próxima atualização aplica a correção sozinha — e, desta vez, numa passada só.
