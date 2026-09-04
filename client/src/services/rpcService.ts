import { logger } from '../utils/logger';
import { STELLAR_CONFIG } from "../config/stellar";

type RpcServerMethod = (...args: unknown[]) => unknown;
type RpcServer = Record<string, RpcServerMethod | unknown>;

let _server: RpcServer | null = null;
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

function createServerProxy(): Record<string, RpcServerMethod> {
  return new Proxy({} as Record<string, RpcServerMethod>, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return async (...args: unknown[]) => {
        await ensureServer();
        const value = _server != null ? (_server[String(prop)] as RpcServerMethod | undefined) : undefined;
        if (typeof value === "function") {
          return value.call(_server, ...args);
        }
        return value;
      };
    },
  });
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
    logger.error("Stellar RPC Connection Error:", error);
    return false;
  }
};
