import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within, fn } from "storybook/test";
import { FusionPartsView, type FusionPartsViewProps } from "../components/FusionPartsPage";
import { EMPTY_HISTORY, INITIAL_PARTS_STATE, type PartsSnapshot } from "../lib/fusion/parts-client";
import { emptyPartsIndex, type PartCharge } from "../lib/fusion/parts";

const index = emptyPartsIndex("a".repeat(64), Date.now() + 14400000);
index.parts = [
  { id: "1", number: "910090", description: "ENGINE COOLANT BULK", unit: "Quart", unitCode: "QT", status: "Active" },
  { id: "2", number: "081521", description: "FILTER, ENGINE OIL", unit: "Piece", unitCode: "EA", status: "Active" },
];
Object.values(index.progress).forEach(s => { s.status = "complete"; s.fetchedAt = Date.now(); });
index.stockSource = "buyers-report";
index.balances = [{ key: "balance", partNumber: "910090", itemId: null, subinventory: "Northwest", locator: "TANK AREA-**-**", quantity: 3060.47, source: "buyers-report", unit: null, unitCode: null }];
const rows: PartCharge[] = [
  { key: "issue1", transactionId: "1", workOrderId: "1", workOrder: "NWD-1680", bus: "6403", operation: 10, date: "2026-11-13T03:00:00Z", type: "MATERIAL_ISSUE", quantity: 22, unit: "Quart", subinventory: "Northwest", locator: "TANK AREA-**-**", enteredBy: "edwin.figueroa@pacebus.com", note: null },
  { key: "issue2", transactionId: "2", workOrderId: "2", workOrder: "NWD-1676", bus: "6396", operation: 20, date: "2026-11-12T03:00:00Z", type: "MATERIAL_ISSUE", quantity: 2, unit: "Quart", subinventory: "Northwest", locator: "TANK AREA-**-**", enteredBy: "Test fixture", note: null },
  { key: "return", transactionId: "3", workOrderId: "1", workOrder: "NWD-1680", bus: "6403", operation: 10, date: "2026-11-13T04:00:00Z", type: "MATERIAL_RETURN", quantity: 1, unit: "Quart", subinventory: "Northwest", locator: "TANK AREA-**-**", enteredBy: "Test fixture", note: "Unused material returned" },
];
const connected: PartsSnapshot = { status: "connected", index, indexing: false, error: null, history: EMPTY_HISTORY };
const selected: PartsSnapshot = { ...connected, history: { partId: "1", rows, status: "complete", fetchedAt: Date.now(), error: null } };
const meta = { title: "Patterns/Northwest Parts", component: FusionPartsView, parameters: { layout: "fullscreen" },
  args: { state: connected, onSelect: fn(), onRefresh: fn(), onConnect: fn() },
} satisfies Meta<typeof FusionPartsView>;
export default meta;
type Story = StoryObj<typeof meta>;

function Interactive(args: FusionPartsViewProps) {
  const [state, setState] = useState(args.state);
  return <FusionPartsView {...args} state={state} onSelect={id => {
    args.onSelect(id); setState({ ...state, history: id ? { ...selected.history, partId: id } : EMPTY_HISTORY });
  }} />;
}
export const SearchByName: Story = {
  render: args => <Interactive {...args} />,
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement), popup = within(canvasElement.ownerDocument.body);
    const search = screen.getByRole("combobox", { name: "Part number or name" });
    await userEvent.type(search, "cool eng");
    await expect(popup.getByRole("option", { name: /910090/ })).toBeVisible();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(args.onSelect).toHaveBeenCalledWith("1");
    await expect(screen.getByRole("table", { name: "Northwest part charge history" })).toBeVisible();
    await expect(screen.getByText("3,060.47")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /All buses Bus/ }));
    await userEvent.click(popup.getByRole("option", { name: /^Bus 6403$/ }));
    await expect(screen.queryByText("NWD-1676")).not.toBeInTheDocument();
    await expect(screen.getByText("Return", { exact: true })).toBeVisible();
    await userEvent.click(screen.getByRole("checkbox", { name: "Include part returns" }));
    await expect(screen.queryByText("Return", { exact: true })).not.toBeInTheDocument();
    await userEvent.clear(search); await userEvent.type(search, "081521");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(args.onSelect).toHaveBeenCalledWith("2");
  },
};
export const Selected: Story = { args: { state: selected } };
export const Disconnected: Story = { args: { state: { ...INITIAL_PARTS_STATE, status: "disconnected" } } };
export const Checking: Story = { args: { state: INITIAL_PARTS_STATE } };
export const Loading: Story = { args: { state: { ...connected, indexing: true, index: { ...index, progress: { ...index.progress, catalog: { status: "loading", offset: 2, fetchedAt: null, error: null } } } } } };
export const Incomplete: Story = { args: { state: { ...selected, index: { ...index, progress: { ...index.progress, balances: { status: "error", offset: 2, fetchedAt: null, error: "Your Oracle account cannot read these records." } } }, history: { ...selected.history, status: "error", error: "The read could not finish. Results are incomplete." } } } };
export const EmptyHistory: Story = { args: { state: { ...selected, history: { ...selected.history, rows: [] } } } };
export const Dark: Story = { ...Selected, globals: { theme: "dark" } };
export const PhoneSafeArea: Story = { ...Selected, globals: { safeArea: "phone", viewport: { value: "phoneSmall" } }, parameters: { viewport: { defaultViewport: "phoneSmall" } } };
export const LongContent: Story = { args: { state: { ...selected, index: { ...index, parts: [{ ...index.parts[0], description: "Extended life engine coolant, pre-mixed for the complete cooling system and associated service equipment. ".repeat(5) }] }, history: { ...selected.history, rows: [{ ...rows[0], note: "Long technician comment with complete return information. ".repeat(8) }] } } } };
