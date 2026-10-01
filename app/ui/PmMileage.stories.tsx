import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import PmMileagePage from "../components/PmMileagePage";
import { BusMasterProvider } from "../components/BusMasterProvider";
import { DEFAULT_PM_SETTINGS, emptyPmRecord, type PmRecord } from "../lib/pmMileage";
import { useAdminUnlock } from "../lib/useAdminUnlock";

function Fixture(_props: { unlocked: boolean; longContent: boolean; failLogout: boolean }) {
  return <BusMasterProvider><PmMileagePage /></BusMasterProvider>;
}

const meta = {
  title: "Patterns/PM Mileage",
  component: Fixture,
  parameters: { layout: "fullscreen" },
  args: { unlocked: false, longContent: false, failLogout: false },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    await screen.findByRole("row", { name: "Bus 6404 A-3" });
    const standardNote = "Change front hub fluid. Change differential fluid.";
    await expect(within(screen.getByRole("row", { name: "Bus 6404 Trans PM" })).getByText(standardNote)).toBeVisible();
    await expect(within(screen.getByRole("row", { name: "Bus 6404 A-3" })).queryByText(standardNote)).not.toBeInTheDocument();
    await expect(within(screen.getByRole("table", { name: "Upcoming PM work" })).getAllByRole("row", { hidden: true })).toHaveLength(7);
    await expect(screen.getByRole("rowgroup", { name: "In shop / Follow up" })).toHaveTextContent("6435");
    await waitFor(() => expect(screen.getByRole("button", { name: "Print PDF" })).toBeEnabled());
  },
  beforeEach: ({ args }) => {
    useAdminUnlock.setState({ unlocked: args.unlocked, locking: false, lockError: "" });
    const originalFetch = window.fetch;
    const records: Record<string, PmRecord> = {
      "6404": { ...emptyPmRecord("6404"), odometer: 100_000, odometerDate: "10/1/26", nextInspType: "A-3", nextInspMiles: 100_025, nextTransMiles: 100_250,
        note: args.longContent ? "Follow up with the second shift about the transmission inspection and the parts requested for this bus." : "" },
      "6435": { ...emptyPmRecord("6435"), odometer: 120_100, nextInspType: "B-6", nextInspMiles: 120_000, disposition: "shop" },
    };
    window.fetch = async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
      if (path === "/api/admin/session") return Response.json({ ok: !args.failLogout }, { status: args.failLogout ? 503 : 200 });
      if (path === "/api/buses") return Response.json({ master: { buses: [
        { num: "6404", status: "active", model: args.longContent ? "Long fleet model description with operational details" : "40-foot" },
        { num: "6435", status: "active", model: "40-foot" },
      ] } });
      if (path === "/api/flags") return Response.json({ flags: {} });
      if (path === "/api/pm-mileage") {
        if (!init?.method) return Response.json({ records, settings: DEFAULT_PM_SETTINGS });
        const { bus, actor: _actor, ...patch } = JSON.parse(String(init.body));
        records[bus] = { ...records[bus], ...patch };
        return Response.json({ ok: true, record: records[bus] });
      }
      return originalFetch(input, init);
    };
    return () => {
      window.fetch = originalFetch;
      useAdminUnlock.setState({ unlocked: false, locking: false, lockError: "" });
    };
  },
} satisfies Meta<typeof Fixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CrewStatus: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const row = await screen.findByRole("row", { name: "Bus 6404 A-3" });
    const trans = await screen.findByRole("row", { name: "Bus 6404 Trans PM" });
    await expect(within(row).getByText("25")).toBeInTheDocument();
    await expect(within(trans).getByText("250")).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: /status/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Hold" }));
    await expect(within(row).getByRole("button", { name: /status/ })).toHaveTextContent("Hold");
    await expect(within(trans).getByRole("button", { name: /status/ })).toHaveTextContent("Hold");
    await expect(screen.getByRole("rowgroup", { name: "Upcoming work" })).toContainElement(row);
    await expect(screen.getByRole("rowgroup", { name: "In shop / Follow up" })).not.toContainElement(row);
    await expect(within(row).queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
  },
};

export const EditNextWithoutHistory: Story = {
  args: { unlocked: true },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const row = await screen.findByRole("row", { name: "Bus 6404 A-3" });
    await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Edit next inspection/ }));
    const dialog = await screen.findByRole("dialog", { name: "Next inspection · Bus 6404" });
    await userEvent.click(within(dialog).getByRole("button", { name: /Next inspection/ }));
    await userEvent.click(await screen.findByRole("option", { name: "A-9" }));
    const field = within(dialog).getByRole("textbox", { name: "Due at (miles)" });
    await userEvent.clear(field);
    await userEvent.type(field, "100100");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const updated = await screen.findByRole("row", { name: "Bus 6404 A-9" });
    await expect(within(updated).getByText("at 100,100")).toBeInTheDocument();
    await expect(within(screen.getByRole("row", { name: "Bus 6404 Trans PM" })).getByText("at 100,250")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log out of admin" }));
    await expect(await screen.findByRole("button", { name: "Unlock to edit" })).toBeInTheDocument();
    await expect(within(updated).queryByRole("textbox")).not.toBeInTheDocument();
    await expect(within(updated).getByRole("button", { name: /status/ })).toBeEnabled();
  },
};

export const LogoutFailure: Story = {
  args: { unlocked: true, failLogout: true },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await screen.findByRole("row", { name: "Bus 6404 A-3" });
    await userEvent.click(screen.getByRole("button", { name: "Log out of admin" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't log out of admin");
    await expect(screen.getByRole("button", { name: "Log out of admin" })).toBeEnabled();
  },
};

export const Light: Story = { args: { unlocked: true } };
export const Dark: Story = { args: { unlocked: true }, globals: { theme: "dark" } };
export const LongContent: Story = { args: { unlocked: true, longContent: true } };
export const PhoneSafeArea: Story = {
  args: { unlocked: true, longContent: true },
  globals: { safeArea: "phone", viewport: { value: "phoneSmall", isRotated: false } },
};
