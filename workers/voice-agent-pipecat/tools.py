"""
Tools (function calling) do agente de voz — porta de audioSocketBridge.ts
(ENCERRAR_CHAMADA_TOOL_NAME / CONSULTAR_CONHECIMENTO_TOOL_NAME).

Cada função aqui é uma tool no formato que o Pipecat espera: assinatura
tipada + docstring (usados pra gerar o schema automaticamente), primeiro
parâmetro `FunctionCallParams`, resultado devolvido via
`params.result_callback(...)`. Fechadas sobre `CallContext` (closure) porque
cada ligação tem organização/agente/estado diferentes — não são globais.

`encerrar_chamada` só marca `ctx.end_requested = True`; quem realmente
desliga é main.py, no evento `on_assistant_turn_stopped` do
assistant_aggregator — só nesse ponto o turno (incluindo a fala da
despedida) já terminou de verdade. Fazer o desligamento aqui, direto,
cortaria a despedida no meio, exatamente o bug que o pacer em TS
(pumpOutboundQueue) existia pra evitar.
"""

import os
from dataclasses import dataclass, field

import httpx
from loguru import logger

from pipecat.services.llm_service import FunctionCallParams

INTERNAL_API_BASE = os.environ.get("INTERNAL_API_BASE", "http://app:3005")
INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")


@dataclass
class CallContext:
    call_id: str
    organization_id: str
    agent_id: str
    rag_top_k: int
    rag_similarity_threshold: float
    end_requested: bool = False


def make_encerrar_chamada(ctx: CallContext):
    async def encerrar_chamada(params: FunctionCallParams):
        """Encerra a ligação. Use depois de dizer a despedida final ao
        cliente, quando a conversa chegou a uma conclusão natural."""
        logger.info(f"[tools] call={ctx.call_id} agente pediu pra encerrar a chamada")
        ctx.end_requested = True
        await params.result_callback({"ok": True})

    return encerrar_chamada


def make_consultar_conhecimento(ctx: CallContext):
    async def consultar_conhecimento(params: FunctionCallParams, pergunta: str):
        """Busca na base de conhecimento da empresa (documentos, FAQ,
        políticas, catálogo) por uma pergunta específica do cliente. Use
        antes de responder algo que dependa de informação da empresa que
        você não tem certeza.

        Args:
            pergunta: A pergunta ou tópico a buscar na base de conhecimento.
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{INTERNAL_API_BASE}/api/internal/voice/knowledge-search",
                    headers={"x-internal-secret": INTERNAL_SECRET},
                    json={
                        "organization_id": ctx.organization_id,
                        "agent_id": ctx.agent_id,
                        "pergunta": pergunta,
                        "top_k": ctx.rag_top_k,
                        "limiar": ctx.rag_similarity_threshold,
                    },
                )
                resp.raise_for_status()
                trechos = resp.json().get("data", {}).get("trechos", [])
        except Exception as err:
            logger.error(f"[tools] call={ctx.call_id} busca de conhecimento falhou: {err}")
            await params.result_callback(
                "A base de conhecimento está indisponível agora -- responda com o que "
                "você já sabe e não invente fatos."
            )
            return

        if not trechos:
            await params.result_callback(
                "Nada encontrado na base de conhecimento para esta pergunta -- responda "
                "com o que você já sabe e não invente fatos."
            )
            return

        texto = "\n\n".join(
            f"[{t.get('source_name') or 'material'}] {t.get('content', '')}" for t in trechos
        )
        await params.result_callback(texto)

    return consultar_conhecimento
