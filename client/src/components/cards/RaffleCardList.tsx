import React from "react";
import RaffleCard from "./RaffleCard";
import type { RaffleCardViewModel } from "./raffleCardViewModel";

type RaffleCardListProps = {
    viewModels: RaffleCardViewModel[];
    onEnter?: (raffleId: number) => void;
};

const RaffleCardList: React.FC<RaffleCardListProps> = ({ viewModels, onEnter }) => {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {viewModels.map((viewModel) => (
                <RaffleCard
                    key={viewModel.raffleId}
                    viewModel={viewModel}
                    onEnter={() => onEnter?.(viewModel.raffleId)}
                />
            ))}
        </div>
    );
};

export default RaffleCardList;
