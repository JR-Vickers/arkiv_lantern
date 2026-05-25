import { afterEach, describe, expect, it, vi } from "vitest";
import { toHex, type Hex } from "@arkiv-network/sdk";

import { BRAGA_CHAIN_ID, BRAGA_EXPLORER_URL, BRAGA_RPC_URL } from "./config";
import { createMemoryProfileDraftFromInput } from "./profiles";
import { ARKIV_ADDRESS, diagnoseCreateEntityDraft, ensureBragaWalletNetwork } from "./wallet";

vi.mock("brotli-wasm", () => {
  const brotli = {
    compress: (data: Uint8Array) => data,
    decompress: (data: Uint8Array) => data,
  };

  return {
    ...brotli,
    default: Promise.resolve(brotli),
  };
});

const ownerAddress = "0x5056A091A9674EB1bDFcE49a689b175Bd69E81A2";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Braga wallet network setup", () => {
  it("refreshes existing Braga chain details so MetaMask uses the current RPC URL", async () => {
    const request = vi.fn(async ({ method }: { method: string; params?: unknown[] | Record<string, unknown> }) => {
      if (method === "eth_chainId") {
        return toHex(BRAGA_CHAIN_ID);
      }

      return null;
    });

    await ensureBragaWalletNetwork({ request });

    expect(request).toHaveBeenCalledWith({
      method: "wallet_addEthereumChain",
      params: [
        {
          blockExplorerUrls: [BRAGA_EXPLORER_URL],
          chainId: toHex(BRAGA_CHAIN_ID),
          chainName: "Arkiv Braga",
          nativeCurrency: {
            decimals: 18,
            name: "Golem",
            symbol: "GLM",
          },
          rpcUrls: [BRAGA_RPC_URL],
        },
      ],
    });
    expect(request).not.toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHex(BRAGA_CHAIN_ID) }],
    });
  });

  it("adds and switches to Braga when the wallet is on another chain", async () => {
    const request = vi.fn(async ({ method }: { method: string; params?: unknown[] | Record<string, unknown> }) => {
      if (method === "eth_chainId") {
        return "0x1";
      }

      return null;
    });

    await ensureBragaWalletNetwork({ request });

    expect(request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHex(BRAGA_CHAIN_ID) }],
    });
  });
});

describe("Arkiv write diagnostics", () => {
  it("compares direct Braga and MetaMask provider preflight for the same encoded create transaction", async () => {
    installBragaFetch();
    const request = vi.fn(async ({ method }: { method: string; params?: unknown[] | Record<string, unknown> }) => {
      if (method === "eth_chainId") {
        return toHex(BRAGA_CHAIN_ID);
      }

      if (method === "eth_accounts") {
        return [ownerAddress];
      }

      if (method === "eth_getBalance") {
        return "0x0";
      }

      if (method === "eth_call") {
        return "0x";
      }

      if (method === "eth_estimateGas") {
        return "0x634c";
      }

      return null;
    });

    const result = await diagnoseCreateEntityDraft({
      draft: createDiagnosticProfileDraft(),
      ownerAddress,
      provider: { request },
    });

    expect(result.rpcUrl).toBe(BRAGA_RPC_URL);
    expect(result.toAddress).toBe(ARKIV_ADDRESS);
    expect(result.txDataBytes).toBeGreaterThan(0);
    expect(result.compressedDataBytes).toBeGreaterThan(0);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "browser-brotli-roundtrip", status: "success" }),
        expect.objectContaining({ id: "direct-call", status: "success" }),
        expect.objectContaining({ id: "direct-estimate-gas", status: "success" }),
        expect.objectContaining({ id: "wallet-call", status: "success" }),
        expect.objectContaining({ id: "wallet-estimate-gas", status: "success" }),
      ]),
    );

    const walletEstimate = request.mock.calls.find(([args]) => args.method === "eth_estimateGas")?.[0];
    const walletTransaction = (walletEstimate?.params as unknown[])[0] as { data: Hex; from: Hex; to: Hex; value: Hex };
    expect(walletTransaction).toEqual(
      expect.objectContaining({
        data: expect.stringMatching(/^0x[0-9a-f]+$/i),
        from: ownerAddress,
        to: ARKIV_ADDRESS,
        value: "0x0",
      }),
    );
  });

  it("reports MetaMask provider decompression rejection while direct Braga preflight passes", async () => {
    installBragaFetch();
    const request = vi.fn(async ({ method }: { method: string; params?: unknown[] | Record<string, unknown> }) => {
      if (method === "eth_chainId") {
        return toHex(BRAGA_CHAIN_ID);
      }

      if (method === "eth_accounts") {
        return [ownerAddress];
      }

      if (method === "eth_getBalance") {
        return "0x0";
      }

      if (method === "eth_call" || method === "eth_estimateGas") {
        throw new Error("RPC submit: failed to decompress arkiv transaction data: brotli: PADDING_2");
      }

      return null;
    });

    const result = await diagnoseCreateEntityDraft({
      draft: createDiagnosticProfileDraft(),
      ownerAddress,
      provider: { request },
    });

    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "direct-call", status: "success" }),
        expect.objectContaining({ id: "direct-estimate-gas", status: "success" }),
        expect.objectContaining({
          detail: expect.stringContaining("PADDING_2"),
          id: "wallet-estimate-gas",
          status: "error",
        }),
      ]),
    );
  });
});

function createDiagnosticProfileDraft() {
  return createMemoryProfileDraftFromInput({
    input: {
      agentPurpose: "Remember testnet diagnostics",
      displayName: "Diagnostic profile",
      ownerAddress,
    },
    now: () => new Date("2026-05-24T00:00:00.000Z"),
  });
}

function installBragaFetch() {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (!init?.body) {
      return originalFetch(_input, init);
    }

    const body = JSON.parse(String(init?.body)) as { id: number; method: string };
    const resultByMethod: Record<string, string> = {
      eth_call: "0x",
      eth_chainId: toHex(BRAGA_CHAIN_ID),
      eth_estimateGas: "0x634c",
      eth_getBalance: "0x0",
    };

    return new Response(
      JSON.stringify({
        id: body.id,
        jsonrpc: "2.0",
        result: resultByMethod[body.method] ?? "0x",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  });

  vi.stubGlobal("fetch", fetch);
  return fetch;
}
