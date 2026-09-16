/**
 * Ordem entre duas versões `x.y.z`, a única forma que o contrato admite (o catálogo e o manifesto
 * recusam qualquer outra). Negativo quando `a` é menor, zero quando iguais, positivo quando maior.
 * É o que separa "Atualizar para" de "Trocar para" uma versão menor.
 */
export function compararVersoes(a: string, b: string): number {
  const partes = (versao: string) => versao.split(".").map((parte) => Number.parseInt(parte, 10));
  const [pa, pb] = [partes(a), partes(b)];
  for (let indice = 0; indice < 3; indice += 1) {
    const diferenca = (pa[indice] ?? 0) - (pb[indice] ?? 0);
    if (Number.isFinite(diferenca) && diferenca !== 0) return diferenca;
  }
  return 0;
}
