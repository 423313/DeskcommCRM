---
impacto: nada_mudou
secao: corrigido
titulo: O agente passa a saber os DOIS passos da agenda — e não promete mais checar sem checar
---
Um agente com as capacidades de agenda ligadas ("Ver o que a empresa atende", "Ver horários livres na agenda", "Marcar consulta ou sessão") respondia ao cliente com "vou verificar/organizar seu atendimento" e nunca consultava a agenda: o cliente ficava sem horário e sem resposta. Eram dois buracos, e os dois estão fechados.

**1. O primeiro passo não era ensinado.** Falar de horário real exige duas coisas: o TIPO de atendimento (o `slug`) e os horários daquele tipo — e o segundo passo precisa do `slug` que o primeiro devolve. O bloco de instruções que o agente recebe nomeava `crm_find_free_slots` em toda frase e `crm_list_event_types` em nenhuma: a cadeia existia só na descrição da própria ferramenta, que o modelo lê por último e sem peso de instrução. Agora o agente que tem as duas ferramentas recebe também a instrução dos dois passos, dizendo que a lista não é a resposta e que o `slug` sai dela — e que inventar um `slug` não vale.

**2. A trava não reconhecia a promessa.** Havia uma trava determinística para isto — a mensagem que promete uma checagem só sai depois que a ferramenta foi de fato chamada —, mas ela reconhecia a promessa apenas quando o texto dizia "horário", "agenda", "disponibilidade", "agendamento", "marcação", "encaixe" ou "vaga". Duas palavras ficavam de fora, e é justamente por elas que o caso escapava:

- **o nome do serviço**: "atendimento", "consulta" e "sessão" são o que a própria tela chama de serviço na hora de agendar;
- **o verbo "organizar"**: prometer "organizar o atendimento" é a mesma promessa vazia de "verificar o atendimento", dita de outro jeito.

Com a trava enxergando essas frases, o agente que promete olhar a agenda é obrigado a consultá-la no mesmo turno — e responde com os horários reais (ou explica o que impediu), em vez de deixar o cliente esperando. Conversa comum que só menciona o atendimento ("o atendimento de vocês é ótimo") continua passando normalmente.
