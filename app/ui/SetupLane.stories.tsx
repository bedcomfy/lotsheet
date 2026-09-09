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
  "6435": { ...emptyFlagEntry(), flags: ["cards"], cardsReason: "Mirror" },
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
    await userEvent.click(screen.getByRole("button", { name: "Holds & Cards" }));
    const field = await screen.findByRole("textbox", { name: "Add bus to holds & cards" });
    await userEvent.type(field, "6427");
    await expect(screen.getByText("6427", { selector: "strong" })).toBeVisible();
    await expect(field).toHaveValue("");

    // A new bus waits for a Hold / Card choice before it shows a reason picker.
    const newRow = screen.getByText("6427", { selector: "strong" }).closest("section");
    if (!newRow) throw new Error("Could not find the new row.");
    await expect(within(newRow).getByText("Choose Hold or Card")).toBeVisible();
    await userEvent.click(within(newRow).getByRole("button", { name: "Hold" }));
    await expect(within(newRow).getByRole("button", { name: "Movement" })).toBeVisible();

    await userEvent.type(field, "25538");
    let rows = screen.getAllByText(/^(25538|6427)$/, { selector: "strong" });
    await expect(rows[0]).toHaveTextContent("25538");

    const olderRow = screen.getByText("6427", { selector: "strong" }).closest("section");
    if (!olderRow) throw new Error("Could not find the older hold row.");
    await userEvent.click(within(olderRow).getByRole("button", { name: "Movement" }));
    rows = screen.getAllByText(/^(25538|6427)$/, { selector: "strong" });
    await expect(rows[0]).toHaveTextContent("25538");

    // Switching to Card keeps the typed reason and swaps the picker.
    await userEvent.click(within(olderRow).getByRole("button", { name: "Card" }));
    await expect(within(olderRow).getByRole("textbox", { name: "Cards reason" })).toHaveValue("Movement");

    await userEvent.click(screen.getByRole("button", { name: "Clear all holds & cards" }));
    await expect(screen.queryByText("25538", { selector: "strong" })).not.toBeInTheDocument();
    await expect(screen.getByRole("button", { name: "Clear all holds & cards" })).toBeDisabled();
  },
};

export const CarryOverIsOptIn: Story = {
  render: () => <Fixture />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(screen.getByRole("button", { name: "Holds & Cards" }));
    // The wizard opens blank even though 6404 (hold) and 6435 (card) are on the lane.
    await expect(screen.queryByText("6404", { selector: "strong" })).not.toBeInTheDocument();
    await expect(screen.getByText("No buses added. Continue when this category is clear tonight.")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Start from tonight's lane" }));
    await expect(screen.getByText("6404", { selector: "strong" })).toBeVisible();
    await expect(screen.getByText("6435", { selector: "strong" })).toBeVisible();
    await expect(screen.getByText(/carried over/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Start from scratch" }));
    await expect(screen.queryByText("6404", { selector: "strong" })).not.toBeInTheDocument();
    await expect(screen.getByRole("button", { name: "Start from tonight's lane" })).toBeVisible();
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
