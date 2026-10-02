/**
 * CreatorProfile Page Tests (#1541)
 *
 * The address on this route comes straight from the URL (`/creators/:address`),
 * so the page has to reject a malformed one without hitting the API, and has to
 * have a defined state for every outcome of a well-formed one.
 *
 * The fixtures below were verified against `StrKey.isValidEd25519PublicKey`
 * from @stellar/stellar-base: `VALID_ADDRESS` / `VALID_ADDRESS_NO_RAFFLES` are
 * genuine strkey accounts, `BAD_CHECKSUM_ADDRESS` differs from a valid one in
 * its final character only, and `SECRET_KEY` is a valid strkey of the wrong
 * type (an `S...` secret key, not a `G...` account).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CreatorProfile from "./CreatorProfile";
import { isValidStellarAddress } from "../utils/stellarAddress";
import { ApiError, ApiErrorCode } from "../services/apiClient";
import { useUserProfile, useRaffles, type RaffleQueryStatus } from "../hooks/useRaffles";
import type { ApiRaffleListItem } from "../types/raffle";
import type { ApiUserProfile } from "../types/user";

// The page mounts a real RaffleCard, which reaches for the wallet context and
// the ticket-purchase mutation. Those are not what this spec is about, so the
// card is stubbed and the assertions stay on the page's own states.
vi.mock("../components/cards/RaffleCard", () => ({
    default: ({ viewModel }: { viewModel: { raffleId: number; title: string } }) => (
        <div data-testid="raffle-card">{viewModel.title}</div>
    ),
}));

vi.mock("../hooks/useRaffles", () => ({
    useUserProfile: vi.fn(),
    useRaffles: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_ADDRESS = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
const VALID_ADDRESS_NO_RAFFLES = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const BAD_CHECKSUM_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHA";
const SECRET_KEY = "SADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP54X";

const MALFORMED_ADDRESSES: ReadonlyArray<readonly [string, string]> = [
    ["a string that is not an address", "not-a-stellar-address"],
    ["an address whose checksum does not match", BAD_CHECKSUM_ADDRESS],
    ["a secret key rather than an account", SECRET_KEY],
];

const mockUseUserProfile = vi.mocked(useUserProfile);
const mockUseRaffles = vi.mocked(useRaffles);

const profileResult = (
    profile: ApiUserProfile | null,
    error: Error | null = null,
): ReturnType<typeof useUserProfile> => ({
    profile,
    isLoading: false,
    error,
    refetch: vi.fn(),
});

const raffleStatus = (overrides: Partial<RaffleQueryStatus> = {}): RaffleQueryStatus => ({
    isLoading: false,
    isRefreshing: false,
    isSuccess: true,
    isEmpty: false,
    isError: false,
    isStale: false,
    ...overrides,
});

const rafflesResult = (raffles: ApiRaffleListItem[]): ReturnType<typeof useRaffles> => ({
    raffles,
    total: raffles.length,
    status: raffleStatus({ isEmpty: raffles.length === 0 }),
    error: null,
    refetch: vi.fn(),
    retry: vi.fn(),
});

const rafflesFailure = (error: Error): ReturnType<typeof useRaffles> => ({
    raffles: [],
    total: 0,
    status: raffleStatus({ isSuccess: false, isError: true }),
    error,
    refetch: vi.fn(),
    retry: vi.fn(),
});

const userProfile = (overrides: Partial<ApiUserProfile> = {}): ApiUserProfile => ({
    address: VALID_ADDRESS,
    total_tickets_bought: 3,
    total_raffles_entered: 2,
    total_raffles_won: 1,
    total_prize_xlm: "25.0000000",
    first_seen_ledger: 1000,
    updated_at: new Date().toISOString(),
    creator_stats: {
        raffles_created: 1,
        total_tickets_sold: 4,
        total_xlm_raised: "40.0000000",
        participant_win_rate: 25,
    },
    ...overrides,
});

const raffleItem = (overrides: Partial<ApiRaffleListItem> = {}): ApiRaffleListItem => ({
    id: 42,
    creator: VALID_ADDRESS,
    status: "open",
    ticket_price: "10000000",
    asset: "XLM",
    max_tickets: 100,
    tickets_sold: 4,
    end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    winner: null,
    prize_amount: "500000000",
    created_ledger: 1,
    finalized_ledger: null,
    metadata_cid: null,
    created_at: new Date().toISOString(),
    participant_count: 2,
    ...overrides,
});

const renderCreatorRoute = (address: string) =>
    render(
        <MemoryRouter initialEntries={[`/creators/${address}`]}>
            <Routes>
                <Route path="/creators/:address" element={<CreatorProfile />} />
            </Routes>
        </MemoryRouter>,
    );

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
});

// ── Address validation ────────────────────────────────────────────────────────

describe("isValidStellarAddress", () => {
    it("accepts verified strkey account addresses", () => {
        expect(isValidStellarAddress(VALID_ADDRESS)).toBe(true);
        expect(isValidStellarAddress(VALID_ADDRESS_NO_RAFFLES)).toBe(true);
    });

    it("rejects a checksum mismatch even when the encoding looks right", () => {
        expect(isValidStellarAddress(BAD_CHECKSUM_ADDRESS)).toBe(false);
    });

    it("rejects a strkey of the wrong type", () => {
        expect(isValidStellarAddress(SECRET_KEY)).toBe(false);
    });

    it("rejects wrong lengths, non-base32 characters and lowercase input", () => {
        const rejected = [
            VALID_ADDRESS.slice(0, 55),
            `${VALID_ADDRESS}A`,
            VALID_ADDRESS.toLowerCase(),
            "G".repeat(56),
            `G${"0".repeat(55)}`,
        ];
        for (const address of rejected) {
            expect(isValidStellarAddress(address)).toBe(false);
        }
    });

    it("rejects missing values", () => {
        expect(isValidStellarAddress("")).toBe(false);
        expect(isValidStellarAddress(null)).toBe(false);
        expect(isValidStellarAddress(undefined)).toBe(false);
    });
});

// ── Route behaviour ───────────────────────────────────────────────────────────

describe("CreatorProfile", () => {
    describe("malformed addresses", () => {
        it.each(MALFORMED_ADDRESSES)(
            "renders the not-found state for %s without issuing a request",
            (_label, address) => {
                renderCreatorRoute(address);

                expect(screen.getByText("Creator not found")).toBeInTheDocument();
                expect(screen.getByText(address)).toBeInTheDocument();

                // The body never mounts, so neither query runs.
                expect(mockUseUserProfile).not.toHaveBeenCalled();
                expect(mockUseRaffles).not.toHaveBeenCalled();
            },
        );
    });

    describe("a valid creator", () => {
        it("renders the creator's raffles", () => {
            mockUseUserProfile.mockReturnValue(profileResult(userProfile()));
            mockUseRaffles.mockReturnValue(rafflesResult([raffleItem()]));

            renderCreatorRoute(VALID_ADDRESS);

            expect(screen.getByText(VALID_ADDRESS)).toBeInTheDocument();
            expect(screen.getByText("Raffles by this Creator")).toBeInTheDocument();
            expect(screen.getAllByTestId("raffle-card")).toHaveLength(1);
            expect(screen.queryByText("No raffles yet")).not.toBeInTheDocument();

            // The query is scoped to the address from the URL.
            expect(mockUseRaffles).toHaveBeenCalledWith(
                expect.objectContaining({ creator: VALID_ADDRESS }),
            );
        });

        it("renders the shared empty state when the creator has no raffles", () => {
            mockUseUserProfile.mockReturnValue(profileResult(userProfile()));
            mockUseRaffles.mockReturnValue(rafflesResult([]));

            renderCreatorRoute(VALID_ADDRESS_NO_RAFFLES);

            expect(screen.getByText("No raffles yet")).toBeInTheDocument();
            expect(
                screen.getByText("This creator hasn't published any raffles yet."),
            ).toBeInTheDocument();
            expect(screen.queryAllByTestId("raffle-card")).toHaveLength(0);
        });

        it("renders a retryable error when the raffle request fails", () => {
            mockUseUserProfile.mockReturnValue(profileResult(userProfile()));
            mockUseRaffles.mockReturnValue(rafflesFailure(new Error("network down")));

            renderCreatorRoute(VALID_ADDRESS);

            expect(screen.getByText("Failed to load raffles")).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
        });

        it("renders a retryable error when the profile request fails", () => {
            mockUseUserProfile.mockReturnValue(
                profileResult(null, new Error("Failed to load creator profile")),
            );
            mockUseRaffles.mockReturnValue(rafflesResult([]));

            renderCreatorRoute(VALID_ADDRESS);

            expect(screen.getByText("Failed to load creator profile")).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
        });

        it("renders the not-found state when the profile request returns 404", () => {
            mockUseUserProfile.mockReturnValue(
                profileResult(
                    null,
                    new ApiError(ApiErrorCode.NOT_FOUND, "Creator not found", 404),
                ),
            );
            mockUseRaffles.mockReturnValue(rafflesResult([]));

            renderCreatorRoute(VALID_ADDRESS);

            expect(screen.getByText("Creator not found")).toBeInTheDocument();
        });
    });
});
