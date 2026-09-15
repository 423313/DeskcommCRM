"""
workers/voice-agent-pipecat/main.py

Servidor TCP AudioSocket + pipeline Pipecat, substituindo
workers/voice-agent/audioSocketBridge.ts (a PONTE de áudio/LLM por chamada,
só ela — ARI/Stasis/contatos/leads continuam no worker Node,
workers/voice-agent/index.ts, sem mudança nenhuma). Ver o plano
(glowing-squishing-boot.md, Fase 1) pro raciocínio completo.

Porta de teste por padrão (AUDIOSOCKET_PIPECAT_PORT, default 9093) —
DIFERENTE da porta do worker Node (9092). Os dois rodam lado a lado até a
validação ao vivo (rollout do plano) trocar o dialplan de produção pra cá.

Fluxo por conexão:
  1. Lê o primeiro frame (deve ser 0x01 UUID, 16 bytes) — MESMO protocolo que
     bytesToUuid/drainFrames em TS. Rejeita e fecha se não for.
  2. Acha a linha em voice_calls por asterisk_channel_id = uuid (criada antes
     pelo worker Node, seja fluxo de entrada ou saída).
  3. Busca o agente de voz ativo da organização (config.py).
  4. Monta AudioSocketTransport + OpenAIRealtimeLLMService (GA) + tools +
     Pipeline, roda até `encerrar_chamada` ser chamada (e o turno terminar
     de falar) ou o socket cair.
  5. Grava transcript + status final em voice_calls.
"""

import asyncio
import os
import struct
import sys
from datetime import datetime, timezone

from loguru import logger

from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker, ProcessorUnusablePolicy
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.services.openai.realtime.events import (
    AudioConfiguration,
    AudioInput,
    AudioOutput,
    InputAudioTranscription,
    PCMUAudioFormat,
    SemanticTurnDetection,
    SessionProperties,
)
from pipecat.services.openai.realtime.llm import OpenAIRealtimeLLMService
from pipecat.workers.runner import WorkerRunner

sys.path.insert(0, os.path.dirname(__file__))
from config import (  # noqa: E402
    finalize_call,
    get_active_voice_agent,
    get_admin_client,
    find_call_by_asterisk_channel_id,
    mark_call_connected,
)
from tools import CallContext, make_consultar_conhecimento, make_encerrar_chamada  # noqa: E402
from transport import AudioSocketTransport, FRAME_TYPE_UUID  # noqa: E402

AUDIOSOCKET_PORT = int(os.environ.get("AUDIOSOCKET_PIPECAT_PORT", "9093"))

ENCERRAR_CHAMADA_TOOL_NAME = "encerrar_chamada"
CONSULTAR_CONHECIMENTO_TOOL_NAME = "consultar_conhecimento"

INSTRUCAO_ENCERRAR_CHAMADA = """

Quando a conversa chegar a uma conclusão natural (o cliente se despediu, o
assunto foi resolvido, ou não há mais nada a tratar), diga a despedida em
voz e, na mesma resposta, chame a function "encerrar_chamada" para desligar
a ligação. Não chame antes de terminar de falar a despedida.

Quando o cliente perguntar algo específico da empresa (preço, política,
horário, procedimento, catálogo) que você não tem certeza, chame a function
"consultar_conhecimento" com a pergunta antes de responder — não invente.
Se a busca não achar nada, diga que vai verificar e retornar, não afirme um
fato sem fonte."""


def _bytes_to_uuid(buf: bytes) -> str:
    hexstr = buf.hex()
    return f"{hexstr[0:8]}-{hexstr[8:12]}-{hexstr[12:16]}-{hexstr[16:20]}-{hexstr[20:32]}"


async def _read_uuid_frame(reader: asyncio.StreamReader) -> tuple[str, bytes]:
    """Lê só o primeiro frame (deve ser UUID) antes de montar o transporte —
    mesmo padrão de startAudioSocketServer em TS (onFirstData), inclusive o
    "leftover": se algum byte de áudio já veio grudado no mesmo pacote TCP
    do frame de UUID, devolve pra reinjetar depois."""
    buf = b""
    while len(buf) < 3:
        chunk = await reader.read(4096)
        if not chunk:
            raise ConnectionError("socket fechado antes do frame de UUID")
        buf += chunk
    frame_type, length = struct.unpack(">BH", buf[:3])
    while len(buf) < 3 + length:
        chunk = await reader.read(4096)
        if not chunk:
            raise ConnectionError("socket fechado no meio do frame de UUID")
        buf += chunk
    if frame_type != FRAME_TYPE_UUID:
        raise ValueError(f"primeiro frame não é UUID (tipo 0x{frame_type:02x})")
    uuid = _bytes_to_uuid(buf[3 : 3 + length])
    leftover = buf[3 + length :]
    return uuid, leftover


async def handle_connection(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    peer = writer.get_extra_info("peername")
    try:
        uuid, leftover = await _read_uuid_frame(reader)
    except Exception as err:
        logger.error(f"[audiosocket] {peer}: {err}")
        writer.close()
        return

    logger.info(f"[audiosocket] {peer}: uuid={uuid}")

    if leftover:
        # Reinjeta os bytes que vieram grudados — um StreamReader não tem
        # "unread", então empurramos manualmente pro início do buffer do
        # reader via um feed direto no protocolo não é exposto aqui; a
        # forma simples é um wrapper que devolve o leftover na primeira
        # leitura. Ver _LeftoverReader abaixo.
        reader = _LeftoverReader(reader, leftover)

    admin = get_admin_client()
    call_row = await find_call_by_asterisk_channel_id(admin, uuid)
    if not call_row:
        logger.error(f"[audiosocket] uuid {uuid} não corresponde a nenhuma voice_calls — encerrando")
        writer.close()
        return

    agent = await get_active_voice_agent(admin, call_row["organization_id"])
    if not agent:
        logger.error(f"[audiosocket] nenhum agente de voz ativo pra org {call_row['organization_id']}")
        writer.close()
        return

    call_ctx = CallContext(
        call_id=call_row["id"],
        organization_id=call_row["organization_id"],
        agent_id=agent.id,
        rag_top_k=agent.rag_top_k,
        rag_similarity_threshold=agent.rag_similarity_threshold,
    )

    hangup_event = asyncio.Event()
    transport = AudioSocketTransport(reader, writer, on_hangup=lambda: hangup_event.set())

    llm = OpenAIRealtimeLLMService(
        api_key=agent.api_key,
        settings=OpenAIRealtimeLLMService.Settings(
            model=agent.voice_model,
            system_instruction=agent.system_prompt + INSTRUCAO_ENCERRAR_CHAMADA,
            session_properties=SessionProperties(
                audio=AudioConfiguration(
                    input=AudioInput(
                        # mu-law 8kHz, IGUAL ao worker TS -- OpenAIRealtimeLLMService
                        # manda o audio de entrada cru pra API (visto no
                        # codigo-fonte, sem reamostrar), entao o formato da
                        # sessao precisa bater com o que o AudioSocketTransport
                        # entrega (ver transport.py, audioop.lin2ulaw). Sem
                        # isto a sessao assume PCM 24kHz por padrao e nosso
                        # audio de 8kHz vira ruido pro VAD/transcricao dela --
                        # confirmado ao vivo (15/09): a IA se apresentava mas
                        # nunca entendia nada do chamador.
                        format=PCMUAudioFormat(),
                        transcription=InputAudioTranscription(language="pt"),
                        # eagerness "low": mesmo ajuste já testado ao vivo em
                        # TS — espera mais confiança antes de considerar que a
                        # pessoa terminou de falar, custa alguma latência mas
                        # evita a IA emendar resposta em cima de ruído/eco.
                        turn_detection=SemanticTurnDetection(eagerness="low"),
                    ),
                    output=AudioOutput(voice=agent.voice, speed=agent.voice_speed),
                ),
            ),
        ),
    )

    encerrar_chamada = make_encerrar_chamada(call_ctx)
    consultar_conhecimento = make_consultar_conhecimento(call_ctx)

    context = LLMContext([], [encerrar_chamada, consultar_conhecimento])
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(context)

    transcript: list[dict] = []

    @user_aggregator.event_handler("on_user_turn_message_added")
    async def _on_user_turn(aggregator, message):
        if message.content:
            transcript.append(
                {"speaker": "customer", "text": message.content, "ts": datetime.now(timezone.utc).isoformat()}
            )

    @assistant_aggregator.event_handler("on_assistant_turn_stopped")
    async def _on_assistant_turn(aggregator, message):
        if message.content:
            transcript.append(
                {"speaker": "agent", "text": message.content, "ts": datetime.now(timezone.utc).isoformat()}
            )
        # `encerrar_chamada` só marca a intenção — o desligamento de verdade
        # acontece AQUI, depois que este turno (a fala da despedida) já
        # terminou de tocar. Fazer isso na tool call direto cortaria a
        # despedida no meio (mesmo bug que o pacer em TS evitava).
        if call_ctx.end_requested:
            hangup_event.set()

    pipeline = Pipeline(
        [
            transport.input(),
            user_aggregator,
            llm,
            transport.output(),
            assistant_aggregator,
        ]
    )

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
        processor_unusable_policy=ProcessorUnusablePolicy.END,
    )

    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)

    answered_at = datetime.now(timezone.utc)
    await mark_call_connected(admin, call_row["id"], answered_at.isoformat())

    run_task = asyncio.ensure_future(runner.run())

    # A IA fala primeiro (greeting) — mesmo comportamento de produção hoje.
    # AJUSTAR NO TESTE AO VIVO se a primeira fala vier cedo demais (antes do
    # transporte estar de fato pronto) ou atrasada: é o ponto mais provável
    # de precisar de sincronização mais fina que um sleep fixo.
    await asyncio.sleep(0.2)
    await worker.queue_frames([LLMRunFrame()])

    await hangup_event.wait()
    await runner.cancel()
    try:
        await run_task
    except Exception:
        pass

    ended_at = datetime.now(timezone.utc)
    duration_ms = int((ended_at - answered_at).total_seconds() * 1000)
    await finalize_call(admin, call_row["id"], ended_at.isoformat(), duration_ms, transcript)
    logger.info(f"[audiosocket] call={call_row['id']} finalizada, duration_ms={duration_ms}")

    if not writer.is_closing():
        writer.close()


class _LeftoverReader:
    """Wrapper mínimo: devolve `leftover` na primeira leitura, delega o
    resto pro StreamReader real. Só implementa `read`, que é tudo que
    AudioSocketInputTransport usa."""

    def __init__(self, reader: asyncio.StreamReader, leftover: bytes):
        self._reader = reader
        self._leftover = leftover

    async def read(self, n: int = -1) -> bytes:
        if self._leftover:
            chunk, self._leftover = self._leftover, b""
            return chunk
        return await self._reader.read(n)


async def main() -> None:
    required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "AI_CRED_AES_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise RuntimeError(f"[voice-agent-pipecat] env faltando: {', '.join(missing)}")

    async def _on_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            await handle_connection(reader, writer)
        except Exception as err:
            logger.exception(f"[audiosocket] erro não tratado na conexão: {err}")
            if not writer.is_closing():
                writer.close()

    server = await asyncio.start_server(_on_client, "0.0.0.0", AUDIOSOCKET_PORT)
    logger.info(f"[voice-agent-pipecat] servidor TCP escutando na porta {AUDIOSOCKET_PORT}")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
