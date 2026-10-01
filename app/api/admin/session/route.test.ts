import { expect, it } from "vitest";
import { ADMIN_COOKIE, adminPassword } from "../../../lib/adminAuth";
import { DELETE, GET, POST } from "./route";

it("creates an admin cookie and expires that same cookie on logout", async () => {
  const login = await POST(new Request("http://localhost/api/admin/session", {
    method: "POST", body: JSON.stringify({ password: adminPassword() }),
  }));
  const cookie = login.cookies.get(ADMIN_COOKIE);
  expect(cookie?.value).toBeTruthy();
  const session = await GET(new Request("http://localhost", { headers: { cookie: `${ADMIN_COOKIE}=${cookie?.value}` } }));
  expect(await session.json()).toEqual({ unlocked: true });
  const logout = await DELETE();
  expect(logout.cookies.get(ADMIN_COOKIE)).toMatchObject({ value: "", maxAge: 0, path: "/", httpOnly: true });
  const locked = await GET(new Request("http://localhost"));
  expect(await locked.json()).toEqual({ unlocked: false });
});
