import type { TrendingTabProps } from "../../types/types";

const OPTIONS = [
    "All Raffles",
    "New",
    "Ending Soon",
    "Biggest Prizes",
    "Most Popular",
] as const;

const TrendingTab = ({ activeTab, changeActiveTab }: TrendingTabProps) => {
    return (
        <div className="mt-8">
            {/* Mobile: dropdown */}
            <label htmlFor="trending-filter" className="sr-only">
                Trending filter
            </label>
            <select
                id="trending-filter"
                className="md:hidden w-full rounded-xl bg-[#121628] text-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
                value={activeTab}
                onChange={(e) => changeActiveTab(e.target.value)}
            >
                {OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                        {opt}
                    </option>
                ))}
            </select>

            {/* Desktop: tabs */}
            <div className="hidden md:flex items-center gap-8 mt-6 md:mt-0">
                {OPTIONS.map((opt) => {
                    const isActive = activeTab === opt;
                    return (
                        <button
                            key={opt}
                            onClick={() => changeActiveTab(opt)}
                            className={[
                                "pb-2 text-lg font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                                isActive
                                    ? "text-white border-b-2 border-[#858584]"
                                    : "text-[#858584] hover:text-white/80",
                            ].join(" ")}
                            aria-current={isActive ? "page" : undefined}
                        >
                            {opt}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default TrendingTab;
