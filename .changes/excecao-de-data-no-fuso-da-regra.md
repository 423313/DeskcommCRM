---
impacto: nada_mudou
secao: corrigido
titulo: O dia bloqueado também vale para o horário da noite
---
Em agendas com fuso negativo, uma consulta no fim do dia podia ser marcada num dia bloqueado. As exceções de data passam a ser buscadas pelo dia local da jornada, e não pelo dia UTC do horário pedido — o mesmo dia que a grade pergunta. A conferência de ocupação da tela e a da escrita usam a mesma leitura, então as duas mudam juntas.
