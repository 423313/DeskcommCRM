import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), erro: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("sonner", () => ({ toast: { error: api.erro, success: vi.fn() } }));

import { CanalVozClient } from "@/components/connections/CanalVozClient";

class Eventos {
  static abertos: Eventos[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((evento: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    Eventos.abertos.push(this);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  Eventos.abertos = [];
  vi.stubGlobal("EventSource", Eventos);
  api.get.mockImplementation(async (url: string) => ({
    data: url.endsWith("opt-in") ? { ligada: true } : { paired: false },
  }));
  api.post.mockResolvedValue({ data: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("primeiro pareamento da voz", () => {
  it("prepara a sessão, abre os eventos e só então pede o QR", async () => {
    let preparar!: () => void;
    api.post.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          preparar = resolve;
        }),
    );
    render(<CanalVozClient wacallsConfigured />);
    fireEvent.click(await screen.findByRole("button", { name: "Parear chamada de voz" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/v1/voice/sessions/pair", { prepare_only: true }),
    );
    expect(Eventos.abertos).toHaveLength(0);
    await act(async () => preparar());
    await waitFor(() => expect(Eventos.abertos).toHaveLength(1));
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => Eventos.abertos[0]!.onopen?.());
    expect(api.post).toHaveBeenLastCalledWith("/api/v1/voice/sessions/pair", {});
    await act(async () =>
      Eventos.abertos[0]!.onmessage?.({
        data: JSON.stringify({ type: "qr", dataUrl: "data:image/png;base64,cXI=" }),
      }),
    );
    expect(screen.getByAltText("QR Code para parear chamada de voz")).toBeVisible();
  });

  it("falha da conexão avisa a pessoa e permite tentar de novo", async () => {
    render(<CanalVozClient wacallsConfigured />);
    fireEvent.click(await screen.findByRole("button", { name: "Parear chamada de voz" }));
    await waitFor(() => expect(Eventos.abertos).toHaveLength(1));
    act(() => Eventos.abertos[0]!.onerror?.());
    expect(api.erro).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Parear chamada de voz" })).toBeEnabled();
  });
});
