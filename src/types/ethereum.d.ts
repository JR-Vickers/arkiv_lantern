interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
}

interface Window {
  ethereum?: EthereumProvider;
}
