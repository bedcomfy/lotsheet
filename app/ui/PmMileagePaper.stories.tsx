import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { PmMileagePaper } from "../sheets/pm-mileage/PmMileagePaper";
import { DEFAULT_PM_SETTINGS, emptyPmRecord, pmWorkItems } from "../lib/pmMileage";

const records = (["shop", "follow-up", "hold", "split", ""] as const).map((disposition, i) => ({
  ...emptyPmRecord(String(6400 + i)), odometer: 100_000, odometerDate: "9/30/26", disposition,
  lastServiceAt: i === 4 ? null : "2026-09-30T01:20:46", lastServiceMiles: i === 4 ? null : 100000,
  nextInspType: "A-3" as const, nextInspMiles: 99_950 + i * 25, nextTransMiles: 100_250 + i * 25,
  note: i === 0 ? "Waiting for parts" : "",
}));

const meta = {
  title: "Sheets/PM Mileage",
  component: PmMileagePaper,
  parameters: { layout: "fullscreen" },
  args: {
    items: pmWorkItems(records, DEFAULT_PM_SETTINGS), labels: {},
    settings: DEFAULT_PM_SETTINGS, date: "9/30/26", filter: "all", query: "",
  },
  play: async ({ canvasElement, args }) => {
    if (!args.items.length) return;
    const printedRow = canvasElement.querySelector('[data-pm-id="6400:inspection"]')!;
    await expect(printedRow.children).toHaveLength(6);
    await expect(printedRow.children[1]).toHaveTextContent("100,000");
    await expect(printedRow.children[1]).not.toHaveTextContent("1:20:46 AM");
    await expect(printedRow.children[2]).toHaveTextContent("1:20:46 AM");
    await expect(printedRow.children[2]).not.toHaveTextContent("100,000");
    for (const cell of canvasElement.querySelectorAll("th, td")) {
      await expect(getComputedStyle(cell).textAlign).toBe("center");
      await expect(getComputedStyle(cell).verticalAlign).toBe("middle");
    }
  },
} satisfies Meta<typeof PmMileagePaper>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Typical: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Empty: Story = { args: { items: [] } };
export const LongContent: Story = { args: {
  items: pmWorkItems(records.map((record) => ({ ...record, note: "Follow up with the next shift about the transmission parts and return to service after the remaining work is complete. ".repeat(4) })), DEFAULT_PM_SETTINGS),
} };
