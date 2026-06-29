import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    toRaffleCardViewModel,
    formattedRaffleToViewModel,
    buildCountdown,
    FALLBACK_IMAGE,
} from "./raffleCardViewModel";
import type { ApiRaffleListItem, ApiRaffleDetail, FormattedRaffle } from "../../types/types";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const NOW_S = 1_700_000_000; // fixed "now" in seconds

function makeItem(overrides: Partial<ApiRaffleListItem> = {}): ApiRaffleListItem {
    return {
        id: 1,
        creator: "GABC",
        status: "open",
        ticket_price: "10",
        asset: "XLM",
        max_tickets: 100,
        tickets_sold: 50,
        end_time: new Date((NOW_S + 7 * 86400) * 1000).toISOString(), // 7 days out
        winner: null,
        prize_amount: "500",
        created_ledger: 1000,
        finalized_ledger: null,
        metadata_cid: null,
        created_at: new Date(NOW_S * 1000).toISOString(),
        ...overrides,
    };
}

function makeDetail(overrides: Partial<ApiRaffleDetail> = {}): ApiRaffleDetail {
    return {
        ...makeItem(),
        title: "My Cool Raffle",
        description: "A great raffle",
        image_url: "https://example.com/img.jpg",
        category: "Gaming",
        ...overrides,
    } as ApiRaffleDetail;
}

function makeFormattedRaffle(overrides: Partial<FormattedRaffle> = {}): FormattedRaffle {
    return {
        id: 1,
        creator: "GABC",
        status: "open",
        description: "Raffle #1",
        endTime: NOW_S + 7 * 86400,
        maxTickets: 100,
        allowMultipleTickets: true,
        ticketPrice: "10",
        ticketToken: "XLM",
        totalTicketsSold: 50,
        winner: null,
        winningTicketId: 0,
        isActive: true,
        isFinalized: false,
        winningsWithdrawn: false,
        countdown: { days: "07", hours: "00", minutes: "00", seconds: "00" },
        progress: 50,
        entries: 50,
        ticketPriceFormatted: "10.000 XLM",
        prizeValue: "500",
        prizeCurrency: "XLM",
        buttonText: "Enter Raffle",
        image: "https://example.com/img.jpg",
        metadata: {
            title: "My Cool Raffle",
            description: "A great raffle",
            image: "https://example.com/img.jpg",
            prizeName: "My Cool Raffle",
            prizeValue: "500",
            prizeCurrency: "XLM",
            category: "Gaming",
            tags: [],
            createdBy: "GABC",
            createdAt: NOW_S * 1000,
            updatedAt: NOW_S * 1000,
        },
        ...overrides,
    };
}

// ── Pin Date.now so status derivation is deterministic ─────────────────────────

beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW_S * 1000);
});
afterEach(() => {
    vi.restoreAllMocks();
});

// ── buildCountdown ─────────────────────────────────────────────────────────────

describe("buildCountdown", () => {
    it("returns zero-padded segments for exactly 1 day 2 h 3 m 4 s", () => {
        const endTime = NOW_S + 86400 + 2 * 3600 + 3 * 60 + 4;
        expect(buildCountdown(endTime)).toEqual({
            days: "01",
            hours: "02",
            minutes: "03",
            seconds: "04",
        });
    });

    it("clamps to 00:00:00:00 when end time is in the past", () => {
        expect(buildCountdown(NOW_S - 60)).toEqual({
            days: "00",
            hours: "00",
            minutes: "00",
            seconds: "00",
        });
    });

    it("zero-pads single-digit values", () => {
        const endTime = NOW_S + 9; // 9 seconds
        const cd = buildCountdown(endTime);
        expect(cd.days).toBe("00");
        expect(cd.hours).toBe("00");
        expect(cd.minutes).toBe("00");
        expect(cd.seconds).toBe("09");
    });
});

// ── toRaffleCardViewModel ──────────────────────────────────────────────────────

describe("toRaffleCardViewModel", () => {
    describe("status derivation", () => {
        it("sets status to 'live' for an open raffle with > 24 h remaining", () => {
            const vm = toRaffleCardViewModel(makeItem());
            expect(vm.status).toBe("live");
            expect(vm.statusLabel).toBe("Live");
        });

        it("sets status to 'ending-soon' when remaining ≤ 24 h", () => {
            const item = makeItem({
                end_time: new Date((NOW_S + 3600) * 1000).toISOString(), // 1 h
            });
            const vm = toRaffleCardViewModel(item);
            expect(vm.status).toBe("ending-soon");
            expect(vm.statusLabel).toBe("Ending Soon");
        });

        it("sets status to 'finalized' for a finalized raffle regardless of end_time", () => {
            const item = makeItem({
                status: "finalized",
                end_time: new Date((NOW_S - 86400) * 1000).toISOString(),
            });
            expect(toRaffleCardViewModel(item).status).toBe("finalized");
        });

        it("sets status to 'cancelled' for a cancelled raffle", () => {
            const item = makeItem({ status: "cancelled" });
            expect(toRaffleCardViewModel(item).status).toBe("cancelled");
        });

        it("is case-insensitive for the api status field", () => {
            expect(toRaffleCardViewModel(makeItem({ status: "FINALIZED" })).status).toBe("finalized");
            expect(toRaffleCardViewModel(makeItem({ status: "Cancelled" })).status).toBe("cancelled");
        });
    });

    describe("image fallback", () => {
        it("uses image_url from ApiRaffleDetail when present", () => {
            const vm = toRaffleCardViewModel(makeDetail());
            expect(vm.imageUrl).toBe("https://example.com/img.jpg");
        });

        it("falls back to FALLBACK_IMAGE when image_url is null", () => {
            const vm = toRaffleCardViewModel(makeDetail({ image_url: null }));
            expect(vm.imageUrl).toBe(FALLBACK_IMAGE);
        });

        it("falls back to FALLBACK_IMAGE when image_url is undefined (list item)", () => {
            // ApiRaffleListItem has no image_url field at all
            const vm = toRaffleCardViewModel(makeItem());
            expect(vm.imageUrl).toBe(FALLBACK_IMAGE);
        });
    });

    describe("title", () => {
        it("uses the detail title when provided", () => {
            expect(toRaffleCardViewModel(makeDetail({ title: "Epic Prize" })).title).toBe("Epic Prize");
        });

        it("falls back to 'Raffle #<id>' when title is undefined", () => {
            expect(toRaffleCardViewModel(makeItem({ id: 7 })).title).toBe("Raffle #7");
        });
    });

    describe("ticket price formatting", () => {
        it("formats ticket price to 3 decimal places with asset", () => {
            const vm = toRaffleCardViewModel(makeItem({ ticket_price: "10", asset: "XLM" }));
            expect(vm.ticketPrice).toBe("10.000 XLM");
        });

        it("defaults asset to 'XLM' when missing", () => {
            const item = makeItem({ asset: "" });
            expect(toRaffleCardViewModel(item).ticketPrice).toMatch(/XLM$/);
        });
    });

    describe("progress calculation", () => {
        it("computes progress as (sold / max) * 100", () => {
            const vm = toRaffleCardViewModel(makeItem({ tickets_sold: 30, max_tickets: 100 }));
            expect(vm.progress).toBe(30);
        });

        it("clamps progress to 100 if tickets_sold > max_tickets", () => {
            const vm = toRaffleCardViewModel(makeItem({ tickets_sold: 120, max_tickets: 100 }));
            expect(vm.progress).toBe(100);
        });

        it("returns 0 when max_tickets is 0", () => {
            const vm = toRaffleCardViewModel(makeItem({ max_tickets: 0, tickets_sold: 0 }));
            expect(vm.progress).toBe(0);
        });
    });

    describe("button text", () => {
        it("returns 'Enter Raffle' for live", () => {
            expect(toRaffleCardViewModel(makeItem()).buttonText).toBe("Enter Raffle");
        });

        it("returns 'Enter Raffle' for ending-soon", () => {
            const item = makeItem({ end_time: new Date((NOW_S + 3600) * 1000).toISOString() });
            expect(toRaffleCardViewModel(item).buttonText).toBe("Enter Raffle");
        });

        it("returns 'View Winner' for finalized", () => {
            expect(toRaffleCardViewModel(makeItem({ status: "finalized" })).buttonText).toBe("View Winner");
        });

        it("returns 'Cancelled' for cancelled", () => {
            expect(toRaffleCardViewModel(makeItem({ status: "cancelled" })).buttonText).toBe("Cancelled");
        });
    });

    describe("winner", () => {
        it("preserves winner address from the item", () => {
            const vm = toRaffleCardViewModel(makeItem({ winner: "GXYZ123" }));
            expect(vm.winner).toBe("GXYZ123");
        });

        it("sets winner to null when absent", () => {
            expect(toRaffleCardViewModel(makeItem({ winner: null })).winner).toBeNull();
        });
    });

    describe("prize amount", () => {
        it("falls back to '0' when prize_amount is null", () => {
            const vm = toRaffleCardViewModel(makeItem({ prize_amount: null }));
            expect(vm.prizeValue).toBe("0");
        });
    });
});

// ── formattedRaffleToViewModel ─────────────────────────────────────────────────

describe("formattedRaffleToViewModel", () => {
    it("maps all core fields correctly", () => {
        const vm = formattedRaffleToViewModel(makeFormattedRaffle());
        expect(vm.raffleId).toBe(1);
        expect(vm.title).toBe("My Cool Raffle");
        expect(vm.ticketPrice).toBe("10.000 XLM");
        expect(vm.entries).toBe(50);
        expect(vm.progress).toBe(50);
        expect(vm.winner).toBeNull();
    });

    it("uses FALLBACK_IMAGE when both image and metadata.image are empty", () => {
        const vm = formattedRaffleToViewModel(
            makeFormattedRaffle({ image: "", metadata: { title: "", description: "", image: "", prizeName: "", prizeValue: "0", prizeCurrency: "XLM", category: "", tags: [], createdBy: "", createdAt: 0, updatedAt: 0 } })
        );
        expect(vm.imageUrl).toBe(FALLBACK_IMAGE);
    });

    it("derives 'finalized' status from raffle.status", () => {
        const vm = formattedRaffleToViewModel(
            makeFormattedRaffle({ status: "finalized", endTime: NOW_S - 86400 })
        );
        expect(vm.status).toBe("finalized");
    });

    it("passes through the pre-formatted ticketPriceFormatted as ticketPrice", () => {
        const vm = formattedRaffleToViewModel(
            makeFormattedRaffle({ ticketPriceFormatted: "25.500 USDC" })
        );
        expect(vm.ticketPrice).toBe("25.500 USDC");
    });
});
