import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within, fn } from "storybook/test";
import { FusionConnectionView, type FusionConnectionViewProps } from "../components/FusionConnectionPage";
import type { FusionResource } from "../lib/fusion/config";
import { INITIAL_FUSION_STATE } from "../lib/fusion/client";

const RESULT = {
  resource: "workOrders" as const,
  items: [{ WorkOrderNumber: "NWD-1683", WorkOrderDescription: "Inspect cooling system and complete the scheduled maintenance checks.",
    WorkOrderStatus: "Released", AssetNumber: "6396", PlannedStartDate: "2026-11-13T08:00:00Z", PlannedCompletionDate: null }],
  offset: 0, hasMore: true, expiresAt: 1794582000000, fetchedAt: 1794567600000,
};
const meta = {
  title: "Patterns/Fusion Connection",
  component: FusionConnectionView,
  parameters: { layout: "fullscreen" },
  args: {
    state: INITIAL_FUSION_STATE,
    bookmark: "javascript:void(0)",
    resource: "workOrders",
    search: "",
    onResource: fn(), onSearch: fn(), onRead: fn(), onDisconnect: fn(),
  },
} satisfies Meta<typeof FusionConnectionView>;
export default meta;
type Story = StoryObj<typeof meta>;

function Fixture(args: FusionConnectionViewProps) {
  const [resource, setResource] = useState<FusionResource>(args.resource);
  const [search, setSearch] = useState(args.search);
  return <FusionConnectionView {...args} resource={resource} search={search}
    onResource={setResource} onSearch={setSearch} />;
}

export const Setup: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    await expect(screen.getByRole("button", { name: "Read records" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Show address" }));
    await expect(screen.getByRole("textbox", { name: "Favorite address" })).toHaveValue("javascript:void(0)");
    await expect(screen.getByRole("textbox", { name: "Favorite address" })).toHaveAttribute("readonly");
  },
};
export const Connected: Story = {
  args: { state: { ...INITIAL_FUSION_STATE, status: "connected", result: RESULT } },
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement);
    await expect(screen.getByRole("table", { name: "Work orders from Oracle Fusion" })).toBeVisible();
    await expect(screen.getByText("NWD-1683")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await expect(args.onRead).toHaveBeenCalledWith(25);
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await expect(args.onDisconnect).toHaveBeenCalled();
  },
};
export const SearchAndRead: Story = {
  args: { state: { ...INITIAL_FUSION_STATE, status: "connected" } },
  render: args => <Fixture {...args} />,
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement);
    await userEvent.type(screen.getByRole("textbox", { name: "Work order number (optional)" }), "NWD-1683");
    await userEvent.click(screen.getByRole("button", { name: "Read records" }));
    await expect(args.onRead).toHaveBeenCalledWith(0);
  },
};
export const Reading: Story = { args: { state: { ...INITIAL_FUSION_STATE, status: "connected", reading: true } } };
export const SignInRequired: Story = { args: { state: { ...INITIAL_FUSION_STATE, status: "sign-in-required", error: "Sign into Fusion, then click your Connect Lotsheet favorite again." } } };
export const Empty: Story = { args: { state: { ...INITIAL_FUSION_STATE, status: "connected", result: { ...RESULT, items: [], hasMore: false } } } };
export const Dark: Story = { ...Connected, globals: { theme: "dark" }, play: undefined };
export const PhoneSafeArea: Story = {
  ...Connected, play: undefined,
  globals: { safeArea: "phone", viewport: { value: "phoneSmall" } },
  parameters: { viewport: { defaultViewport: "phoneSmall" } },
};
export const LongContent: Story = {
  args: { state: { ...INITIAL_FUSION_STATE, status: "connected", result: { ...RESULT,
    items: [{ ...RESULT.items[0], WorkOrderDescription: "Inspect the complete cooling system, associated equipment, and service history before returning the vehicle to service. ".repeat(8) }] } } },
};
