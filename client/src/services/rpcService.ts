import { STELLAR_CONFIG } from "../config/stellar";

let _server: any = null;
let _initPromise: Promise<void> | null = null;

async function ensureServer() {
  if (!_initPromise) {
    _initPromise = (async () => {
      const { rpc } = await import("@stellar/stellar-sdk");
      _server = new rpc.Server(STELLAR_CONFIG.rpcUrl, { allowHttp: true });
    })();
  }
  await _initPromise;
}

function createServerProxy(): Record<string, any> {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return undefined;
        return async (...args: any[]) => {
          await ensureServer();
          const value = (_server as any)[prop];
          return typeof value === "function" ? value.call(_server, ...args) : value;
        };
      },
    },
  ) as any;
}

export const sorobanRpcServer = createServerProxy();

export const checkConnection = async () => {
  try {
    const health = await sorobanRpcServer.getHealth();
    if (health.status !== "healthy") {
      throw new Error("RPC server is unreachable");
    }
    return true;
  } catch (error) {
    console.error("Stellar RPC Connection Error:", error);
    return false;
  }
};
