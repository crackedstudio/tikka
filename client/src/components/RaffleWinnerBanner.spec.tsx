import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RaffleWinnerBanner from "./RaffleWinnerBanner";

describe("RaffleWinnerBanner", () => {
    it("matches the winner snapshot", () => {
        const { container } = render(
            <RaffleWinnerBanner
                isWinner
                prizeName="Lamborghini Aventador, Limited Edition 2023"
                prizeValue="$500,000"
                walletAddress="0x330cd8fec9c4e5b87c1d4f6a9b2e8c7f"
            />
        );

        expect(container.firstChild).toMatchSnapshot();
    });
});