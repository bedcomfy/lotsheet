import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { BusMasterProvider } from "../components/BusMasterProvider";
import SetupLane from "../components/SetupLane";
import { objectCodeFlagId } from "../lib/objectCodes";
import { emptyFlagEntry } from "../lib/serviceLaneSetup";
import type { FlagEntry, FlagMap } from "../lib/types";

const CURRENT_FLAGS: FlagMap = {
  "6404": { ...emptyFlagEntry(), flags: ["hold"], holdReason: "Parts" },
  "6435": { ...emptyFlagEntry(), flags: ["cards"] },
  "6442": {
    ...emptyFlagEntry(),
    flags: ["inspection", objectCodeFlagId("6603")],
    inspOption: "A-3",
  },
  "6475": {
    ...emptyFlagEntry(),
    flags: ["retorque"],
    retorqueTires: ["cf", "rf"],
  },
};

function Fixture({ flags = CURRENT_FLAGS }: { flags?: FlagMap }) {
  const [entries, setEntries] = useState(flags);
  return (
    <BusMasterProvider>
      <SetupLane
        isOpen
        onOpenChange={() => {}}
        flags={entries}
        onBusFlagsUpdated={(bus: string, entry: FlagEntry) =>
          setEntries((current) => ({ ...current, [bus]: entry }))
        }
      />
    </BusMasterProvider>
  );
}

const meta = {
  title: "Patterns/Setup Lane",
  component: SetupLane,
  parameters: { layout: "fullscreen" },
  args: {
    isOpen: true,
    onOpenChange: () => {},
    flags: {},
    onBusFlagsUpdated: () => {},
  },
} satisfies Meta<typeof SetupLane>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GuidedReplacement: Story = {
  render: () => <Fixture />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(screen.getByRole("button", { name: "Holds" }));
    const field = await screen.findByRole("textbox", { name: "Add bus to holds" });
    await userEvent.type(field, "6427");
    await expect(screen.getByText("6427", { selector: "strong" })).toBeVisible();
    await expect(field).toHaveValue("");

    await userEvent.type(field, "25538");
    let rows = screen.getAllByText(/^(25538|6427)$/, { selector: "strong" });
    await expect(rows[0]).toHaveTextContent("25538");

    const olderRow = screen.getByText("6427", { selector: "strong" }).closest("section");
    if (!olderRow) throw new Error("Could not find the older hold row.");
    await userEvent.click(within(olderRow).getByRole("button", { name: "Movement" }));
    rows = screen.getAllByText(/^(25538|6427)$/, { selector: "strong" });
    await expect(rows[0]).toHaveTextContent("25538");

    await userEvent.click(screen.getByRole("button", { name: "Clear all holds" }));
    await expect(screen.queryByText("25538", { selector: "strong" })).not.toBeInTheDocument();
    await expect(screen.getByRole("button", { name: "Clear all holds" })).toBeDisabled();
  },
};

export const EmptyCurrentSetup: Story = {
  render: () => <Fixture flags={{}} />,
};

export const OptionalDetailsDoNotBlockReview: Story = {
  render: () => <Fixture flags={{}} />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(screen.getByRole("button", { name: "Inspections" }));
    const field = screen.getByRole("textbox", { name: "Add bus to inspections" });
    await userEvent.type(field, "6427");
    await userEvent.click(screen.getByRole("button", { name: /^Review/ }));
    await expect(screen.getByText("Optional details missing")).toBeVisible();
    await expect(screen.getByRole("button", { name: /Apply lane setup/ })).toBeEnabled();
  },
};

export const DetailEditsKeepTheLatestBusFirst: Story = {
  render: () => <Fixture flags={{}} />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);

    await userEvent.click(screen.getByRole("button", { name: "Inspections" }));
    let field = screen.getByRole("textbox", { name: "Add bus to inspections" });
    await userEvent.type(field, "6427");
    await userEvent.type(field, "25538");

    let rows = screen.getAllByText(/^(25538|6427)$/, { selector: "strong" });
    await expect(rows[0]).toHaveTextContent("25538");

    let olderRow = screen.getByText("6427", { selector: "strong" }).closest("section");
    if (!olderRow) throw new Error("Could not find the older inspection row.");
    await userEvent.click(within(olderRow).getByRole("button", { name: "A-3" }));
    rows = screen.getAllByText(/^(25538|6427)$/, { selector: "strong" });
    await expect(rows[0]).toHaveTextContent("25538");

    await userEvent.click(screen.getByRole("button", { name: "Retorques" }));
    field = screen.getByRole("textbox", { name: "Add bus to retorques" });
    await userEvent.type(field, "6427");
    await userEvent.type(field, "25538");

    rows = screen.getAllByText(/^(25538|6427)$/, { selector: "strong" });
    await expect(rows[0]).toHaveTextContent("25538");

    olderRow = screen.getByText("6427", { selector: "strong" }).closest("section");
    if (!olderRow) throw new Error("Could not find the older retorque row.");
    await userEvent.click(within(olderRow).getByRole("button", { name: "Right rear" }));
    rows = screen.getAllByText(/^(25538|6427)$/, { selector: "strong" });
    await expect(rows[0]).toHaveTextContent("25538");
  },
};

export const PhoneSafeArea: Story = {
  render: () => <Fixture />,
  parameters: { viewport: { defaultViewport: "phoneSmall" } },
  globals: { safeArea: "phone" },
};
