import { describe, it, expect } from "vitest";
import { mergeRafflesById } from "./mergeRafflesById";
import type { ApiRaffleListItem } from "../types/raffle";

function makeItem(overrides: Partial<ApiRaffleListItem> = {}): ApiRaffleListItem {
    return {
        id: 1,
        creator: "GABC",
        status: "open",
        ticket_price: "10",
        asset: "XLM",
        max_tickets: 100,
        tickets_sold: 50,
        end_time: "2030-01-01T00:00:00.000Z",
        winner: null,
        prize_amount: "500",
        created_ledger: 1000,
        finalized_ledger: null,
        metadata_cid: null,
        created_at: "2024-01-01T00:00:00.000Z",
        ...overrides,
    };
}

function idsOf(items: ApiRaffleListItem[]): number[] {
    return items.map((r) => r.id);
}

describe("mergeRafflesById", () => {
    it("returns an empty list when all pages are empty", () => {
        expect(mergeRafflesById()).toEqual([]);
        expect(mergeRafflesById([])).toEqual([]);
        expect(mergeRafflesById([], [])).toEqual([]);
    });

    it("passes through a single page unchanged when ids are unique", () => {
        const page = [makeItem({ id: 1 }), makeItem({ id: 2 }), makeItem({ id: 3 })];
        expect(idsOf(mergeRafflesById(page))).toEqual([1, 2, 3]);
    });

    it("concatenates disjoint pages in first-seen order", () => {
        const page1 = [makeItem({ id: 1 }), makeItem({ id: 2 })];
        const page2 = [makeItem({ id: 3 }), makeItem({ id: 4 })];
        expect(idsOf(mergeRafflesById(page1, page2))).toEqual([1, 2, 3, 4]);
    });

    it("dedupes overlapping pages so duplicate ids cannot render twice", () => {
        const page1 = [
            makeItem({ id: 1, tickets_sold: 1 }),
            makeItem({ id: 2, tickets_sold: 2 }),
            makeItem({ id: 3, tickets_sold: 3 }),
        ];
        const page2 = [
            makeItem({ id: 3, tickets_sold: 30 }),
            makeItem({ id: 4, tickets_sold: 4 }),
            makeItem({ id: 5, tickets_sold: 5 }),
        ];

        const merged = mergeRafflesById(page1, page2);
        const ids = idsOf(merged);

        expect(ids).toEqual([1, 2, 3, 4, 5]);
        expect(new Set(ids).size).toBe(ids.length);
        expect(merged.find((r) => r.id === 3)?.tickets_sold).toBe(30);
    });

    it("handles empty pages mixed with data without introducing duplicates", () => {
        const page1 = [makeItem({ id: 10 }), makeItem({ id: 11 })];
        const page2: ApiRaffleListItem[] = [];
        const page3 = [makeItem({ id: 11, creator: "GUPDATED" }), makeItem({ id: 12 })];

        const merged = mergeRafflesById(page1, page2, page3);
        const ids = idsOf(merged);

        expect(ids).toEqual([10, 11, 12]);
        expect(new Set(ids).size).toBe(ids.length);
        expect(merged.find((r) => r.id === 11)?.creator).toBe("GUPDATED");
    });

    it("preserves first-seen order when pages arrive out of sequence with overlaps", () => {
        // Simulate a later offset page arriving/merged before an earlier page finishes updating.
        const laterPage = [
            makeItem({ id: 4, tickets_sold: 4 }),
            makeItem({ id: 5, tickets_sold: 5 }),
            makeItem({ id: 2, tickets_sold: 200 }),
        ];
        const earlierPage = [
            makeItem({ id: 1, tickets_sold: 1 }),
            makeItem({ id: 2, tickets_sold: 2 }),
            makeItem({ id: 3, tickets_sold: 3 }),
        ];

        const merged = mergeRafflesById(laterPage, earlierPage);
        const ids = idsOf(merged);

        expect(ids).toEqual([4, 5, 2, 1, 3]);
        expect(new Set(ids).size).toBe(ids.length);
        // Later write for id 2 in merge order comes from earlierPage.
        expect(merged.find((r) => r.id === 2)?.tickets_sold).toBe(2);
    });

    it("dedupes duplicates within a single page", () => {
        const page = [
            makeItem({ id: 1, tickets_sold: 1 }),
            makeItem({ id: 1, tickets_sold: 99 }),
            makeItem({ id: 2, tickets_sold: 2 }),
        ];

        const merged = mergeRafflesById(page);
        expect(idsOf(merged)).toEqual([1, 2]);
        expect(merged[0]?.tickets_sold).toBe(99);
    });

    it("matches Home infinite-scroll merge of initial raffles + extra pages", () => {
        const raffles = [makeItem({ id: 1 }), makeItem({ id: 2 }), makeItem({ id: 3 })];
        const extraRaffles = [
            makeItem({ id: 3 }),
            makeItem({ id: 4 }),
            makeItem({ id: 5 }),
            makeItem({ id: 6 }),
        ];

        const allRaffles = mergeRafflesById(raffles, extraRaffles);
        const ids = idsOf(allRaffles);

        expect(ids).toEqual([1, 2, 3, 4, 5, 6]);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
