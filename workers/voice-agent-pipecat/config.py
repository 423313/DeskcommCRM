"""
Configuração por chamada — porta do essencial de lib/ai/agents.ts
(getActiveVoiceAgent/resolverChaveOpenAiDaVoz) pro Python. Não duplica RAG
nem o resto da lógica de agente: só o que este serviço precisa pra abrir uma
sessão Realtime (system_prompt, voz/velocidade/modelo, chave OpenAI).

Client Supabase com a service_role key — mesmo padrão do createAdminClient()
em TS (RLS não filtra aqui; quem chama já resolveu a organização pelo
asterisk_channel_id da linha em voice_calls).
"""

import os
from dataclasses import dataclass
from typing import Optional

from supabase import Client, create_client

from crypto import bytea_to_bytes, decrypt_key

AGENT_CONFIG_DEFAULTS = {
    "voice": "marin",
    "voice_speed": 0.85,
    "voice_model": "gpt-realtime",
    "rag_top_k": 5,
    "rag_similarity_threshold": 0.4,
}


def get_admin_client() -> Client:
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


@dataclass
class VoiceAgentConfig:
    id: str
    system_prompt: str
    voice: str
    voice_speed: float
    voice_model: str
    rag_top_k: int
    rag_similarity_threshold: float
    api_key: str


async def resolve_openai_key(admin: Client, organization_id: str) -> str:
    """A chave ativa e validada desta org (IA > Credenciais), mais antiga em
    caso de empate — mesmo critério do TS. Sem credencial de org, cai no
    OPENAI_API_KEY do ambiente."""
    try:
        res = (
            admin.table("ai_provider_credentials")
            .select("api_key_encrypted, api_key_iv, api_key_tag")
            .eq("organization_id", organization_id)
            .eq("provider", "openai")
            .eq("is_active", True)
            .not_.is_("validated_at", "null")
            .order("created_at", desc=False)
            .limit(1)
            .maybe_single()
            .execute()
        )
        if res.data:
            return decrypt_key(
                bytea_to_bytes(res.data["api_key_encrypted"]),
                bytea_to_bytes(res.data["api_key_iv"]),
                bytea_to_bytes(res.data["api_key_tag"]),
            )
    except Exception:
        # Decrypt falhou ou a query deu erro — cai pro env abaixo, sem
        # logar detalhe de credencial.
        pass
    return os.environ.get("OPENAI_API_KEY", "")


async def get_active_voice_agent(admin: Client, organization_id: str) -> Optional[VoiceAgentConfig]:
    res = (
        admin.table("ai_agents")
        .select("id, system_prompt, config")
        .eq("organization_id", organization_id)
        .eq("channel", "voice")
        .eq("is_active", True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    if not res.data:
        return None

    cfg = {**AGENT_CONFIG_DEFAULTS, **(res.data.get("config") or {})}
    api_key = await resolve_openai_key(admin, organization_id)

    return VoiceAgentConfig(
        id=res.data["id"],
        system_prompt=res.data["system_prompt"],
        voice=cfg["voice"],
        voice_speed=cfg["voice_speed"],
        voice_model=cfg["voice_model"],
        rag_top_k=cfg["rag_top_k"],
        rag_similarity_threshold=cfg["rag_similarity_threshold"],
        api_key=api_key,
    )


async def find_call_by_asterisk_channel_id(admin: Client, uuid: str) -> Optional[dict]:
    res = (
        admin.table("voice_calls")
        .select("*")
        .eq("asterisk_channel_id", uuid)
        .maybe_single()
        .execute()
    )
    return res.data


async def mark_call_connected(admin: Client, call_id: str, answered_at_iso: str) -> None:
    admin.table("voice_calls").update(
        {"status": "connected", "answered_at": answered_at_iso, "handled_by": "ai"}
    ).eq("id", call_id).execute()


async def finalize_call(
    admin: Client, call_id: str, ended_at_iso: str, duration_ms: int, transcript: list
) -> None:
    admin.table("voice_calls").update(
        {
            "status": "ended",
            "end_reason": "user_ended",
            "ended_at": ended_at_iso,
            "duration_ms": duration_ms,
            "transcript": transcript,
        }
    ).eq("id", call_id).execute()
