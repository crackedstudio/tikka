import { describe, it, expect } from "vitest";
import { parseSearchParams, serializeSearchParams } from "./searchParams";
import type { SearchFilters } from "../types/types";

describe("parseSearchParams", () => {
    it("parses all valid params", () => {
        const params = new URLSearchParams(
            "q=test&status=open&min_price=10&max_price=100&creator=GABCDEF&sort=end_time_asc"
        );
        const result = parseSearchParams(params);
        expect(result).toEqual<SearchFilters>({
            q: "test",
            status: "open",
            min_price: "10",
            max_price: "100",
            creator: "GABCDEF",
            sort: "end_time_asc",
        });
    });

    it("returns empty object for empty params", () => {
        const result = parseSearchParams(new URLSearchParams(""));
        expect(result).toEqual<SearchFilters>({});
    });

    it("omits empty q", () => {
        const params = new URLSearchParams("q=");
        const result = parseSearchParams(params);
        expect(result.q).toBeUndefined();
    });

    it("omits whitespace-only q", () => {
        const params = new URLSearchParams("q=   ");
        const result = parseSearchParams(params);
        expect(result.q).toBeUndefined();
    });

    it("trims q value", () => {
        const params = new URLSearchParams("q=  hello  ");
        const result = parseSearchParams(params);
        expect(result.q).toBe("hello");
    });

    it("ignores invalid min_price (NaN)", () => {
        const params = new URLSearchParams("min_price=abc");
        const result = parseSearchParams(params);
        expect(result.min_price).toBeUndefined();
    });

    it("ignores negative min_price", () => {
        const params = new URLSearchParams("min_price=-5");
        const result = parseSearchParams(params);
        expect(result.min_price).toBeUndefined();
    });

    it("ignores invalid max_price (NaN)", () => {
        const params = new URLSearchParams("max_price=xyz");
        const result = parseSearchParams(params);
        expect(result.max_price).toBeUndefined();
    });

    it("ignores negative max_price", () => {
        const params = new URLSearchParams("max_price=-1");
        const result = parseSearchParams(params);
        expect(result.max_price).toBeUndefined();
    });

    it("accepts zero as min_price", () => {
        const params = new URLSearchParams("min_price=0");
        const result = parseSearchParams(params);
        expect(result.min_price).toBe("0");
    });

    it("parses decimal prices", () => {
        const params = new URLSearchParams("min_price=1.5&max_price=99.99");
        const result = parseSearchParams(params);
        expect(result.min_price).toBe("1.5");
        expect(result.max_price).toBe("99.99");
    });

    it("omits empty creator", () => {
        const params = new URLSearchParams("creator=");
        const result = parseSearchParams(params);
        expect(result.creator).toBeUndefined();
    });

    it("ignores unknown params", () => {
        const params = new URLSearchParams("q=test&unknown=value");
        const result = parseSearchParams(params);
        expect(result).toEqual<SearchFilters>({ q: "test" });
    });

    it("ignores empty sort", () => {
        const params = new URLSearchParams("sort=");
        const result = parseSearchParams(params);
        expect(result.sort).toBeUndefined();
    });
});

describe("serializeSearchParams", () => {
    it("serializes all fields", () => {
        const filters: SearchFilters = {
            q: "test",
            status: "open",
            min_price: "10",
            max_price: "100",
            creator: "GABCDEF",
            sort: "end_time_asc",
        };
        const params = serializeSearchParams(filters);
        expect(params.get("q")).toBe("test");
        expect(params.get("status")).toBe("open");
        expect(params.get("min_price")).toBe("10");
        expect(params.get("max_price")).toBe("100");
        expect(params.get("creator")).toBe("GABCDEF");
        expect(params.get("sort")).toBe("end_time_asc");
    });

    it("returns empty URLSearchParams for empty filters", () => {
        const params = serializeSearchParams({});
        expect([...params.entries()]).toHaveLength(0);
    });

    it("omits undefined fields", () => {
        const params = serializeSearchParams({ q: "test" });
        expect(params.get("q")).toBe("test");
        expect(params.get("status")).toBeNull();
    });
});

describe("parse + serialize round-trip", () => {
    it("preserves all fields through round-trip", () => {
        const original = "q=test&status=open&min_price=10&max_price=100&creator=GABCDEF&sort=end_time_asc";
        const parsed = parseSearchParams(new URLSearchParams(original));
        const serialized = serializeSearchParams(parsed);
        expect(serialized.toString()).toBe(original);
    });

    it("handles empty round-trip", () => {
        const parsed = parseSearchParams(new URLSearchParams(""));
        const serialized = serializeSearchParams(parsed);
        expect(serialized.toString()).toBe("");
    });
});
