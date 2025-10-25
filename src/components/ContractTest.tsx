import React from "react";
import { useAccount } from "wagmi";
import {
    useActiveRaffleIds,
    useAllRaffleIds,
} from "../hooks/useRaffleContract";

const ContractTest: React.FC = () => {
    const { address, isConnected } = useAccount();
    const {
        data: activeRaffleIds,
        error: activeError,
        isLoading: activeLoading,
    } = useActiveRaffleIds();
    const {
        data: allRaffleIds,
        error: allError,
        isLoading: allLoading,
    } = useAllRaffleIds();

    console.log("🔍 ContractTest - Wallet connected:", isConnected);
    console.log("🔍 ContractTest - Address:", address);
    console.log("🔍 ContractTest - Active raffle IDs:", activeRaffleIds);
    console.log("🔍 ContractTest - All raffle IDs:", allRaffleIds);
    console.log("🔍 ContractTest - Active error:", activeError);
    console.log("🔍 ContractTest - All error:", allError);

    return (
        <div className="bg-[#1E1932] rounded-xl p-6 m-4">
            <h3 className="text-white text-lg font-semibold mb-4">
                Contract Test
            </h3>

            <div className="space-y-4">
                <div>
                    <h4 className="text-white font-medium">Wallet Status:</h4>
                    <p className="text-gray-400">
                        Connected: {isConnected ? "Yes" : "No"}
                    </p>
                    <p className="text-gray-400">
                        Address: {address || "Not connected"}
                    </p>
                </div>

                <div>
                    <h4 className="text-white font-medium">Active Raffles:</h4>
                    <p className="text-gray-400">
                        Loading: {activeLoading ? "Yes" : "No"}
                    </p>
                    <p className="text-gray-400">
                        Data: {JSON.stringify(activeRaffleIds)}
                    </p>
                    <p className="text-gray-400">
                        Error: {activeError?.message || "None"}
                    </p>
                </div>

                <div>
                    <h4 className="text-white font-medium">All Raffles:</h4>
                    <p className="text-gray-400">
                        Loading: {allLoading ? "Yes" : "No"}
                    </p>
                    <p className="text-gray-400">
                        Data: {JSON.stringify(allRaffleIds)}
                    </p>
                    <p className="text-gray-400">
                        Error: {allError?.message || "None"}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ContractTest;
