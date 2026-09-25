import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnlineStatus } from "./useOnlineStatus";

describe("useOnlineStatus", () => {
    const originalNavigatorOnLine = Object.getOwnPropertyDescriptor(
        Navigator.prototype,
        "onLine",
    );

    function setNavigatorOnLine(value: boolean) {
        Object.defineProperty(navigator, "onLine", {
            configurable: true,
            get: () => value,
        });
    }

    afterEach(() => {
        // Restore original descriptor after each test
        if (originalNavigatorOnLine) {
            Object.defineProperty(Navigator.prototype, "onLine", originalNavigatorOnLine);
        }
        vi.restoreAllMocks();
    });

    it("returns isOnline=true and isOffline=false when initially online", () => {
        setNavigatorOnLine(true);
        const { result } = renderHook(() => useOnlineStatus());
        expect(result.current.isOnline).toBe(true);
        expect(result.current.isOffline).toBe(false);
    });

    it("returns isOnline=false and isOffline=true when initially offline", () => {
        setNavigatorOnLine(false);
        const { result } = renderHook(() => useOnlineStatus());
        expect(result.current.isOnline).toBe(false);
        expect(result.current.isOffline).toBe(true);
    });

    it("updates to offline when the 'offline' window event fires", () => {
        setNavigatorOnLine(true);
        const { result } = renderHook(() => useOnlineStatus());
        expect(result.current.isOnline).toBe(true);

        act(() => {
            window.dispatchEvent(new Event("offline"));
        });

        expect(result.current.isOnline).toBe(false);
        expect(result.current.isOffline).toBe(true);
    });

    it("updates to online when the 'online' window event fires", () => {
        setNavigatorOnLine(false);
        const { result } = renderHook(() => useOnlineStatus());
        expect(result.current.isOnline).toBe(false);

        act(() => {
            window.dispatchEvent(new Event("online"));
        });

        expect(result.current.isOnline).toBe(true);
        expect(result.current.isOffline).toBe(false);
    });

    it("handles transitions offline → online → offline correctly", () => {
        setNavigatorOnLine(true);
        const { result } = renderHook(() => useOnlineStatus());

        act(() => {
            window.dispatchEvent(new Event("offline"));
        });
        expect(result.current.isOffline).toBe(true);

        act(() => {
            window.dispatchEvent(new Event("online"));
        });
        expect(result.current.isOnline).toBe(true);

        act(() => {
            window.dispatchEvent(new Event("offline"));
        });
        expect(result.current.isOffline).toBe(true);
    });

    it("removes event listeners on unmount", () => {
        setNavigatorOnLine(true);
        const addSpy = vi.spyOn(window, "addEventListener");
        const removeSpy = vi.spyOn(window, "removeEventListener");

        const { unmount } = renderHook(() => useOnlineStatus());

        expect(addSpy).toHaveBeenCalledWith("online", expect.any(Function));
        expect(addSpy).toHaveBeenCalledWith("offline", expect.any(Function));

        unmount();

        expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
        expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
    });

    it("isOnline and isOffline are always opposite booleans", () => {
        setNavigatorOnLine(true);
        const { result } = renderHook(() => useOnlineStatus());

        expect(result.current.isOnline).toBe(!result.current.isOffline);

        act(() => {
            window.dispatchEvent(new Event("offline"));
        });

        expect(result.current.isOnline).toBe(!result.current.isOffline);
    });
});
