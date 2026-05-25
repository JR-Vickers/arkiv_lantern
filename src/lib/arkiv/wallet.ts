import {
  createWalletClient,
  custom,
  jsonToPayload,
  toBytes,
  toHex,
  toRlp,
  type ChangeOwnershipReturnType,
  type CreateEntityParameters,
  type DeleteEntityReturnType,
  type Hex,
  type UpdateEntityParameters,
} from "@arkiv-network/sdk";
import type { BrotliWasmType } from "brotli-wasm";

import {
  createArkivReadClient,
  createProjectScopedMutationBoundary,
  type ArkivMutationReceipt,
  type ArkivMutationSigner,
} from "./client";
import { BRAGA_CHAIN_ID, BRAGA_EXPLORER_URL, BRAGA_RPC_URL, resolveArkivConfig } from "./config";
import type { ArkivEntityDraft } from "./contract";
import { createArkivMemoryProfileRepository, type MemoryProfileRepository } from "./profiles";
import { createArkivMemoryRecordRepository, type MemoryRecordRepository } from "./records";

export const ARKIV_ADDRESS = "0x00000000000000000000000000000061726b6976" as const;
const ARKIV_BLOCK_TIME_SECONDS = 2;
const ARKIV_GAS_BUFFER_MULTIPLIER = 2n;
const ARKIV_FALLBACK_GAS_LIMIT = 300_000n;

export type ArkivDiagnosticCheckStatus = "error" | "success";

export interface ArkivMutationDiagnosticCheck {
  detail: string;
  id: string;
  label: string;
  status: ArkivDiagnosticCheckStatus;
}

export interface ArkivMutationDiagnosticsResult {
  checks: ArkivMutationDiagnosticCheck[];
  compressedDataBytes: number;
  fromAddress: string;
  rpcUrl: string;
  toAddress: typeof ARKIV_ADDRESS;
  txDataBytes: number;
}

export function createBrowserMemoryProfileRepository(
  provider: EthereumProvider,
  ownerAddress: string,
): MemoryProfileRepository {
  return createArkivMemoryProfileRepository({
    mutations: createProjectScopedMutationBoundary(createBrowserArkivMutationSigner(provider, ownerAddress)),
    readClient: createArkivReadClient(),
  });
}

export function createBrowserMemoryRecordRepository(
  provider: EthereumProvider,
  ownerAddress: string,
): MemoryRecordRepository {
  return createArkivMemoryRecordRepository({
    mutations: createProjectScopedMutationBoundary(createBrowserArkivMutationSigner(provider, ownerAddress)),
    readClient: createArkivReadClient(),
  });
}

export function createBrowserArkivMutationSigner(
  provider: EthereumProvider,
  ownerAddress: string,
): ArkivMutationSigner {
  const config = resolveArkivConfig();
  const walletClient = createWalletClient({
    account: ownerAddress as Hex,
    chain: config.chain,
    transport: custom({
      request: (args) => provider.request(args),
    }),
  });

  return {
    async changeOwnership(input): Promise<ArkivMutationReceipt> {
      const receipt: ChangeOwnershipReturnType = await walletClient.changeOwnership({
        entityKey: input.entityKey,
        newOwner: input.nextOwnerAddress,
      });
      return {
        entityKey: receipt.entityKey,
        txHash: receipt.txHash as ArkivMutationReceipt["txHash"],
      };
    },
    async createEntity<TPayload extends object>(draft: ArkivEntityDraft<TPayload>): Promise<ArkivMutationReceipt> {
      const createParameters = toCreateEntityParameters(draft);
      return walletClient.createEntity(createParameters, {
        gas: await estimateMutationGas({
          fromAddress: ownerAddress as Hex,
          txData: createCreateTransactionData(createParameters),
        }),
      });
    },
    async deleteEntity(input): Promise<DeleteEntityReturnType> {
      return walletClient.deleteEntity(input, {
        gas: await estimateMutationGas({
          fromAddress: ownerAddress as Hex,
          txData: createDeleteTransactionData(input),
        }),
      });
    },
    async updateEntity<TPayload extends object>(input: {
      draft: ArkivEntityDraft<TPayload>;
      entityKey: Hex;
    }): Promise<ArkivMutationReceipt> {
      const updateParameters = {
        ...toUpdateEntityParameters(input.draft),
        entityKey: input.entityKey,
      };

      return walletClient.updateEntity(updateParameters, {
        gas: await estimateMutationGas({
          fromAddress: ownerAddress as Hex,
          txData: createUpdateTransactionData(updateParameters),
        }),
      });
    },
  };
}

export async function diagnoseCreateEntityDraft<TPayload extends object>({
  draft,
  ownerAddress,
  provider,
}: {
  draft: ArkivEntityDraft<TPayload>;
  ownerAddress: string;
  provider: EthereumProvider;
}): Promise<ArkivMutationDiagnosticsResult> {
  const createParameters = toCreateEntityParameters(draft);
  return diagnoseMutationTransaction({
    ownerAddress: ownerAddress as Hex,
    provider,
    txData: createCreateTransactionData(createParameters),
  });
}

export async function ensureBragaWalletNetwork(provider: EthereumProvider): Promise<void> {
  const chainId = toHex(BRAGA_CHAIN_ID);
  const currentChainId = await provider.request({ method: "eth_chainId" });

  await addOrUpdateBragaWalletChain(provider, chainId);

  if (typeof currentChainId === "string" && currentChainId.toLowerCase() === chainId.toLowerCase()) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    if (!isUnknownChainError(error)) {
      throw error;
    }

    await addOrUpdateBragaWalletChain(provider, chainId);
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }
}

async function addOrUpdateBragaWalletChain(provider: EthereumProvider, chainId: string): Promise<void> {
  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          blockExplorerUrls: [BRAGA_EXPLORER_URL],
          chainId,
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
  } catch (error) {
    if (isChainAlreadyAddedError(error)) {
      return;
    }

    throw error;
  }
}

export function toCreateEntityParameters<TPayload extends object>(
  draft: ArkivEntityDraft<TPayload>,
): CreateEntityParameters {
  return {
    attributes: [...draft.attributes],
    contentType: draft.contentType,
    expiresIn: draft.expiresIn,
    payload: jsonToPayload(draft.payload),
  };
}

function toUpdateEntityParameters<TPayload extends object>(
  draft: ArkivEntityDraft<TPayload>,
): Omit<UpdateEntityParameters, "entityKey"> {
  return {
    attributes: [...draft.attributes],
    contentType: draft.contentType,
    expiresIn: draft.expiresIn,
    payload: jsonToPayload(draft.payload),
  };
}

function createCreateTransactionData(input: CreateEntityParameters): Hex {
  return toRlp([
    [
      [
        toHex(Math.ceil(input.expiresIn / ARKIV_BLOCK_TIME_SECONDS)),
        toHex(input.contentType),
        toHex(input.payload),
        input.attributes.filter(isStringAttribute).map(formatAttribute),
        input.attributes.filter(isNumberAttribute).map(formatAttribute),
      ],
    ],
    [],
    [],
    [],
    [],
  ]);
}

function createUpdateTransactionData(input: UpdateEntityParameters): Hex {
  return toRlp([
    [],
    [
      [
        input.entityKey,
        toHex(input.contentType),
        toHex(Math.ceil(input.expiresIn / ARKIV_BLOCK_TIME_SECONDS)),
        toHex(input.payload),
        input.attributes.filter(isStringAttribute).map(formatAttribute),
        input.attributes.filter(isNumberAttribute).map(formatAttribute),
      ],
    ],
    [],
    [],
    [],
  ]);
}

function createDeleteTransactionData(input: { entityKey: Hex }): Hex {
  return toRlp([[], [], [input.entityKey], [], []]);
}

function formatAttribute(attribute: { key: string; value: number | string }): [Hex, Hex] {
  return [
    toHex(attribute.key),
    toHex(typeof attribute.value === "number" && attribute.value === 0 ? "" : attribute.value),
  ];
}

function isStringAttribute(attribute: { value: number | string }): attribute is { key: string; value: string } {
  return typeof attribute.value === "string";
}

function isNumberAttribute(attribute: { value: number | string }): attribute is { key: string; value: number } {
  return typeof attribute.value === "number";
}

async function estimateMutationGas({ fromAddress, txData }: { fromAddress: Hex; txData: Hex }): Promise<bigint> {
  try {
    const compressedData = await compressArkivTransactionData(txData);
    const result = await requestBragaRpc<string>({
      method: "eth_estimateGas",
      params: [
        {
          data: compressedData,
          from: fromAddress,
          to: ARKIV_ADDRESS,
          value: "0x0",
        },
      ],
    });

    return BigInt(result) * ARKIV_GAS_BUFFER_MULTIPLIER;
  } catch (error) {
    console.warn("Arkiv gas preflight failed; using fallback gas limit.", error);
    return ARKIV_FALLBACK_GAS_LIMIT;
  }
}

async function diagnoseMutationTransaction({
  ownerAddress,
  provider,
  txData,
}: {
  ownerAddress: Hex;
  provider: EthereumProvider;
  txData: Hex;
}): Promise<ArkivMutationDiagnosticsResult> {
  const compressedData = await compressArkivTransactionData(txData);
  const transaction = {
    data: compressedData,
    from: ownerAddress,
    to: ARKIV_ADDRESS,
    value: "0x0",
  };

  const checks = await Promise.all([
    createCompressionRoundTripCheck(txData, compressedData),
    createDiagnosticCheck({
      id: "direct-chain-id",
      label: "Direct Braga eth_chainId",
      run: () => requestBragaRpc<string>({ method: "eth_chainId", params: [] }),
    }),
    createDiagnosticCheck({
      id: "wallet-chain-id",
      label: "MetaMask provider eth_chainId",
      run: () => provider.request({ method: "eth_chainId" }),
    }),
    createDiagnosticCheck({
      format: formatAccountList,
      id: "wallet-accounts",
      label: "MetaMask connected accounts",
      run: () => provider.request({ method: "eth_accounts" }),
    }),
    createDiagnosticCheck({
      format: formatHexQuantity,
      id: "direct-balance",
      label: "Direct Braga owner balance",
      run: () => requestBragaRpc<string>({ method: "eth_getBalance", params: [ownerAddress, "latest"] }),
    }),
    createDiagnosticCheck({
      format: formatHexQuantity,
      id: "wallet-balance",
      label: "MetaMask provider owner balance",
      run: () => provider.request({ method: "eth_getBalance", params: [ownerAddress, "latest"] }),
    }),
    createDiagnosticCheck({
      id: "direct-call",
      label: "Direct Braga eth_call",
      run: () => requestBragaRpc<string>({ method: "eth_call", params: [transaction, "latest"] }),
    }),
    createDiagnosticCheck({
      id: "wallet-call",
      label: "MetaMask provider eth_call",
      run: () => provider.request({ method: "eth_call", params: [transaction, "latest"] }),
    }),
    createDiagnosticCheck({
      format: formatHexQuantity,
      id: "direct-estimate-gas",
      label: "Direct Braga eth_estimateGas",
      run: () => requestBragaRpc<string>({ method: "eth_estimateGas", params: [transaction] }),
    }),
    createDiagnosticCheck({
      format: formatHexQuantity,
      id: "wallet-estimate-gas",
      label: "MetaMask provider eth_estimateGas",
      run: () => provider.request({ method: "eth_estimateGas", params: [transaction] }),
    }),
  ]);

  return {
    checks,
    compressedDataBytes: toBytes(compressedData).byteLength,
    fromAddress: ownerAddress,
    rpcUrl: BRAGA_RPC_URL,
    toAddress: ARKIV_ADDRESS,
    txDataBytes: toBytes(txData).byteLength,
  };
}

async function createCompressionRoundTripCheck(txData: Hex, compressedData: Hex): Promise<ArkivMutationDiagnosticCheck> {
  try {
    const brotli = await getBrotli();
    const decompressed = toHex(brotli.decompress(toBytes(compressedData)));

    if (decompressed.toLowerCase() !== txData.toLowerCase()) {
      return {
        detail: "Compressed data did not decompress back to the original Arkiv RLP payload.",
        id: "browser-brotli-roundtrip",
        label: "Browser Brotli round trip",
        status: "error",
      };
    }

    return {
      detail: "Compressed data decompresses back to the original Arkiv RLP payload.",
      id: "browser-brotli-roundtrip",
      label: "Browser Brotli round trip",
      status: "success",
    };
  } catch (error) {
    return {
      detail: getDiagnosticErrorMessage(error),
      id: "browser-brotli-roundtrip",
      label: "Browser Brotli round trip",
      status: "error",
    };
  }
}

async function createDiagnosticCheck<TResult>({
  format = formatUnknownResult,
  id,
  label,
  run,
}: {
  format?: (value: TResult) => string;
  id: string;
  label: string;
  run: () => Promise<TResult>;
}): Promise<ArkivMutationDiagnosticCheck> {
  try {
    return {
      detail: format(await run()),
      id,
      label,
      status: "success",
    };
  } catch (error) {
    return {
      detail: getDiagnosticErrorMessage(error),
      id,
      label,
      status: "error",
    };
  }
}

async function compressArkivTransactionData(txData: Hex): Promise<Hex> {
  const brotli = await getBrotli();
  return toHex(brotli.compress(toBytes(txData)));
}

let brotliPromise: Promise<BrotliWasmType> | null = null;

async function getBrotli(): Promise<BrotliWasmType> {
  brotliPromise ??= import("brotli-wasm").then(async (module) =>
    module.default ? module.default : (module as BrotliWasmType),
  );
  return brotliPromise;
}

async function requestBragaRpc<TResult>({
  method,
  params,
}: {
  method: string;
  params: unknown[];
}): Promise<TResult> {
  const response = await fetch(BRAGA_RPC_URL, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method,
      params,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  const payload = (await response.json()) as { error?: { message?: string }; result?: TResult };

  if (!response.ok || payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message ?? `Arkiv Braga RPC ${method} failed.`);
  }

  return payload.result;
}

function isUnknownChainError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: number | string }).code : undefined;
  return code === 4902 || code === "4902";
}

function isChainAlreadyAddedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: number | string }).code : undefined;
  const message = "message" in error ? String((error as { message?: unknown }).message) : "";

  return code === -32602 && /already.*added|already.*exists/i.test(message);
}

function formatAccountList(value: unknown): string {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value.join(", ") || "No accounts returned"
    : formatUnknownResult(value);
}

function formatHexQuantity(value: unknown): string {
  if (typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)) {
    return `${value} (${BigInt(value).toString()} wei)`;
  }

  return formatUnknownResult(value);
}

function formatUnknownResult(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function getDiagnosticErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const message = "message" in error ? String((error as { message?: unknown }).message) : "";
    const data = "data" in error ? (error as { data?: unknown }).data : undefined;
    const dataMessage =
      data && typeof data === "object" && "message" in data ? String((data as { message?: unknown }).message) : "";

    return [message, dataMessage].filter(Boolean).join(" / ") || JSON.stringify(error);
  }

  return String(error);
}
