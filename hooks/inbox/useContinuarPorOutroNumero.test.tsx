/**
 * Continuar por outro número = abrir a conversa do contato lá E assumi-la.
 * Sem o `claim`, a conversa nova nasce sem dono e o automático daquele número
 * responderia no meio do atendimento humano. Com dono alheio (409), a conversa
 * abre mesmo assim — ninguém rouba atendimento de ninguém.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/types";

const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiClient: { post: (...a: unknown[]) => post(...a) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

import { useContinuarPorOutroNumero } from "./useContinuarPorOutroNumero";

function montar() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useContinuarPorOutroNumero(), { wrapper });
}

describe("useContinuarPorOutroNumero", () => {
  beforeEach(() => post.mockReset());

  it("abre a conversa no número escolhido e assume", async () => {
    post.mockResolvedValueOnce({ data: { conversation_id: "conv-b" } }).mockResolvedValueOnce({});
    const { result } = montar();
    result.current.mutate({ contact_id: "c1", channel_session_id: "b" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(post.mock.calls[0]).toEqual([
      "/api/v1/conversations/open-with-contact",
      { contact_id: "c1", channel_session_id: "b" },
    ]);
    expect(post.mock.calls[1]).toEqual(["/api/v1/conversations/conv-b/claim", { expected_assignee: null }]);
    expect(result.current.data).toBe("conv-b");
  });

  it("conversa com dono no outro número: abre sem assumir", async () => {
    post
      .mockResolvedValueOnce({ data: { conversation_id: "conv-b" } })
      .mockRejectedValueOnce(new ApiError(409, "conflict", undefined, "req-1"));
    const { result } = montar();
    result.current.mutate({ contact_id: "c1", channel_session_id: "b" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("conv-b");
  });
});
