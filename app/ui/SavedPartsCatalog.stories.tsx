import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { SavedPartsCatalogView } from "../components/SavedPartsCatalog";
import type { SavedCatalog } from "../lib/fusion/catalog";
const catalog: SavedCatalog = { version: 1, organization: "NWD", organizationId: "300000004581674", startedAt: 1794710000000, fetchedAt: 1794710010000,
  sourceCounts: { parts: 2, locators: 2, stockrooms: 2, reportLocations: 2 }, parts: [
    { number: "0012", name: "FILTER", description: "FILTER:ENGINE OIL", itemIds: ["123"], unit: "Piece", status: null, numbers: [{ type: "MPN", value: "FS1065" }], locations: [{ stockroom: "Northwest", locator: "A-12" }] },
    { number: "910090", name: "ANTIFREEZE", description: "ANTIFREEZE:PREMIXED COOLANT", itemIds: ["456"], unit: null, status: null, numbers: [], locations: [{ stockroom: "Northwest", locator: "TANK AREA" }] },
  ] };
const meta = { title: "Patterns/Saved Parts Catalog", component: SavedPartsCatalogView, parameters: { layout: "padded" }, args: { catalog, connected: false, onRefresh: fn(), onHistory: fn() } } satisfies Meta<typeof SavedPartsCatalogView>;
export default meta; type Story = StoryObj<typeof meta>;
export const Offline: Story = { play: async ({ canvasElement }) => {
  const screen = within(canvasElement), popup = within(canvasElement.ownerDocument.body);
  await expect(screen.getByRole("button", { name: "Update saved catalog" })).toBeDisabled();
  const search = screen.getByRole("textbox", { name: "Search saved parts" });
  await userEvent.type(search, "FS1065"); await expect(screen.getByText("0012", { exact: true })).toBeVisible();
  await expect(screen.queryByText("910090", { exact: true })).not.toBeInTheDocument();
  await userEvent.clear(search);
  await userEvent.type(screen.getByRole("textbox", { name: "Filter location" }), "tank");
  await expect(screen.getByText("910090", { exact: true })).toBeVisible();
  await expect(screen.queryByText("0012", { exact: true })).not.toBeInTheDocument();
  await userEvent.clear(screen.getByRole("textbox", { name: "Filter location" }));
  await userEvent.click(screen.getByRole("button", { name: /Sort parts by/ }));
  await userEvent.click(popup.getByRole("option", { name: /^Name$/ }));
  await expect(screen.getAllByRole("row")[1]).toHaveTextContent("910090");
} };
export const Dark: Story = { globals: { theme: "dark" } };
export const PhoneSafeArea: Story = { globals: { safeArea: "phone", viewport: { value: "phoneSmall" } }, parameters: { viewport: { defaultViewport: "phoneSmall" } } };
export const FailedRefresh: Story = { args: { error: "Oracle access expired." } };
export const LongContent: Story = { args: { catalog: { ...catalog, parts: [{ ...catalog.parts[0], description: "FILTER:Extended specification for engine and auxiliary systems. ".repeat(10), locations: [{ stockroom: "Northwest Division", locator: "EXTENDED-STORAGE-LOCATION-123456789" }] }] } } };
