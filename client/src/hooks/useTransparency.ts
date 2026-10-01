// useTransparency — single data hook for the Transparency page.
// Encapsulates all fetch logic so the page component stays under ~150 lines.

import { useState, useEffect, useCallback } from "react";
import { api } from "../services/apiClient";
import { API_CONFIG } from "../config/api";
import type {
    AuditLogEntry,
    AuditLogResponse,
    TransparencyStats,
    VerifyResult,
} from "../components/transparency/types";
import { PAGE_SIZE, REFRESH_INTERVAL_MS } from "../components/transparency/types";

export type { AuditLogEntry, TransparencyStats, VerifyResult };

export function useTransparency() {
    // ── Stats ─────────────────────────────────────────────────────────────────
    const [stats, setStats] = useState<TransparencyStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    // ── Audit log ─────────────────────────────────────────────────────────────
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [raffleFilter, setRaffleFilter] = useState("");
    const [logLoading, setLogLoading] = useState(false);
    const [logError, setLogError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    // ── Verify form ───────────────────────────────────────────────────────────
    const [verifyRaffleId, setVerifyRaffleId] = useState("");
    const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
    const [verifying, setVerifying] = useState(false);

    // ── Fetch stats ───────────────────────────────────────────────────────────

    const fetchStats = useCallback(async () => {
        try {
            const data = await api.get<TransparencyStats>(
                API_CONFIG.endpoints.transparencyStats
            );
            setStats(data);
        } catch {
            // non-fatal — keep showing stale data
        } finally {
            setStatsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        const id = setInterval(fetchStats, REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [fetchStats]);

    // ── Fetch audit log ───────────────────────────────────────────────────────

    const fetchEntries = useCallback(async () => {
        setLogLoading(true);
        setLogError(null);
        try {
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(page * PAGE_SIZE),
            });
            if (raffleFilter.trim()) params.set("raffle_id", raffleFilter.trim());

            const data = await api.get<AuditLogResponse>(
                `${API_CONFIG.endpoints.transparency.list}?${params}`
            );
            setEntries(data.entries ?? []);
            setTotal(data.total ?? 0);
        } catch (e: unknown) {
            setLogError(
                e instanceof Error ? e.message : "Failed to load audit log"
            );
        } finally {
            setLogLoading(false);
        }
    }, [page, raffleFilter]);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    // ── Verify handler ────────────────────────────────────────────────────────

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!verifyRaffleId.trim()) return;

        setVerifying(true);
        setVerifyResult(null);
        try {
            const listRes = await api.get<AuditLogResponse>(
                `${API_CONFIG.endpoints.transparency.list}?raffle_id=${verifyRaffleId.trim()}`
            );
            if (!listRes.entries || listRes.entries.length === 0) {
                throw new Error("No audit log found for this Raffle ID.");
            }
            const txHash = listRes.entries[0].tx_hash;
            const result = await api.get<VerifyResult>(
                `${API_CONFIG.endpoints.verify}?txHash=${txHash}`
            );
            setVerifyResult(result);
        } catch (e: unknown) {
            setVerifyResult({
                verified: false,
                proof: "",
                reason:
                    e instanceof Error ? e.message : "Verification request failed",
            });
        } finally {
            setVerifying(false);
        }
    };

    const copyOracleKey = () => {
        if (!stats?.oracle_public_key) return;
        navigator.clipboard.writeText(stats.oracle_public_key).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const toggleExpand = (id: string) =>
        setExpanded((prev) => (prev === id ? null : id));

    return {
        // stats
        stats,
        statsLoading,
        copied,
        copyOracleKey,
        // audit log
        entries,
        total,
        page,
        setPage,
        raffleFilter,
        setRaffleFilter,
        logLoading,
        logError,
        expanded,
        toggleExpand,
        // verify
        verifyRaffleId,
        setVerifyRaffleId,
        verifyResult,
        verifying,
        handleVerify,
    };
}
