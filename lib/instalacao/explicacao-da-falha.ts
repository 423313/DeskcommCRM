/** O que dizer a quem está INSTALANDO, por balde de erro. Sem import nenhum de
 * propósito: quem lê a prova de crédito é uma tela `"use client"`, e
 * `prova-de-credito.ts` arrasta o runtime do modelo para o bundle do browser. */
export function explicacaoParaQuemInstala(codigo: string): string {
  switch (codigo) {
    case "limite_ou_saldo":
      return "A empresa de IA recusou por falta de saldo ou limite de uso. Adicione crédito na conta dela — sem isso ele não responde a nenhum cliente.";
    case "credencial_recusada":
      return "A empresa de IA não aceitou esta chave. Confira se ela foi colada inteira e se é a chave do provedor escolhido.";
    case "modelo_inexistente":
      return "A empresa de IA não reconhece o modelo escolhido para ele. Dá para escolher outro em IA › Provedores.";
    case "provedor_indisponivel":
      return "Não consegui falar com a empresa de IA agora — rede ou serviço fora do ar. Isto não é a chave: tente de novo em minutos.";
    default:
      return "A empresa de IA recusou a chamada de teste, e não sei dizer o motivo pelo que ela respondeu. Confira o saldo e a chave na conta da empresa de IA.";
  }
}