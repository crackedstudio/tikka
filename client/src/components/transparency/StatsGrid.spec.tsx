import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import StatsGrid from "./StatsGrid";
import type { TransparencyStats } from "./types";

const makeStats = (overrides: Partial<TransparencyStats> = {}): TransparencyStats => ({
    total_raffles: 42,
    total_tickets: 1000,
    total_volume_xlm: "9999.00",
    prizes_distributed_xlm: "5000.00",
    draws_completed: 40,
    oracle_public_key: "GABC1234",
    recent_audit_log: [],
    ...overrides,
});

describe("StatsGrid", () => {
    it("renders skeleton cards while loading", () => {
        const { container } = render(<StatsGrid stats={null} loading={true} />);
        // 4 skeleton divs with animate-pulse
        expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
    });

    it("renders Total Raffles count", () => {
        render(<StatsGrid stats={makeStats({ total_raffles: 99 })} loading={false} />);
        expect(screen.getByText("99")).toBeInTheDocument();
    });

    it("renders XLM distributed with locale formatting", () => {
        render(
            <StatsGrid
                stats={makeStats({ prizes_distributed_xlm: "5000.00" })}
                loading={false}
            />
        );
        expect(screen.getByText(/5,000 XLM|5000 XLM/)).toBeInTheDocument();
    });

    it("shows platform uptime as 99.99%", () => {
        render(<StatsGrid stats={makeStats()} loading={false} />);
        expect(screen.getByText("99.99%")).toBeInTheDocument();
    });

    it("shows em-dash when recent_audit_log is empty", () => {
        render(
            <StatsGrid
                stats={makeStats({ recent_audit_log: [] })}
                loading={false}
            />
        );
        expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("renders truncated proof linked to Stellar Expert via tx_hash", () => {
        const entry = {
            id: "1",
            timestamp: new Date(0).toISOString(),
            raffle_id: 7,
            request_id: "req-abc",
            oracle_id: "oracle-1",
            proof: "aabbccddeeff0011223344556677889900112233445566778899aabbccddeeff",
            seed: "deadbeef",
            tx_hash: "TXHASH_STELLAR_XYZ",
            method: "VRF" as const,
        };
        render(
            <StatsGrid
                stats={makeStats({ recent_audit_log: [entry] })}
                loading={false}
            />
        );
        const link = screen.getByRole("link", { name: /aabbccddee/ });
        expect(link).toHaveAttribute(
            "href",
            "https://stellar.expert/explorer/public/tx/TXHASH_STELLAR_XYZ"
        );
    });

    it("shows em-dash when stats is null and not loading", () => {
        render(<StatsGrid stats={null} loading={false} />);
        // prizes_distributed_xlm fallback
        expect(screen.getByText("—")).toBeInTheDocument();
    });
});
