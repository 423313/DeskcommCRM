import { lookup } from "node:dns/promises";

import { env } from "@/lib/env";

/**
 * A LISTA DE DESTINOS INTERNOS DO DONO DA INSTALAÇÃO — decisão 22-d, #1004.
 *
 * ═══ Por que ela existe ═══
 *
 * O PR #964 fechou a saída para a rede de dentro: `assertSafeOutboundUrl`
 * (`outbound-url.ts`) recusa `localhost`, `127.`, `10.`, `192.168.`, `169.254.`
 * e `172.16/12` pelo TEXTO da URL, e `assertDestinoResolvidoSeguro`
 * (`outbound-ip.ts`) recusa o mesmo pelo IP que o nome resolve. A proteção
 * continua de pé — o que faltava era a válvula de quem PAGA a máquina. Quem
 * roda um Whisper ou um gateway compatível na própria rede não tinha como
 * apontar a instalação para ele, e a tela de Provedores prometia o contrário
 * sem ressalva.
 *
 * Quem edita esta lista é quem opera o servidor: o `.env` é o mesmo lugar — e
 * o mesmo nível de confiança — do banco e das chaves. A ORGANIZAÇÃO, sozinha,
 * continua sem poder: ela não escreve neste arquivo, e o degrau que impede a
 * chave da INSTALAÇÃO de sair para um endereço escolhido por ela continua de
 * pé em `workers/media-derive-worker.ts`.
 *
 * ═══ Formato ═══
 *
 * Vírgula separa as entradas; espaço em volta é ignorado. Cada entrada é um
 * nome ou IPv4 exato (`coletor.interno.exemplo`, `10.1.2.7`) ou uma faixa CIDR
 * IPv4 (`10.1.0.0/16`). Não há curinga — `*` não casa nada —, e porta não
 * entra na entrada: quem recusa é o HOST, então a autorização também é por
 * host. Entrada que não seja uma dessas duas formas é IGNORADA, e ignorar é
 * RECUSAR (fail-closed): erro de digitação no `.env` não abre a rede por
 * acidente, só deixa de liberar o que o operador queria. Literal IPv6 fica de
 * fora, como já fica no guarda de URL (o ponytail de `outbound-url.ts` explica
 * por quê). Vazio é ausente, como no resto do `.env`: sem a variável, nada
 * passa.
 */

/** Uma entrada já validada da lista: um endereço exato ou uma faixa IPv4. */
type Autorizacao =
  | { tipo: "endereco"; endereco: string }
  | { tipo: "faixa"; base: number; mascara: number };

/** O IPv4 como inteiro sem sinal, ou null quando o texto não é um IPv4. */
function ipv4ParaInteiro(texto: string): number | null {
  const partes = texto.split(".");
  if (partes.length !== 4) return null;
  let valor = 0;
  for (const parte of partes) {
    if (!/^\d{1,3}$/.test(parte)) return null;
    const octeto = Number(parte);
    if (octeto > 255) return null;
    valor = valor * 256 + octeto;
  }
  return valor;
}

/** O host como o guarda o vê: minúsculo, sem ponto final. Null = não é host. */
function normalizarHost(texto: string): string | null {
  const cru = texto.trim().toLowerCase().replace(/\.$/, "");
  if (!cru) return null;
  if (cru.includes(":") || cru.includes("/") || cru.includes("*") || cru.includes(" ")) return null;
  return cru;
}

function dentroDaFaixa(ip: number, base: number, mascara: number): boolean {
  return ((ip & mascara) >>> 0) === ((base & mascara) >>> 0);
}

/**
 * As entradas que o `.env` declarou, já validadas — o que não passa no formato
 * simplesmente não entra. Lê o `env` a cada chamada de propósito: quem opera o
 * servidor muda a lista e reinicia o processo, e um cache aqui faria a válvula
 * mentir entre o reinício e a primeira leitura.
 */
export function autorizacoesDeclaradas(
  bruto: string = env.IA_DESTINOS_INTERNOS_PERMITIDOS,
): Autorizacao[] {
  const saida: Autorizacao[] = [];
  for (const item of bruto.split(",")) {
    const entrada = item.trim().toLowerCase();
    if (!entrada) continue;

    if (entrada.includes("/")) {
      const [rede, bits] = entrada.split("/");
      const base = ipv4ParaInteiro(rede ?? "");
      const prefixo = Number(bits);
      if (base === null || !/^\d{1,2}$/.test(bits ?? "") || prefixo > 32) continue;
      saida.push({ tipo: "faixa", base, mascara: (0xffffffff << (32 - prefixo)) >>> 0 });
      continue;
    }

    const endereco = normalizarHost(entrada);
    if (endereco) saida.push({ tipo: "endereco", endereco });
  }
  return saida;
}

/**
 * A lista cobre este host/IP literal? É o passo de graça — não resolve nada.
 * Um literal IPv4 na lista é julgado contra as faixas também, porque é assim
 * que o operador lê `10.1.0.0/16`: "tudo o que está aí dentro, inclusive o IP
 * que eu escrever no endereço".
 */
export function listaCobreHost(host: string, autorizacoes: Autorizacao[]): boolean {
  const alvo = normalizarHost(host);
  if (!alvo) return false;
  const ipDoAlvo = ipv4ParaInteiro(alvo);
  return autorizacoes.some((a) => {
    if (a.tipo === "endereco") return a.endereco === alvo;
    return ipDoAlvo !== null && dentroDaFaixa(ipDoAlvo, a.base, a.mascara);
  });
}

/**
 * O DONO DA INSTALAÇÃO autorizou este endereço? Quando sim, a recusa de
 * destino não se aplica — a lista dele vem ANTES dos dois guardas, senão ela
 * não existiria para o caso que a criou: um NOME interno, que o guarda textual
 * deixa passar e o de DNS recusa depois de resolver.
 *
 * ═══ O que a lista autoriza — e o que ela NÃO autoriza ═══
 *
 * Autoriza ENDEREÇO, nunca credencial: quem chama continua obrigado a manter o
 * degrau de quem é a chave. Endereço que não dá para ler como URL, ou que não
 * casa entrada nenhuma, devolve `false` — e `false` é o caminho de sempre,
 * com a recusa de sempre.
 *
 * Faixa declarada + nome no endereço: só autoriza quando TODOS os IPs que o
 * nome resolve caem dentro de alguma faixa declarada. Um nome que resolve para
 * dentro e para fora ao mesmo tempo não passa — meia autorização num destino
 * é o jeito mais barato de furar uma autorização. Sem faixa na lista não há o
 * que resolver, e este passo não paga DNS nenhum.
 */
export async function donoDaInstalacaoAutorizou(endereco: string): Promise<boolean> {
  const autorizacoes = autorizacoesDeclaradas();
  if (autorizacoes.length === 0) return false;

  let host: string;
  try {
    host = new URL(endereco).hostname;
  } catch {
    return false;
  }

  if (listaCobreHost(host, autorizacoes)) return true;

  const faixas = autorizacoes.filter((a) => a.tipo === "faixa");
  if (faixas.length === 0) return false;
  // Literal já foi julgado acima: só nome tem o que resolver.
  if (ipv4ParaInteiro(normalizarHost(host) ?? "") !== null) return false;

  const resolvidos = await lookup(host, { all: true }).catch(() => []);
  if (resolvidos.length === 0) return false;
  return resolvidos.every((r) => {
    const ip = ipv4ParaInteiro(r.address);
    return ip !== null && faixas.some((f) => dentroDaFaixa(ip, f.base, f.mascara));
  });
}
