import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import PmMileagePage from "../components/PmMileagePage";
import { BusMasterProvider } from "../components/BusMasterProvider";
import { DEFAULT_PM_SETTINGS, emptyPmRecord, type PmRecord } from "../lib/pmMileage";
import { useAdminUnlock } from "../lib/useAdminUnlock";
import type { MileageSyncStatus } from "../lib/fleetwatch";
import type { FlagMap } from "../lib/types";
import { emptyFlagEntry } from "../lib/serviceLaneSetup";

function Fixture(_props: { unlocked: boolean; longContent: boolean; failLogout: boolean; failSync: boolean; sharedFlags: boolean; autoSync: boolean }) {
  return <BusMasterProvider><PmMileagePage /></BusMasterProvider>;
}

const meta = {
  title: "Patterns/PM Mileage",
  component: Fixture,
  parameters: { layout: "fullscreen" },
  // autoSync mirrors the FLEETWATCH_AUTO_SYNC switch the server reports; the
  // stories default to "on" so the update flow stays covered while production
  // runs with it off (see ManualUploadOnly).
  args: { unlocked: false, longContent: false, failLogout: false, failSync: false, sharedFlags: false, autoSync: true },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    await screen.findByRole("row", { name: "Bus 6404 A-3" });
    const standardNote = "Change front hub fluid. Change differential fluid.";
    await expect(within(screen.getByRole("row", { name: "Bus 6404 Trans PM" })).getByText(standardNote)).toBeVisible();
    await expect(within(screen.getByRole("row", { name: "Bus 6404 A-3" })).queryByText(standardNote)).not.toBeInTheDocument();
    await expect(within(screen.getByRole("table", { name: "Upcoming PM work" })).getAllByRole("row", { hidden: true })).toHaveLength(6);
    await expect(screen.queryByRole("row", { name: "Bus 6435 Trans PM" })).not.toBeInTheDocument();
    await expect(screen.getByRole("rowgroup", { name: "In shop / Follow up" })).toHaveTextContent("6435");
    await expect(within(screen.getByRole("table", { name: "Upcoming PM work" })).getByRole("columnheader", { name: "Last serviced / last odometer reading time", hidden: true })).toBeInTheDocument();
    await expect(within(screen.getByRole("row", { name: "Bus 6404 A-3" })).getByText("1:20:46 AM")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Print PDF" })).toBeEnabled());
  },
  beforeEach: ({ args }) => {
    useAdminUnlock.setState({ unlocked: args.unlocked, locking: false, lockError: "" });
    const originalFetch = window.fetch;
    let sync: MileageSyncStatus = { enabled: args.autoSync };
    const flags: FlagMap = args.sharedFlags ? {
      "6404": { ...emptyFlagEntry(), flags: ["split"], note: "Flag note stays separate" },
      "6435": { ...emptyFlagEntry(), flags: ["hold"], holdReason: "Parade" },
    } : {};
    const records: Record<string, PmRecord> = {
      "6404": { ...emptyPmRecord("6404"), odometer: 100_000, odometerDate: "10/1/26", nextInspType: "A-3", nextInspMiles: 100_025, nextTransMiles: 100_250,
        lastServiceAt: "2026-09-30T01:20:46", lastServiceMiles: 100000,
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
      if (path === "/api/flags") return Response.json({ flags });
      if (path === "/api/pm-mileage/force-update") {
        records["6404"].odometer = 100020.4;
        sync = { ...sync, lastSuccessAt: "2026-10-07T15:10:00Z", updated: 1, unchanged: 1, skipped: [] };
        return Response.json({ ok: true, status: sync, rows: 2 });
      }
      if (path === "/api/pm-mileage/sync") {
        if (args.failSync) return Response.json({ ok: false, error: "Fleetwatch did not return a PDF. Try again shortly." }, { status: 502 });
        records["6404"].odometer = 100010;
        records["6404"].lastServiceAt = "2026-09-30T23:19:08";
        records["6404"].lastServiceMiles = 100010;
        sync = { enabled: true, lastSuccessAt: "2026-10-01T04:30:00Z", updated: 1, unchanged: 1, serviceUpdated: 1, skipped: [{ bus: "6435", reason: "Below saved mileage" }] };
        return Response.json({ ok: true, status: sync });
      }
      if (path === "/api/pm-mileage") {
        if (!init?.method) return Response.json({ records, settings: DEFAULT_PM_SETTINGS, sync });
        const { bus, actor: _actor, ...patch } = JSON.parse(String(init.body));
        records[bus] = { ...records[bus], ...patch };
        if (patch.disposition === "hold" || patch.disposition === "split") {
          const entry = flags[bus] || emptyFlagEntry();
          flags[bus] = { ...entry, flags: [...new Set([...entry.flags, patch.disposition])],
            holdReason: patch.disposition === "hold" ? "Inspection" : entry.holdReason };
        }
        return Response.json({ ok: true, record: records[bus], flagEntry: flags[bus] || null });
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
    await expect(within(row).getByText("25.0")).toBeInTheDocument();
    await expect(within(trans).getByText("250.0")).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: /status/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Hold" }));
    await expect(within(row).getByRole("button", { name: /status/ })).toHaveTextContent("Hold");
    await expect(within(trans).getByRole("button", { name: /status/ })).toHaveTextContent("Hold");
    await expect(screen.getByRole("rowgroup", { name: "Upcoming work" })).toContainElement(row);
    await expect(screen.getByRole("rowgroup", { name: "In shop / Follow up" })).not.toContainElement(row);
    await expect(within(row).queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
  },
};

export const SharedFlags: Story = {
  args: { sharedFlags: true },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    for (const name of ["Bus 6404 A-3", "Bus 6404 Trans PM"]) {
      const row = await screen.findByRole("row", { name });
      await waitFor(() => expect(within(row).getByRole("button", { name: /status/ })).toHaveTextContent("Split"));
      await expect(within(row).queryByRole("group", { name: "PM flags for bus 6404" })).not.toBeInTheDocument();
      await expect(within(row).getAllByRole("cell")[0]).not.toHaveTextContent("Split");
      await expect(screen.getByRole("rowgroup", { name: "Upcoming work" })).toContainElement(row);
    }
    await expect(within(screen.getByRole("row", { name: "Bus 6435 B-6" })).queryByRole("group", { name: "PM flags for bus 6435" })).not.toBeInTheDocument();
    await expect(screen.queryByText("Flag note stays separate")).not.toBeInTheDocument();
  },
};

export const CrewComplete: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const row = await screen.findByRole("row", { name: "Bus 6404 A-3" });
    await userEvent.click(within(row).getByRole("button", { name: "Complete" }));
    const dialog = await screen.findByRole("dialog", { name: "Complete inspection · Bus 6404" });
    const form = within(dialog);
    await expect(form.getByRole("textbox", { name: "Inspection done" })).toHaveValue("A-3");
    await expect(form.getByRole("textbox", { name: "Date" })).not.toHaveValue("");
    await expect(form.getByRole("textbox", { name: "Time (Chicago)" })).not.toHaveValue("");
    await expect(form.getByRole("textbox", { name: "Odometer now" })).toHaveValue("");
    const foreman = form.getByRole("textbox", { name: "Foreman / SR" });
    await expect(foreman).toHaveValue("");
    await userEvent.type(foreman, "Jordan Smith");
    await expect(foreman).toHaveValue("Jordan Smith");
    await userEvent.click(form.getByRole("button", { name: "Confirm completion" }));
    await expect(form.getByRole("alert")).toHaveTextContent("Enter the odometer reading");
    await userEvent.type(form.getByRole("textbox", { name: "Odometer now" }), "100050");
    await expect(form.getByText(/Next inspection B-6/)).toHaveTextContent("103,025");
  },
};

export const CrewCompletePhone: Story = {
  ...CrewComplete,
  globals: { safeArea: "phone", viewport: { value: "phoneSmall", isRotated: false } },
};

export const UpdateMileage: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    const row = await screen.findByRole("row", { name: "Bus 6404 A-3" });
    await userEvent.click(screen.getByRole("button", { name: "Update mileage now" }));
    await waitFor(() => expect(row).toHaveTextContent("100,010"));
    await expect(row).toHaveTextContent("15");
    await expect(within(row).getByText("11:19:08 PM")).toBeVisible();
    await expect(within(screen.getByRole("row", { name: "Bus 6404 Trans PM" })).getByText("11:19:08 PM")).toBeVisible();
    await expect(screen.getByText(/Last successful check/)).toHaveTextContent("1 updated");
    await userEvent.click(screen.getByRole("button", { name: "1 readings skipped" }));
    await expect(screen.getByText("Bus 6435: Below saved mileage")).toBeVisible();
    await expect(screen.getByRole("button", { name: "Unlock to edit" })).toBeEnabled();
  },
};

// Production state: automatic updates switched off, mileage comes from Import PDF.
export const ManualUploadOnly: Story = {
  args: { autoSync: false },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await screen.findByRole("row", { name: "Bus 6404 A-3" });
    await expect(screen.queryByRole("button", { name: "Update mileage now" })).not.toBeInTheDocument();
    await expect(screen.queryByText(/Last successful check|No successful check/)).not.toBeInTheDocument();
    await expect(screen.getByText(/Automatic updates are turned off/)).toBeVisible();
    await expect(screen.getByRole("button", { name: "Unlock to edit" })).toBeEnabled();
    // The hand-kept tracker gets its odometers by copy and paste, no Admin Tools needed.
    await expect(screen.getByRole("button", { name: "Copy odometers" })).toBeEnabled();
    // Force Update works without Admin Tools: the crew can refresh mileage.
    await userEvent.click(screen.getByRole("button", { name: "Force Update" }));
    await expect(await screen.findByText(/Force Update done: 1 updated · 1 unchanged/)).toBeVisible();
    await expect(screen.getByRole("row", { name: "Bus 6404 A-3" })).toHaveTextContent("100,020.4");
    // Paste the sheet's Bus # column, get the odometers back in that order.
    await userEvent.click(screen.getByRole("button", { name: "Copy odometers" }));
    const tracker = await screen.findByRole("dialog", { name: "Copy odometers for the tracker" });
    await userEvent.type(within(tracker).getByRole("textbox", { name: "Bus numbers from your sheet" }), "6435{enter}6404{enter}9999");
    await expect(within(tracker).getByRole("textbox", { name: "Odometers, same order" })).toHaveValue("120100.0\n100020.4\n");
    await expect(within(tracker).getByText(/Not on PM Mileage, left blank: 9999/)).toBeVisible();
    await expect(within(tracker).getByText(/2 of 3 buses matched/)).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Copy odometers for the tracker" })).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Import PDF" }));
    const dialog = await screen.findByRole("dialog", { name: "Import a fleet report" });
    // The dialog animates in; wait for its content to settle.
    await waitFor(() => expect(within(dialog).getByText(/Importing a report needs Admin Tools/)).toBeVisible());
    await expect(within(dialog).getByRole("button", { name: "Scan PDF" })).toBeDisabled();
  },
};

// Admin presses Force Update: the Vehicle List Report's odometers land and
// the notice reports the result.
export const ForceUpdate: Story = {
  args: { unlocked: true, autoSync: false },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const row = await screen.findByRole("row", { name: "Bus 6404 A-3" });
    await userEvent.click(screen.getByRole("button", { name: "Force Update" }));
    // Unlocked, the odometer is an editable box, so read its value.
    await waitFor(() => expect(within(row).getByRole("textbox", { name: "Bus 6404 A-3 odometer" })).toHaveValue("100,020.4"));
    await expect(await screen.findByText(/Force Update done: 1 updated · 1 unchanged/)).toBeVisible();
    await expect(screen.getByText(/Last update from Fleetwatch/)).toBeVisible();
    // The button reads "Updating…" until the page has reloaded after the update.
    await waitFor(() => expect(screen.getByRole("button", { name: "Force Update" })).toBeEnabled());
  },
};

export const UpdateMileageFailure: Story = {
  args: { failSync: true },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    const row = await screen.findByRole("row", { name: "Bus 6404 A-3" });
    await userEvent.click(screen.getByRole("button", { name: "Update mileage now" }));
    await expect(await screen.findByText("Fleetwatch did not return a PDF. Try again shortly.")).toBeVisible();
    await expect(row).toHaveTextContent("100,000");
    await expect(screen.getByRole("button", { name: "Update mileage now" })).toBeEnabled();
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
    await expect(within(updated).getByText("at 100,100.0")).toBeInTheDocument();
    await expect(within(screen.getByRole("row", { name: "Bus 6404 Trans PM" })).getByText("at 100,250.0")).toBeInTheDocument();
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

export const Light: Story = { args: { unlocked: true, sharedFlags: true } };
export const Dark: Story = { args: { unlocked: true, sharedFlags: true }, globals: { theme: "dark" } };
export const LongContent: Story = { args: { unlocked: true, longContent: true, sharedFlags: true } };
export const PhoneSafeArea: Story = {
  args: { unlocked: true, longContent: true, sharedFlags: true },
  globals: { safeArea: "phone", viewport: { value: "phoneSmall", isRotated: false } },
};
