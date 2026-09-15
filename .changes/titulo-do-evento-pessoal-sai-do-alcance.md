---
impacto: nada_mudou
secao: corrigido
titulo: O nome do compromisso pessoal da agenda do Google deixa de ficar ao alcance dos colegas
---
Quem conecta a agenda pessoal do Google ao CRM costuma fazer isso só para os horários ocupados contarem na agenda da equipe. A tela nunca mostrou o nome desses compromissos, mas a permissão do banco deixava qualquer pessoa da organização, inclusive com acesso somente leitura, consultá-lo diretamente com o próprio login.

Na prática, só havia nome para ler em agendas sincronizadas antes da versão 1.17.0. Desde ela, o serviço que sincroniza com o Google guarda só o horário, sem o nome, e apaga o nome que encontra quando atualiza o evento. O que sobra são compromissos gravados antes disso e ainda não atualizados — sobretudo os que já passaram, até a limpeza automática removê-los (por padrão, 90 dias depois de terminarem).

Agora nenhum login de usuário lê esse nome — nem os colegas, nem a própria pessoa que conectou a agenda, já que nenhuma tela o exibia. Os horários ocupados continuam contando exatamente como antes. Esta versão não apaga os nomes que sobraram: ela fecha a leitura.

Continua ao alcance de qualquer pessoa da organização o identificador de cada agenda sincronizada — que, na agenda principal do Google, é o e-mail da conta conectada. Fechar isso exige mudar a forma como a tela da Agenda busca a ocupação, e não entra nesta correção.
