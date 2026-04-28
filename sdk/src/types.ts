export interface Raffle {
  id: string;
  name: string;
  ticketPrice: string;
  status: string;
}

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
}

export * from './contract/response';