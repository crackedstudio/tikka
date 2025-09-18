import type { TrendingTabProps } from "../../types/types";

const TrendingTab = ({ activeTab, changeActiveTab }: TrendingTabProps) => {
    return (
        <div className="mt-16 flex space-x-16">
            <button
                onClick={() => changeActiveTab("All Raffles")}
                className={
                    activeTab === "All Raffles"
                        ? "text-white border-b-[2px] border-[#858584] text-[22px] font-semibold pb-2"
                        : "text-[#858584] text-[22px] font-semibold pb-2"
                }
            >
                All Raffles
            </button>
            <button
                onClick={() => changeActiveTab("New")}
                className={
                    activeTab === "New"
                        ? "text-white border-b-[2px] border-[#858584] text-[22px] font-semibold pb-2"
                        : "text-[#858584] text-[22px] font-semibold pb-2"
                }
            >
                New
            </button>
            <button
                onClick={() => changeActiveTab("Ending Soon")}
                className={
                    activeTab === "Ending Soon"
                        ? "text-white border-b-[2px] border-[#858584] text-[22px] font-semibold pb-2"
                        : "text-[#858584] text-[22px] font-semibold pb-2"
                }
            >
                Ending Soon
            </button>
            <button
                onClick={() => changeActiveTab("Biggest Prizes")}
                className={
                    activeTab === "Biggest Prizes"
                        ? "text-white border-b-[2px] border-[#858584] text-[22px] font-semibold pb-2"
                        : "text-[#858584] text-[22px] font-semibold pb-2"
                }
            >
                Biggest Prizes
            </button>
            <button
                onClick={() => changeActiveTab("Most Popular")}
                className={
                    activeTab === "Most Popular"
                        ? "text-white border-b-[2px] border-[#858584] text-[22px] font-semibold pb-2"
                        : "text-[#858584] text-[22px] font-semibold pb-2"
                }
            >
                Most Popular
            </button>
        </div>
    );
};

export default TrendingTab;
