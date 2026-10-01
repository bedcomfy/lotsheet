import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import PmCompletionHistory from "../components/PmCompletionHistory";
import { emptyPmRecord } from "../lib/pmMileage";
import type { PmInspectionEntry } from "../lib/pmHistory";

const records = {
  "6404": { ...emptyPmRecord("6404"), lastInspType: "A-3" as const, lastInspMiles: 100025, lastInspDate: "10/1/26" },
  "6435": emptyPmRecord("6435"),
};
function Fixture({ longContent }: { longContent: boolean }) {
  const [saved, setSaved] = useState(records);
  return <PmCompletionHistory buses={[{ num: "6404", status: "active" }, { num: "6435", status: "active" }]}
    records={saved} label={(bus) => longContent ? `Bus ${bus} · Northwest Division maintenance follow up` : bus}
    onUpdated={(record) => setSaved((current) => ({ ...current, [record.bus]: record }))} />;
}
const meta = {
  title: "Patterns/PM Completion History", component: Fixture, args: { longContent: false },
  beforeEach: () => {
    const original = window.fetch;
    let entry: PmInspectionEntry = { id: "1", bus: "6404", kind: "inspection", type: "A-3", miles: 100025, odometer: 100050,
      doneAt: "10/1/26", completedAt: "2026-10-01T18:12:34Z", createdAt: "2026-10-01T18:12:34Z", undoneAt: null, canUndo: true, undoReason: null };
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.origin);
      if (url.pathname === "/api/pm-mileage/history") return Response.json({ entries: url.search || !entry.undoneAt ? [entry] : [] });
      if (url.pathname === "/api/pm-mileage/undo" && init?.method === "POST") {
        entry = { ...entry, canUndo: false, undoneAt: "2026-10-01T18:15:00Z" };
        return Response.json({ record: emptyPmRecord("6404") });
      }
      return original(input, init);
    };
    return () => { window.fetch = original; };
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    const row = await screen.findByRole("row", { name: "Completed work for bus 6404" });
    await expect(row).toHaveTextContent("1:12:34 PM");
    await expect(row).toHaveTextContent("100,050");
    await expect(screen.getByRole("row", { name: "Completed work for bus 6435" })).toHaveTextContent("No completion recorded");
  },
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const LongContent: Story = { args: { longContent: true } };
export const PhoneSafeArea: Story = { args: { longContent: true }, globals: { safeArea: "phone", viewport: { value: "phoneSmall", isRotated: false } } };
export const Undo: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(await screen.findByRole("button", { name: "Completion info for bus 6404" }));
    const info = await screen.findByRole("dialog", { name: "Completion history · Bus 6404" });
    await userEvent.click(await within(info).findByRole("button", { name: "Undo completion" }));
    const confirm = await screen.findByRole("dialog", { name: "Undo A-3 completion?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Undo completion" }));
    await expect(await within(info).findByText("A-3 · Undone")).toBeVisible();
  },
};
