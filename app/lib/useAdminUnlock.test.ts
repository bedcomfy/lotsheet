import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdminUnlock } from "./useAdminUnlock";
import { ADMIN_SESSION_KEY } from "./admin";

afterEach(() => {
  vi.unstubAllGlobals();
  useAdminUnlock.setState({ unlocked: false, locking: false, lockError: "" });
});

describe("admin logout", () => {
  it("waits for cookie deletion before reporting logout and clears the client session", async () => {
    const removeItem = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal("sessionStorage", { removeItem });
    vi.stubGlobal("localStorage", { setItem });
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    useAdminUnlock.setState({ unlocked: true });
    const logout = useAdminUnlock.getState().lock();
    expect(useAdminUnlock.getState().locking).toBe(true);
    expect(useAdminUnlock.getState().unlocked).toBe(true);
    resolve(new Response("{}", { status: 200 }));
    expect(await logout).toBe(true);
    expect(useAdminUnlock.getState().unlocked).toBe(false);
    expect(removeItem).toHaveBeenCalledWith(ADMIN_SESSION_KEY);
    expect(setItem).toHaveBeenCalled();
  });

  it("keeps logout available and reports a failed server request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    useAdminUnlock.setState({ unlocked: true });
    expect(await useAdminUnlock.getState().lock()).toBe(false);
    expect(useAdminUnlock.getState()).toMatchObject({ unlocked: true, locking: false, lockError: "Couldn't log out of admin. Try again." });
  });
});
