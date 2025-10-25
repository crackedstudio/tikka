// Contract configuration
export const RAFFLE_CONTRACT_ADDRESS =
    "0x60fd4f42B818b173d7252859963c7131Ed68CA6D";
export const CHAIN_ID = 84532; // Base Sepolia

console.log("🔍 Contract Config - Address:", RAFFLE_CONTRACT_ADDRESS);
console.log("🔍 Contract Config - Chain ID:", CHAIN_ID);
console.log("🔍 Contract Config - Environment variables:");
console.log(
    "  - VITE_RAFFLE_CONTRACT_ADDRESS:",
    import.meta.env.VITE_RAFFLE_CONTRACT_ADDRESS
);
console.log("  - VITE_CHAIN_ID:", import.meta.env.VITE_CHAIN_ID);

// Contract ABI - Based on your test file, here are the main functions we'll need
export const RAFFLE_CONTRACT_ABI = [
    {
        type: "constructor",
        inputs: [
            {
                name: "_vrfCoordinator",
                type: "address",
                internalType: "address",
            },
            {
                name: "_subscriptionId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_keyHash",
                type: "bytes32",
                internalType: "bytes32",
            },
            {
                name: "_callbackGasLimit",
                type: "uint32",
                internalType: "uint32",
            },
            {
                name: "_requestConfirmations",
                type: "uint16",
                internalType: "uint16",
            },
        ],
        stateMutability: "nonpayable",
    },
    { type: "receive", stateMutability: "payable" },
    {
        type: "function",
        name: "buyMultipleTickets",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_quantity",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "payable",
    },
    {
        type: "function",
        name: "buyTicket",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "payable",
    },
    {
        type: "function",
        name: "configureVRF",
        inputs: [
            {
                name: "_subscriptionId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_keyHash",
                type: "bytes32",
                internalType: "bytes32",
            },
            {
                name: "_callbackGasLimit",
                type: "uint32",
                internalType: "uint32",
            },
            {
                name: "_requestConfirmations",
                type: "uint16",
                internalType: "uint16",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "createRaffle",
        inputs: [
            {
                name: "_description",
                type: "string",
                internalType: "string",
            },
            {
                name: "_endTime",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_maxTickets",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_allowMultipleTickets",
                type: "bool",
                internalType: "bool",
            },
            {
                name: "_ticketPrice",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_ticketToken",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "depositPrizeETH",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "payable",
    },
    {
        type: "function",
        name: "depositPrizeNFT",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_token",
                type: "address",
                internalType: "address",
            },
            {
                name: "_tokenId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "depositPrizeToken",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_token",
                type: "address",
                internalType: "address",
            },
            {
                name: "_amount",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "finalizeRaffle",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "getActiveRaffleIds",
        inputs: [],
        outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getAllRaffleIds",
        inputs: [],
        outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getContractBalance",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getContractTokenBalance",
        inputs: [
            {
                name: "_token",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getEndedRaffleIds",
        inputs: [],
        outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getNextRaffleId",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getNextTicketId",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getPlatformOwner",
        inputs: [],
        outputs: [{ name: "", type: "address", internalType: "address" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getPlatformServiceCharge",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getPlatformStatistics",
        inputs: [],
        outputs: [
            {
                name: "totalRaffles",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "activeRaffles",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "endedRaffles",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "finalizedRaffles",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "totalTicketsSold",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "totalRevenue",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "serviceChargeRate",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getPrizeData",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [
            {
                name: "",
                type: "tuple",
                internalType: "struct Raffle.PrizeData",
                components: [
                    {
                        name: "token",
                        type: "address",
                        internalType: "address",
                    },
                    {
                        name: "tokenId",
                        type: "uint256",
                        internalType: "uint256",
                    },
                    {
                        name: "amount",
                        type: "uint256",
                        internalType: "uint256",
                    },
                    {
                        name: "isNFT",
                        type: "bool",
                        internalType: "bool",
                    },
                    {
                        name: "isDeposited",
                        type: "bool",
                        internalType: "bool",
                    },
                ],
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleByTicketId",
        inputs: [
            {
                name: "_ticketId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [
            {
                name: "raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleCreator",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "address", internalType: "address" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleData",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [
            {
                name: "",
                type: "tuple",
                internalType: "struct Raffle.RaffleData",
                components: [
                    {
                        name: "id",
                        type: "uint256",
                        internalType: "uint256",
                    },
                    {
                        name: "creator",
                        type: "address",
                        internalType: "address",
                    },
                    {
                        name: "description",
                        type: "string",
                        internalType: "string",
                    },
                    {
                        name: "endTime",
                        type: "uint256",
                        internalType: "uint256",
                    },
                    {
                        name: "maxTickets",
                        type: "uint256",
                        internalType: "uint256",
                    },
                    {
                        name: "allowMultipleTickets",
                        type: "bool",
                        internalType: "bool",
                    },
                    {
                        name: "ticketPrice",
                        type: "uint256",
                        internalType: "uint256",
                    },
                    {
                        name: "ticketToken",
                        type: "address",
                        internalType: "address",
                    },
                    {
                        name: "totalTicketsSold",
                        type: "uint256",
                        internalType: "uint256",
                    },
                    {
                        name: "isActive",
                        type: "bool",
                        internalType: "bool",
                    },
                    {
                        name: "winner",
                        type: "address",
                        internalType: "address",
                    },
                    {
                        name: "winningTicketId",
                        type: "uint256",
                        internalType: "uint256",
                    },
                    {
                        name: "winningsWithdrawn",
                        type: "bool",
                        internalType: "bool",
                    },
                    {
                        name: "isFinalized",
                        type: "bool",
                        internalType: "bool",
                    },
                ],
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleDescription",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "string", internalType: "string" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleEndTime",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleIdsByCreator",
        inputs: [
            {
                name: "_creator",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleIdsByTicketToken",
        inputs: [
            {
                name: "_token",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleIdsWithPrizes",
        inputs: [],
        outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleMaxTickets",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleStatistics",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [
            {
                name: "totalTicketsSold",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "totalRevenue",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "availableTickets",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "participationCount",
                type: "uint256",
                internalType: "uint256",
            },
            { name: "hasPrize", type: "bool", internalType: "bool" },
            { name: "isEnded", type: "bool", internalType: "bool" },
            {
                name: "isFinalized",
                type: "bool",
                internalType: "bool",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleTicketIds",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleTicketPrice",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleTicketToken",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "address", internalType: "address" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleTicketsPaginated",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_startIndex",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_count",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [
            {
                name: "ticketIds",
                type: "uint256[]",
                internalType: "uint256[]",
            },
            {
                name: "owners",
                type: "address[]",
                internalType: "address[]",
            },
            {
                name: "purchaseTimes",
                type: "uint256[]",
                internalType: "uint256[]",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleWinner",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "address", internalType: "address" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleWinners",
        inputs: [],
        outputs: [
            {
                name: "raffleIds",
                type: "uint256[]",
                internalType: "uint256[]",
            },
            {
                name: "winners",
                type: "address[]",
                internalType: "address[]",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRaffleWinningTicketId",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getTicketData",
        inputs: [
            {
                name: "_ticketId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [
            {
                name: "",
                type: "tuple",
                internalType: "struct Raffle.Ticket",
                components: [
                    {
                        name: "id",
                        type: "uint256",
                        internalType: "uint256",
                    },
                    {
                        name: "raffleId",
                        type: "uint256",
                        internalType: "uint256",
                    },
                    {
                        name: "owner",
                        type: "address",
                        internalType: "address",
                    },
                    {
                        name: "isWinner",
                        type: "bool",
                        internalType: "bool",
                    },
                    {
                        name: "purchaseTime",
                        type: "uint256",
                        internalType: "uint256",
                    },
                ],
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getTotalRaffles",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getUserRaffleParticipation",
        inputs: [
            {
                name: "_user",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [
            {
                name: "raffleIds",
                type: "uint256[]",
                internalType: "uint256[]",
            },
            {
                name: "ticketCounts",
                type: "uint256[]",
                internalType: "uint256[]",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getUserTicketIds",
        inputs: [
            {
                name: "_user",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getUserTicketsInRaffle",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_user",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getUserTicketsInRaffleDetailed",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_user",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [
            {
                name: "ticketIds",
                type: "uint256[]",
                internalType: "uint256[]",
            },
            {
                name: "purchaseTimes",
                type: "uint256[]",
                internalType: "uint256[]",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getVRFConfiguration",
        inputs: [],
        outputs: [
            {
                name: "subscriptionId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "keyHash",
                type: "bytes32",
                internalType: "bytes32",
            },
            {
                name: "callbackGasLimit",
                type: "uint32",
                internalType: "uint32",
            },
            {
                name: "requestConfirmations",
                type: "uint16",
                internalType: "uint16",
            },
            {
                name: "numWords",
                type: "uint32",
                internalType: "uint32",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "hasPendingVRFRequest",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "bool", internalType: "bool" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "hasPrizeDeposited",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "bool", internalType: "bool" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "isRaffleActive",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "bool", internalType: "bool" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "isRaffleFinalized",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [{ name: "", type: "bool", internalType: "bool" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "nextRaffleId",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "nextTicketId",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "pendingVRFRequests",
        inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        outputs: [{ name: "", type: "bool", internalType: "bool" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "platformOwner",
        inputs: [],
        outputs: [{ name: "", type: "address", internalType: "address" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "platformServiceCharge",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "prizes",
        inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        outputs: [
            {
                name: "token",
                type: "address",
                internalType: "address",
            },
            {
                name: "tokenId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
            },
            { name: "isNFT", type: "bool", internalType: "bool" },
            {
                name: "isDeposited",
                type: "bool",
                internalType: "bool",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "raffleTickets",
        inputs: [
            { name: "", type: "uint256", internalType: "uint256" },
            { name: "", type: "uint256", internalType: "uint256" },
        ],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "raffles",
        inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        outputs: [
            { name: "id", type: "uint256", internalType: "uint256" },
            {
                name: "creator",
                type: "address",
                internalType: "address",
            },
            {
                name: "description",
                type: "string",
                internalType: "string",
            },
            {
                name: "endTime",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "maxTickets",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "allowMultipleTickets",
                type: "bool",
                internalType: "bool",
            },
            {
                name: "ticketPrice",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "ticketToken",
                type: "address",
                internalType: "address",
            },
            {
                name: "totalTicketsSold",
                type: "uint256",
                internalType: "uint256",
            },
            { name: "isActive", type: "bool", internalType: "bool" },
            {
                name: "winner",
                type: "address",
                internalType: "address",
            },
            {
                name: "winningTicketId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "winningsWithdrawn",
                type: "bool",
                internalType: "bool",
            },
            {
                name: "isFinalized",
                type: "bool",
                internalType: "bool",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "rawFulfillRandomWords",
        inputs: [
            {
                name: "requestId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "randomWords",
                type: "uint256[]",
                internalType: "uint256[]",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "requestIdToRaffleId",
        inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "requestRandomWinner",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "s_callbackGasLimit",
        inputs: [],
        outputs: [{ name: "", type: "uint32", internalType: "uint32" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "s_keyHash",
        inputs: [],
        outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "s_numWords",
        inputs: [],
        outputs: [{ name: "", type: "uint32", internalType: "uint32" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "s_requestConfirmations",
        inputs: [],
        outputs: [{ name: "", type: "uint16", internalType: "uint16" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "s_subscriptionId",
        inputs: [],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "s_vrfCoordinator",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "address",
                internalType: "contract MockVRFCoordinatorV2Plus",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "setPlatformServiceCharge",
        inputs: [
            {
                name: "_newCharge",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "tickets",
        inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        outputs: [
            { name: "id", type: "uint256", internalType: "uint256" },
            {
                name: "raffleId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "owner",
                type: "address",
                internalType: "address",
            },
            { name: "isWinner", type: "bool", internalType: "bool" },
            {
                name: "purchaseTime",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "userHasTicketsInRaffle",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_user",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [{ name: "", type: "bool", internalType: "bool" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "userTickets",
        inputs: [
            { name: "", type: "address", internalType: "address" },
            { name: "", type: "uint256", internalType: "uint256" },
        ],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "userTicketsInRaffle",
        inputs: [
            { name: "", type: "uint256", internalType: "uint256" },
            { name: "", type: "address", internalType: "address" },
        ],
        outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "withdrawWinnings",
        inputs: [
            {
                name: "_raffleId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "event",
        name: "PrizeDeposited",
        inputs: [
            {
                name: "raffleId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
            {
                name: "depositor",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "token",
                type: "address",
                indexed: false,
                internalType: "address",
            },
            {
                name: "tokenId",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "amount",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "PrizeWithdrawn",
        inputs: [
            {
                name: "raffleId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
            {
                name: "winner",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "token",
                type: "address",
                indexed: false,
                internalType: "address",
            },
            {
                name: "tokenId",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "amount",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "RaffleCreated",
        inputs: [
            {
                name: "raffleId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
            {
                name: "creator",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "description",
                type: "string",
                indexed: false,
                internalType: "string",
            },
            {
                name: "endTime",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "maxTickets",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "allowMultipleTickets",
                type: "bool",
                indexed: false,
                internalType: "bool",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "RaffleFinalized",
        inputs: [
            {
                name: "raffleId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
            {
                name: "winner",
                type: "address",
                indexed: true,
                internalType: "address",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "RandomWinnerRequested",
        inputs: [
            {
                name: "raffleId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
            {
                name: "requestId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "TicketPurchased",
        inputs: [
            {
                name: "raffleId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
            {
                name: "buyer",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "ticketId",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "amount",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "VRFConfigurationUpdated",
        inputs: [
            {
                name: "subscriptionId",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "keyHash",
                type: "bytes32",
                indexed: false,
                internalType: "bytes32",
            },
            {
                name: "callbackGasLimit",
                type: "uint32",
                indexed: false,
                internalType: "uint32",
            },
            {
                name: "requestConfirmations",
                type: "uint16",
                indexed: false,
                internalType: "uint16",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "WinnerSelected",
        inputs: [
            {
                name: "raffleId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
            {
                name: "winner",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "ticketId",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "WinningsWithdrawn",
        inputs: [
            {
                name: "raffleId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
            {
                name: "winner",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "amount",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
        ],
        anonymous: false,
    },
] as const;
