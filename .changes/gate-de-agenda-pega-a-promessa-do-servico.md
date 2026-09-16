---
impacto: nada_mudou
secao: corrigido
titulo: O agente não promete mais checar horário sem checar — inclusive quando promete "organizar o atendimento"
---
Um agente com as capacidades de agenda ligadas ("Ver horários livres na agenda", "Marcar consulta ou sessão") respondia ao cliente com "vou verificar/organizar seu atendimento" e nunca consultava a agenda de verdade: o cliente ficava sem horário e sem resposta. Havia uma trava determinística para isso — a mensagem que promete uma checagem só sai depois que a ferramenta foi de fato chamada —, mas ela reconhecia a promessa apenas quando o texto dizia "horário", "agenda", "disponibilidade", "agendamento", "marcação", "encaixe" ou "vaga". Duas palavras ficavam de fora e é justamente por elas que o caso escapava:

- **o nome do serviço**: "atendimento", "consulta", "sessão" são o que a própria tela chama de serviço na hora de agendar, então é o substantivo que o agente usa quando promete olhar a agenda;
- **o verbo "organizar"**: prometer "organizar o atendimento" é a mesma promessa vazia de "verificar o atendimento", dita de outro jeito.

Com a trava enxergando essas frases, o agente que promete olhar a agenda é obrigado a consultá-la no mesmo turno — e responde com os horários reais (ou explica o que impediu), em vez de deixar o cliente esperando. Conversa comum que só menciona o atendimento ("o atendimento de vocês é ótimo") continua passando normalmente.
