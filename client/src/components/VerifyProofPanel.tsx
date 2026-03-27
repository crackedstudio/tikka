import { useState } from "react";
import { API_CONFIG } from "../config/api";

type VerifyMethod = "VRF" | "PRNG";

interface VerifyResult {
    valid: boolean;
    method: VerifyMethod;
    checks: {
        signatureValid?: boolean;
        seedMatchesProof?: boolean;
        seedMatchesInput?: boolean;
        proofMatchesInput?: boolean;
    };
    error?: string;
}

interface Props {
    /** Pre-fill fields from an audit log entry */
    prefill?: {
        key: string;
        input: string;
        proof: string;
        seed: string;
        method: VerifyMethod;
    };
}

const VerifyProofPanel = ({ prefill }: Props) => {
    const [key, setKey] = useState(prefill?.key ?? "");
    const [input, setInput] = useState(prefill?.input ?? "");
    const [proof, setProof] = useState(prefill?.proof ?? "");
    const [seed, setSeed] = useState(prefill?.seed ?? "");
    const [method, setMethod] = useState<VerifyMethod>(prefill?.method ?? "VRF");
    const [raffleId, setRaffleId] = useState("");
    const [result, setResult] = useState<VerifyResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleVerify = async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const body: Record<string, unknown> = { key, input, proof, seed, method };
            if (method === "PRNG" && raffleId.trim()) {
                body.raffleId = parseInt(raffleId, 10);
            }
            const res = await fetch(
                `${API_CONFIG.oracleUrl}${API_CONFIG.endpoints.transparency.verifyProof}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                },
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setResult(await res.json());
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Verification request failed");
        } finally {
            setLoading(false);
        }
    };

    const canSubmit = key && input && proof && seed && !loading;

    return (
        <div className="bg-[#11172E] rounded-3xl p-8 flex flex-col gap-5">
            <div>
                <h2 className="text-white text-xl font-semibold mb-1">Verify Result</h2>
                <p className="text-gray-400 text-sm">
                    Independently verify any oracle proof off-chain using the same
                    cryptography as the oracle service.
                </p>
            </div>

            {/* Method toggle */}
            <div className="flex gap-2">
                {(["VRF", "PRNG"] as VerifyMethod[]).map((m) => (
                    <button
                        key={m}
                        onClick={() => setMethod(m)}
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                            method === m
                                ? m === "VRF"
                                    ? "bg-purple-700 text-purple-100"
                                    : "bg-blue-700 text-blue-100"
                                : "bg-[#1a2240] text-gray-400 hover:text-white"
                        }`}
                    >
                        {m}
                    </button>
                ))}
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-1 gap-3">
                <Field
                    label="Oracle Public Key (hex)"
                    value={key}
                    onChange={setKey}
                    placeholder="32-byte hex (64 chars)"
                    mono
                />
                <Field
                    label="Input / Request ID"
                    value={input}
                    onChange={setInput}
                    placeholder="requestId string"
                    mono
                />
                <Field
                    label="Proof (hex)"
                    value={proof}
                    onChange={setProof}
                    placeholder="64-byte hex (128 chars)"
                    mono
                />
                <Field
                    label="Seed (hex)"
                    value={seed}
                    onChange={setSeed}
                    placeholder="32-byte hex (64 chars)"
                    mono
                />
                {method === "PRNG" && (
                    <Field
                        label="Raffle ID (optional)"
                        value={raffleId}
                        onChange={setRaffleId}
                        placeholder="numeric raffle ID"
                    />
                )}
            </div>

            <button
                onClick={handleVerify}
                disabled={!canSubmit}
                className="self-start px-6 py-2.5 rounded-xl bg-[#FF389C] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#e02d88] transition-colors"
            >
                {loading ? "Verifying…" : "Verify Proof"}
            </button>

            {error && (
                <p className="text-red-400 text-sm">{error}</p>
            )}

            {result && <VerifyResultCard result={result} />}
        </div>
    );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const Field = ({
    label,
    value,
    onChange,
    placeholder,
    mono = false,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    mono?: boolean;
}) => (
    <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-xs">{label}</label>
        <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`bg-[#0d1225] text-white placeholder-gray-600 border border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#FF389C] ${mono ? "font-mono" : ""}`}
        />
    </div>
);

const CheckRow = ({ label, ok }: { label: string; ok: boolean }) => (
    <div className="flex items-center gap-2 text-sm">
        <span className={ok ? "text-green-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
        <span className="text-gray-300">{label}</span>
    </div>
);

const VerifyResultCard = ({ result }: { result: VerifyResult }) => {
    const { valid, method, checks, error } = result;
    return (
        <div
            className={`rounded-2xl p-5 border ${
                valid
                    ? "border-green-700 bg-green-950/40"
                    : "border-red-700 bg-red-950/40"
            }`}
        >
            <div className="flex items-center gap-3 mb-3">
                <span
                    className={`text-2xl font-bold ${valid ? "text-green-400" : "text-red-400"}`}
                >
                    {valid ? "✓ Valid" : "✗ Invalid"}
                </span>
                <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        method === "VRF"
                            ? "bg-purple-900 text-purple-300"
                            : "bg-blue-900 text-blue-300"
                    }`}
                >
                    {method}
                </span>
            </div>

            <div className="flex flex-col gap-1.5">
                {method === "VRF" && (
                    <>
                        <CheckRow
                            label="Ed25519 signature valid"
                            ok={checks.signatureValid ?? false}
                        />
                        <CheckRow
                            label="Seed = SHA-256(proof)"
                            ok={checks.seedMatchesProof ?? false}
                        />
                    </>
                )}
                {method === "PRNG" && (
                    <>
                        <CheckRow
                            label="Seed matches input derivation"
                            ok={checks.seedMatchesInput ?? false}
                        />
                        <CheckRow
                            label="Proof matches input derivation"
                            ok={checks.proofMatchesInput ?? false}
                        />
                    </>
                )}
            </div>

            {error && (
                <p className="mt-3 text-red-400 text-xs font-mono">{error}</p>
            )}
        </div>
    );
};

export default VerifyProofPanel;
