

const BrowseRaffles = () => {
    return (
        <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16">
            {/* Use column on small screens, row on md+ to preserve desktop look */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
                {/* Left column: headings + search */}
                <div className="flex flex-col space-y-5 flex-1">
                    <h1 className="text-3xl sm:text-4xl md:text-[51px] font-semibold">
                        Browse Raffles
                    </h1>
                    <h3 className="text-lg md:text-[22px]">
                        Browse through more than 50k raffles
                    </h3>

                    {/* Search (full width and centered on small screens) */}
                    
                </div>

                {/* Right card: keeps same width/appearance on desktop; stacks under left on mobile */}
                <aside className="w-full md:w-auto md:flex-shrink-0">
                    <div className="bg-[#11172E] border border-[#1F263F] rounded-xl p-5 w-full max-w-sm mx-auto md:mx-0">
                        <h2 className="font-semibold text-[22px]">
                            Host your raffle
                        </h2>
                        <p className="text-[#9CA3AF] text-[16px] mt-1">
                            Join the most exciting raffle demo platform where
                        </p>

                        <div className="mt-5 w-full">
                            <button className="bg-[#fe3796] px-10 md:px-16 py-4 rounded-xl flex items-center justify-center space-x-4 w-full">
                                <span className="font-semibold">
                                    Create New Raffle
                                </span>
                            </button>
                        </div>

                        <p className="text-[#E5E7EB] text-[12px] mt-2">
                            Provably Fair — Powered by Chainlink VRF
                        </p>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default BrowseRaffles;
