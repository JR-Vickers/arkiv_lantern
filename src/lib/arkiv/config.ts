import { braga } from "@arkiv-network/sdk/chains";

export const BRAGA_CHAIN_ID = braga.id;
export const BRAGA_NETWORK_NAME = braga.network;
export const BRAGA_RPC_URL = braga.rpcUrls.default.http[0];
export const BRAGA_EXPLORER_URL = braga.blockExplorers.default.url;

export interface ArkivConfig {
  chain: typeof braga;
  chainId: typeof BRAGA_CHAIN_ID;
  explorerUrl: string;
  networkName: typeof BRAGA_NETWORK_NAME;
  rpcUrl: string;
}

export type ArkivConfigInput = Partial<Pick<ArkivConfig, "explorerUrl" | "rpcUrl">>;

export class ArkivConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArkivConfigError";
  }
}

export function resolveArkivConfig(input: ArkivConfigInput = {}): ArkivConfig {
  const rpcUrl = input.rpcUrl ?? BRAGA_RPC_URL;
  const explorerUrl = input.explorerUrl ?? BRAGA_EXPLORER_URL;

  if (!rpcUrl.trim()) {
    throw new ArkivConfigError("Arkiv Braga RPC URL is required.");
  }

  if (!explorerUrl.trim()) {
    throw new ArkivConfigError("Arkiv Braga explorer URL is required.");
  }

  return Object.freeze({
    chain: braga,
    chainId: BRAGA_CHAIN_ID,
    explorerUrl,
    networkName: BRAGA_NETWORK_NAME,
    rpcUrl,
  });
}
