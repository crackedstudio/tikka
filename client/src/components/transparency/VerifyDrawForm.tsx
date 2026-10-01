// Verify-a-Draw form for the Transparency page.
// Accepts a raffle ID, looks up the audit log entry, then calls the verify
// endpoint to confirm the VRF/PRNG proof matches the submitted seed.

import type { VerifyResult } from "./types";

interface VerifyDrawFormProps {
    raffleId: string;
    onRaffleIdChange: (value: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    verifying: boolean;
    result: VerifyResult | null;
}

const VerifyDrawForm = ({
    raffleId,
    onRaffleIdChange,
    onSubmit,
    verifying,
    result,
}: VerifyDrawFormProps) => (
    <div className="bg-white dark:bg-[#11172E] rounded-3xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Verify a Draw
            </h2>
            <a
                href="#audit-log"
                className="text-pink-600 dark:text-[#FF389C] text-sm hover:underline"
            >
                View Oracle Audit Log →
            </a>
        </div>

        <form
            onSubmit={onSubmit}
            className="flex flex-col md:flex-row items-center gap-4"
        >
            <input
                id="verify-raffle-id"
                type="text"
                placeholder="Paste Raffle ID to verify..."
                value={raffleId}
                onChange={(e) => onRaffleIdChange(e.target.value)}
                className="w-full md:w-96 bg-gray-50 dark:bg-[#161d38] text-gray-900 dark:text-white placeholder-gray-500 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-pink-500 dark:focus:border-[#FF389C]"
            />
            <button
                type="submit"
                disabled={verifying || !raffleId.trim()}
                className="px-6 py-2 rounded-xl bg-pink-600 dark:bg-[#FF389C] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity w-full md:w-auto shrink-0"
            >
                {verifying ? "Verifying…" : "Verify"}
            </button>

            {result && (
                <div
                    className={`text-sm font-semibold flex flex-col gap-1 ${
                        result.verified ? "text-green-500" : "text-red-400"
                    }`}
                >
                    <span>
                        {result.verified
                            ? "✓ Valid — draw result is authentic"
                            : `✗ Invalid — ${result.reason ?? "verification failed"}`}
                    </span>
                    {result.proof && (
                        <span className="text-gray-500 text-xs font-mono break-all max-w-lg">
                            Proof: {result.proof}
                        </span>
                    )}
                </div>
            )}
        </form>
    </div>
);

export default VerifyDrawForm;
