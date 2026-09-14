---
impacto: capacidade_nova
secao: corrigido
titulo: Quem cria uma organização para outra pessoa sai dela quando essa pessoa assume
---

Ao criar uma organização pelo painel de plataforma, quem cria entra nela como
administrador. Isso é necessário: sem ninguém dentro, a organização nasceria
inacessível e nem daria para configurá-la antes de entregar.

O que faltava era a saída. Nada nunca tirava o criador de lá — a aba "Equipe" do
painel de plataforma está desativada, a tela da organização recusa que alguém
revogue o próprio acesso, e a jornada de convite não sabia da existência do
criador.

Na prática, quem instala o sistema para clientes ficava dentro da empresa de cada
um deles, para sempre. O cliente abria Equipe › Membros e encontrava o e-mail
pessoal de quem instalou listado como se fosse um colega da equipe: ocupando uma
vaga, aparecendo como responsável possível na Agenda, e podendo ser removido por
ele — enquanto quem estava lá não tinha como sair.

Agora, quando a organização é criada para outra pessoa,
**o vínculo de quem cria nasce marcado como provisório.** Ele existe só para a empresa não nascer vazia, e
sai sozinho no momento em que a entrega se completa: quando o dono aceita o
convite. Até lá o criador continua dentro, então a organização nunca fica sem
ninguém.

Quem cria uma organização **para si mesmo** não é afetado — nem quem criou
a sua pelo cadastro normal. O vínculo dessas pessoas não recebe a marca e nada nesta
versão volta a tocá-lo.

**Organizações criadas antes desta versão não mudam.** Vínculos antigos não têm a
marca, e o sistema não tenta adivinhá-la: se numa instalação existe um criador
que deveria ter saído, a remoção é feita à mão, com alguém olhando o caso. Essa
escolha é deliberada — uma versão anterior desta correção tentou deduzir quem
deveria sair e acertou o alvo errado.

Você não precisa fazer nada para adotar.
