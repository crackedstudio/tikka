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

// Add any other core interfaces used by your services