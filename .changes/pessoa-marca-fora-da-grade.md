---
impacto: capacidade_nova
secao: adicionado
titulo: A agenda aceita encaixe fora da grade quando quem marca é da equipe
---

O sistema oferece horários numa grade fixa: a partir do começo de cada faixa do
expediente, de duração em duração. Isso vale para o que o assistente oferece ao
cliente — mas quem atende precisa poder marcar o que combinou por fora dela: o
cliente que só pode 10:30, o encaixe, o atendimento que começa mais cedo.

Antes, o servidor recusava todo horário fora da grade, viesse de quem viesse, e a
saída era mudar o horário do cliente para caber numa régua interna.

Agora, quando quem marca é **uma pessoa da equipe logada no sistema**, o servidor
aceita horário fora da grade, até fora do expediente, desde que o responsável já
tenha publicado seus horários de atendimento. A tela ainda não tem onde escolher
esse horário: o painel de marcação e o arrastar na agenda continuam mostrando só
os horários da grade.

O assistente e as integrações por token não ganham o encaixe: para eles o horário
continua tendo de ser um da grade do expediente, respeitando a antecedência mínima
e a janela de reserva do tipo.

Para os dois, o sistema recusa marcar em cima de outro agendamento do mesmo
responsável (cancelado ou falta não contam), ou de um evento do Google Agenda dele
numa agenda marcada como "Conta como ocupado" (evento marcado como "Disponível" no
Google não conta). A conferência do Google tem dois limites.

O primeiro: ela só conhece o que a sincronização já trouxe, que vai de um dia atrás
até cerca de 90 dias à frente. Marcar depois desse período, ou em cima de um evento
criado no Google e ainda não sincronizado, passa. Para períodos fora da
sincronização, a tela de horários avisa "Ocupação do Google ainda não verificada
neste período."

O segundo: uma pessoa com papel de Atendente, marcando na agenda de outra pessoa,
não enxerga o Google Agenda dela, e a marcação passa. O próprio responsável,
gerentes e administradores enxergam.
