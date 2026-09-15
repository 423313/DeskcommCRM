"""
Decrypt AES-256-GCM — porta de lib/crypto/aes_gcm.ts pro Python, MESMO
algoritmo e MESMA chave (env AI_CRED_AES_KEY, 32 bytes base64), pra ler a
credencial OpenAI cifrada por org (ai_provider_credentials) sem duplicar a
lógica de cifragem em duas linguagens — só decrypt aqui, quem CIFRA continua
sendo o Next.js (tela de Credenciais de IA).

Ciphertext/IV/tag são gravados como três colunas `bytea` separadas (não um
blob concatenado) — o formato do Postgres/PostgREST pra bytea em modo padrão
é a string `\\x<hex>`, decodificada aqui com bytes.fromhex.
"""

import base64
import os

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

KEY_LENGTH_BYTES = 32


def _get_key() -> bytes:
    raw = os.environ.get("AI_CRED_AES_KEY")
    if not raw:
        raise RuntimeError("AI_CRED_AES_KEY não configurada")
    key = base64.b64decode(raw)
    if len(key) != KEY_LENGTH_BYTES:
        raise RuntimeError(f"AI_CRED_AES_KEY deve ter 32 bytes (lido: {len(key)})")
    return key


def bytea_to_bytes(value: str | bytes) -> bytes:
    """Inverso de bufToBytea (TS): aceita a string `\\x<hex>` que o
    PostgREST/psycopg devolve pra colunas bytea."""
    if isinstance(value, bytes):
        return value
    hexstr = value[2:] if value.startswith("\\x") else value
    return bytes.fromhex(hexstr)


def decrypt_key(ciphertext: bytes, iv: bytes, tag: bytes) -> str:
    key = _get_key()
    decryptor = Cipher(algorithms.AES(key), modes.GCM(iv, tag)).decryptor()
    plaintext = decryptor.update(ciphertext) + decryptor.finalize()
    return plaintext.decode("utf-8")
