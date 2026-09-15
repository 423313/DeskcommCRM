"""
AudioSocketTransport — transporte Pipecat pro protocolo AudioSocket do
Asterisk (TCP puro, sem handshake HTTP/WebSocket).

Não existe pronto no Pipecat (feature request aberta,
pipecat-ai/pipecat#2702) — confirmado via pesquisa antes de escrever isto.
Implementado seguindo o contrato mínimo real de BaseInputTransport/
BaseOutputTransport (visto em pipecat/transports/local/audio.py, o exemplo
mais simples do próprio repo): input só precisa chamar
`self.push_audio_frame(InputAudioRawFrame(...))` quando chega áudio, e
output só precisa implementar `write_audio_frame(frame) -> bool`.

PACING MANUAL, sim — testado ao vivo (15/09) e confirmado necessário: lendo
o código-fonte de `BaseOutputTransport._audio_task_handler`, o laço de saída
do Pipecat só puxa da fila e chama `write_audio_frame` o mais rápido
possível — ele conta com o DISPOSITIVO real (placa de som, WebRTC) pra
pacear sozinho, o que nunca acontece com um socket TCP cru. Resultado ouvido
ao vivo: áudio saiu extremamente acelerado e depois emudeceu (a fila
inteira foi escrita de uma vez, sem pacing, e o resto da ligação ficou sem
áudio novo). É o MESMO bug que o worker em TS teve antes do pumpOutboundQueue
— aqui o pacing volta a viver em write_audio_frame, com um relógio monotônico
(não um sleep fixo por frame, que acumula deriva numa ligação longa).

Framing (idêntico ao lib/voip/ulaw.ts / audioSocketBridge.ts em TS):
  1 byte tipo + 2 bytes tamanho (big-endian) + payload
    0x00 HANGUP  — Asterisk avisando que a ligação terminou
    0x01 UUID    — primeira mensagem, 16 bytes binários (consumida ANTES de
                   construir este transporte — main.py já sabe o UUID
                   quando cria o AudioSocketTransport)
    0x10 ÁUDIO   — PCM16 8kHz mono, 320 bytes (20ms)

PCM16 no fio do AudioSocket, µ-law na sessão OpenAI (ENTRADA) — dois
formatos diferentes, cada um pela razão certa. Testado ao vivo (15/09):

  SAÍDA (OpenAI -> Asterisk): sem conversão nossa. OpenAIRealtimeLLMService
  sempre marca o áudio de saída como PCM 24kHz (TTSAudioRawFrame, hardcoded
  no código-fonte do serviço, INDEPENDENTE do formato de sessão
  configurado) e o BaseOutputTransport já resample automaticamente
  (_resampler em MediaSender.handle_audio_frame) pra audio_out_sample_rate
  (8kHz aqui). Configurar a saída da sessão como µ-law quebraria isso: o
  serviço continuaria rotulando os bytes como PCM 24kHz mesmo eles sendo
  µ-law, e o resampler corromperia tudo tratando bytes de 8 bits como
  amostras PCM de 16 bits. Por isso a saída fica sem format explícito.

  ENTRADA (Asterisk -> OpenAI): aqui é o oposto — _send_user_audio no
  código-fonte do serviço manda frame.audio CRU pra API (só
  base64-encode, sem olhar sample_rate, sem reamostrar). Sem dizer à
  sessão que formato esperar, ela assume PCM 24kHz por padrão — e nosso
  áudio de 8kHz virava ruído irreconhecível pro VAD/transcrição dela.
  Sintoma ao vivo: a IA se apresentava (saída funcionando) mas nunca
  entendia nada do chamador (entrada não). Corrigido configurando
  AudioInput(format=PCMUAudioFormat()) em main.py + convertendo
  PCM16->µ-law aqui (audioop.lin2ulaw) antes de criar o InputAudioRawFrame
  — mesmo formato que o worker em TS já usava, agora só do lado da entrada.
"""

import asyncio
import audioop
import struct
import time
from typing import Callable, Optional

from loguru import logger
from pipecat.frames.frames import InputAudioRawFrame, OutputAudioRawFrame, StartFrame
from pipecat.processors.frame_processor import FrameProcessor, FrameProcessorSetup
from pipecat.transports.base_input import BaseInputTransport
from pipecat.transports.base_output import BaseOutputTransport
from pipecat.transports.base_transport import BaseTransport, TransportParams

FRAME_TYPE_HANGUP = 0x00
FRAME_TYPE_UUID = 0x01
FRAME_TYPE_DTMF = 0x03
FRAME_TYPE_AUDIO = 0x10

SAMPLE_RATE = 8000
FRAME_BYTES = 320  # 20ms @ 8kHz, PCM16 mono
FRAME_SECS = FRAME_BYTES / (SAMPLE_RATE * 2)  # 2 bytes/amostra, mono


def build_frame(frame_type: int, payload: bytes) -> bytes:
    header = struct.pack(">BH", frame_type, len(payload))
    return header + payload


class AudioSocketParams(TransportParams):
    audio_in_enabled: bool = True
    audio_out_enabled: bool = True
    audio_in_sample_rate: int = SAMPLE_RATE
    audio_out_sample_rate: int = SAMPLE_RATE
    # 2 chunks de 10ms = 320 bytes/20ms — o tamanho de frame que o AudioSocket
    # do Asterisk historicamente recebeu bem (mesmo tamanho do worker em TS).
    audio_out_10ms_chunks: int = 2


class AudioSocketInputTransport(BaseInputTransport):
    """Lê frames do socket (reader) e empurra InputAudioRawFrame no pipeline."""

    def __init__(
        self,
        reader: asyncio.StreamReader,
        params: AudioSocketParams,
        on_hangup: Callable[[], None],
    ):
        super().__init__(params)
        self._reader = reader
        self._on_hangup = on_hangup
        self._read_task: Optional[asyncio.Task] = None
        self._recv_buffer = b""
        self._audio_frames_received = 0

    async def start(self, frame: StartFrame):
        await super().start(frame)
        if not self._read_task:
            self._read_task = self.create_task(self._read_loop())
        await self.set_transport_ready(frame)

    async def cleanup(self):
        await super().cleanup()
        if self._read_task:
            await self.cancel_task(self._read_task)
            self._read_task = None

    async def _read_loop(self):
        try:
            while True:
                chunk = await self._reader.read(4096)
                if not chunk:
                    logger.info(f"[audiosocket] socket fechado pelo Asterisk (total de frames de audio do chamador na ligacao: {self._audio_frames_received})")
                    self._on_hangup()
                    return
                self._recv_buffer += chunk
                await self._drain_frames()
        except asyncio.CancelledError:
            raise
        except Exception as err:
            logger.error(f"[audiosocket] erro lendo do socket: {err}")
            self._on_hangup()

    async def _drain_frames(self):
        while len(self._recv_buffer) >= 3:
            frame_type, length = struct.unpack(">BH", self._recv_buffer[:3])
            if len(self._recv_buffer) < 3 + length:
                return  # frame incompleto, espera mais dados
            payload = self._recv_buffer[3 : 3 + length]
            self._recv_buffer = self._recv_buffer[3 + length :]

            if frame_type == FRAME_TYPE_AUDIO:
                self._audio_frames_received += 1
                # OpenAIRealtimeLLMService manda o audio de ENTRADA pra API cru,
                # sem reamostrar (visto lendo o codigo-fonte: _send_user_audio
                # so faz base64.b64encode(frame.audio), ignora sample_rate) --
                # entao o formato da sessao TEM que bater com o que mandamos
                # aqui. Configuramos AudioInput(format=PCMUAudioFormat()) em
                # main.py (mu-law 8kHz, mesmo formato que o worker TS ja
                # provou funcionar) e convertemos PCM16->mu-law aqui.
                ulaw_payload = audioop.lin2ulaw(payload, 2)
                await self.push_audio_frame(
                    InputAudioRawFrame(audio=ulaw_payload, sample_rate=SAMPLE_RATE, num_channels=1)
                )
            elif frame_type == FRAME_TYPE_HANGUP:
                logger.info(f"[audiosocket] frame de hangup recebido (total de frames de audio do chamador na ligacao: {self._audio_frames_received})")
                self._on_hangup()
                return
            # DTMF (0x03) ignorado, sem uso ainda — mesmo estado do bridge em TS.


class AudioSocketOutputTransport(BaseOutputTransport):
    """Recebe OutputAudioRawFrame da fila do Pipecat e escreve no socket NO
    RITMO CERTO — o Pipecat entrega os frames o mais rápido possível
    (ver docstring do módulo); pacear é responsabilidade nossa aqui."""

    def __init__(self, writer: asyncio.StreamWriter, params: AudioSocketParams):
        super().__init__(params)
        self._writer = writer
        # Relógio monotônico: cada frame é escrito no instante
        # `_next_write_at`, que avança por FRAME_SECS a cada frame — não um
        # `sleep(FRAME_SECS)` fixo por frame, que acumularia deriva ao longo
        # de uma ligação longa (o tempo gasto processando cada iteração some
        # do orçamento). `None` = ainda não começou a falar.
        self._next_write_at: Optional[float] = None

    async def start(self, frame: StartFrame):
        await super().start(frame)
        await self.set_transport_ready(frame)

    async def write_audio_frame(self, frame: OutputAudioRawFrame) -> bool:
        if self._writer.is_closing():
            return False

        now = time.monotonic()
        if self._next_write_at is None or now - self._next_write_at > 1.0:
            # Primeiro frame de um novo turno de fala (ou depois de um hiato
            # grande) — começa a contar a partir de AGORA, não de um relógio
            # velho parado lá atrás.
            self._next_write_at = now
        else:
            wait = self._next_write_at - now
            if wait > 0:
                await asyncio.sleep(wait)

        try:
            self._writer.write(build_frame(FRAME_TYPE_AUDIO, frame.audio))
            await self._writer.drain()
            self._next_write_at += FRAME_SECS
            return True
        except Exception as err:
            logger.error(f"[audiosocket] erro escrevendo no socket: {err}")
            return False


class AudioSocketTransport(BaseTransport):
    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        on_hangup: Callable[[], None],
        params: Optional[AudioSocketParams] = None,
    ):
        super().__init__()
        self._reader = reader
        self._writer = writer
        self._on_hangup = on_hangup
        self._params = params or AudioSocketParams()
        self._input: Optional[AudioSocketInputTransport] = None
        self._output: Optional[AudioSocketOutputTransport] = None

    def input(self) -> FrameProcessor:
        if not self._input:
            self._input = AudioSocketInputTransport(self._reader, self._params, self._on_hangup)
        return self._input

    def output(self) -> FrameProcessor:
        if not self._output:
            self._output = AudioSocketOutputTransport(self._writer, self._params)
        return self._output
