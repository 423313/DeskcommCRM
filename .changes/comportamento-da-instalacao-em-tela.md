---
impacto: capacidade_nova
secao: adicionado
titulo: O comportamento da instalação ganha tela no Admin
---

Quatro decisões que valem para a instalação inteira passam a se tomar na tela
**Comportamento** (`/admin/sistema`), em vez de editar arquivo de servidor:

- **Orçamento de IA** — se a IA respeita o teto que cada empresa escolheu, se
  só avisa quem opera, ou sem proteção.
- **Assinatura de webhook** — se toda entrega do canal precisa vir assinada
  com o segredo da sessão. Ligar exige que o servidor do canal assine: sem
  isso, a entrada de mensagens para.
- **Divulgação de pagamento** — se a divulgação entra na primeira mensagem ou
  se o envio sem ela é bloqueado e devolvido ao modelo.
- **Conferência de promessa** — se cada envio passa por uma conferência de
  modelo antes de sair.

O arquivo de ambiente continua valendo como **piso**: uma instalação que nunca
abriu esta tela segue exatamente como estava, e o valor de lá só perde para o
que for salvo aqui. Nada muda sozinho depois da atualização — nenhuma destas
quatro chaves troca de valor sem alguém salvar na tela.

Quem não é administrador da instalação não vê a tela, e cada salvamento fica
registrado na auditoria com autor e hora.
