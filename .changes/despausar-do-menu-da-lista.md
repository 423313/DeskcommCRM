---
impacto: nada_mudou
secao: corrigido
titulo: O Despausar do menu da lista volta a funcionar para os agentes-molde
---

No menu de ações de cada linha da lista de agentes, o item Despausar nascia
bloqueado para os agentes do tipo mcp_agent — que são justamente os
agentes-molde criados com a instalação (Atendimento, Agendamento, Financeiro).
O Pausar logo abaixo não tinha essa trava, então quem pausava um desses agentes
ficava sem nenhuma forma de despausar pela lista: o item aparecia apagado, sem
aviso e sem explicação, e a única saída era abrir a página do agente.

Agora as duas ações se comportam igual. Continua bloqueado só o que faz sentido
bloquear: agente arquivado (nem pausa, nem despausa) e agente sem versão
publicada — este último clicável de propósito, para que a tentativa diga em
português o motivo, que é concluir a configuração e publicar uma versão.
Nenhuma permissão, nenhum dado e nenhum fluxo de conversa mudam com isso.
