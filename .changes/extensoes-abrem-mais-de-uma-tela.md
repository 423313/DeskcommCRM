---
impacto: capacidade_nova
secao: adicionado
titulo: Uma extensão passa a abrir outras telas além de Tarefas
---

Até agora, o botão de uma extensão instalada só levava a um lugar: a tela de
Tarefas. Na prática isso deixava todas as extensões iguais por dentro — o que
mudava de uma para outra era só o texto.

Agora o pacote pode apontar para seis telas de trabalho: Tarefas, Conversas,
Funil, Contatos, Agenda e Radar. Um guia de recepção de clínica leva a pessoa
para as conversas de quem não remarcou; um de e-commerce leva ao funil na hora
de mover o negócio parado.

**O que a extensão continua não podendo fazer, e isso é de propósito:** ela não
escolhe um endereço. Ela pede uma porta pelo nome, de uma lista fechada, e o
sistema traduz esse nome no destino. Configuração, chaves de API, provedores de
IA, webhooks e a área de administração ficam fora da lista — uma extensão
orienta o trabalho, nunca leva alguém para onde a instalação guarda segredo.

**O que muda na tela de quem administra:** ao instalar, a lista de portas que a
extensão vai usar aparece antes de você aceitar. E uma versão nova que peça
portas diferentes das que a sua organização aceitou é **recusada** — ela não
passa a abrir telas novas em silêncio numa atualização. Quem precisa de outro
conjunto publica outra extensão.

**Se você já tem extensão instalada:** pacotes escritos para a versão anterior
do formato deixam de ser compatíveis, porque foi o próprio autor que declarou
até onde garantia o funcionamento. A tela de Extensões mostra o estado de cada
um; peça ao autor a versão atualizada. Nada é desinstalado sozinho e nenhuma
configuração é perdida.
