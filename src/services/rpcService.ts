import { rpc } from "@stellar/stellar-sdk";
import { STELLAR_CONFIG } from "../config/stellar";

export const sorobanRpcServer = new rpc.Server(STELLAR_CONFIG.rpcUrl, {
  allowHttp: true,
});

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
