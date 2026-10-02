// Transparency page — container component.
// All data-fetching lives in useTransparency; rendering is delegated to the
// components in client/src/components/transparency/.

import { useTranslation } from "react-i18next";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import TransparencyHeader from "../components/transparency/TransparencyHeader";
import StatsGrid from "../components/transparency/StatsGrid";
import VerifyDrawForm from "../components/transparency/VerifyDrawForm";
import AuditLogTable from "../components/transparency/AuditLogTable";
import { useTransparency } from "../hooks/useTransparency";

const Transparency = () => {
    const { t } = useTranslation("transparency");
    const {
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
    } = useTransparency();

    return (
        <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-8 flex flex-col gap-6">
            <div className="-mb-2">
                <Breadcrumbs />
            </div>

            <TransparencyHeader />

            <StatsGrid stats={stats} loading={statsLoading} />

            {/* Oracle Public Key */}
            <div className="bg-white dark:bg-[#11172E] rounded-3xl p-6 flex flex-col gap-2">
                <span className="text-gray-400 text-xs uppercase tracking-wide">
                    {t("oracleKey.label")}
                </span>
                {statsLoading ? (
                    <div className="h-5 w-96 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                ) : (
                    <div className="flex items-center gap-3">
                        <span className="text-gray-900 dark:text-white font-mono text-sm break-all">
                            {stats?.oracle_public_key || t("oracleKey.notConfigured")}
                        </span>
                        {stats?.oracle_public_key && (
                            <button
                                onClick={copyOracleKey}
                                className="shrink-0 text-xs px-3 py-1 rounded-lg bg-gray-100 dark:bg-[#161d38] text-gray-600 dark:text-gray-300 hover:text-pink-600 dark:hover:text-[#FF389C] transition-colors"
                            >
                                {copied ? t("oracleKey.copied") : t("oracleKey.copy")}
                            </button>
                        )}
                    </div>
                )}
            </div>

            <VerifyDrawForm
                raffleId={verifyRaffleId}
                onRaffleIdChange={setVerifyRaffleId}
                onSubmit={handleVerify}
                verifying={verifying}
                result={verifyResult}
            />

            <AuditLogTable
                entries={entries}
                total={total}
                page={page}
                onPageChange={setPage}
                raffleFilter={raffleFilter}
                onRaffleFilterChange={setRaffleFilter}
                loading={logLoading}
                error={logError}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                onVerifyFromRow={(raffleId) =>
                    setVerifyRaffleId(String(raffleId))
                }
            />
        </div>
    );
};

export default Transparency;
