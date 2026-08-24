import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { BusMasterProvider } from "../components/BusMasterProvider";
import FlagPills from "../components/FlagPills";
import {
  BusWorkspaceContent,
  FlagPicker,
  type BusWorkspaceDetails,
} from "../components/ManagerPanel";
import { customNoteFlagId } from "../lib/customNoteFlags";
import { objectCodeFlagId } from "../lib/objectCodes";
import type { FlagEntry } from "../lib/types";

const EMPTY_ENTRY: FlagEntry = {
  flags: [],
  note: "",
  inspMiles: null,
  holdReason: "",
  retorqueTires: [],
  inspOption: "",
};

const readyBus: BusWorkspaceDetails = {
  bus: "6427",
  label: "6427",
  model: "2014 ENC Axess",
  location: "Row 8 · #38",
  status: "ready",
};

function WorkspaceFixture({
  details = readyBus,
  initialEntry = EMPTY_ENTRY,
}: {
  details?: BusWorkspaceDetails;
  initialEntry?: FlagEntry;
}) {
  const [entry, setEntry] = useState(initialEntry);
  return (
    <BusWorkspaceContent
      details={details}
      entry={entry}
      onEntryChange={setEntry}
      onClearFlags={() => setEntry(EMPTY_ENTRY)}
      onOpenLotSheet={() => {}}
    />
  );
}

function ScrollingRetorqueFixture() {
  const [entry, setEntry] = useState<FlagEntry>({
    ...EMPTY_ENTRY,
    flags: ["retorque"],
    retorqueTires: ["cf"],
  });
  return (
    <div
      aria-label="Scrollable flag editor"
      data-dialog-scroll-region=""
      style={{ height: "15rem", overflow: "auto" }}
    >
      <div aria-hidden="true" style={{ height: "10rem" }} />
      <FlagPicker entry={entry} onChange={setEntry} />
      <div aria-hidden="true" style={{ height: "10rem" }} />
    </div>
  );
}

const meta = {
  title: "Patterns/Bus Workspace",
  component: BusWorkspaceContent,
  decorators: [
    (Story) => (
      <BusMasterProvider>
        <div className="ui-story-column" style={{ maxWidth: "42rem" }}>
          <Story />
        </div>
      </BusMasterProvider>
    ),
  ],
  args: {
    details: readyBus,
    entry: EMPTY_ENTRY,
    onEntryChange: () => {},
  },
} satisfies Meta<typeof BusWorkspaceContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BusReady: Story = {
  render: () => <WorkspaceFixture />,
};

export const BusWithLongFlags: Story = {
  render: () => (
    <WorkspaceFixture
      details={{
        bus: "2772",
        label: "2772",
        model: "2010 ENC EZ-Rider II",
        location: "Bay 10",
        status: "notReady",
      }}
      initialEntry={{
        flags: [
          "hold",
          "inspection",
          objectCodeFlagId("6800"),
          "retorque",
          customNoteFlagId("Verify curbside door before pull-out"),
          customNoteFlagId("Radio cuts out intermittently"),
        ],
        note: "",
        inspMiles: 300,
        holdReason: "Parts",
        retorqueTires: ["cf", "rf"],
        inspOption: "C-24",
      }}
    />
  ),
};

export const UnifiedFlagCodeAndNoteComposer: Story = {
  render: () => <WorkspaceFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("searchbox", { name: "Add an issue" });

    await userEvent.type(field, "C-24{enter}");
    await expect(canvas.getByText(/Inspection · PM-C 24000 MILES/)).toBeVisible();

    await userEvent.type(field, "Door sticks after rain{enter}");
    await expect(canvas.getByText("Door sticks after rain")).toBeVisible();
    await expect(field).toHaveValue("");
  },
};

export const RetorquePresets: Story = {
  render: () => <WorkspaceFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("searchbox", { name: "Add an issue" });
    await userEvent.type(field, "Retorque{enter}");
    await userEvent.click(canvas.getByRole("button", { name: "Fronts" }));
    await expect(canvas.getByText("Retorque · Fronts")).toBeVisible();
  },
};

export const RetorqueSelectionPreservesScroll: Story = {
  render: () => <ScrollingRetorqueFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scroller = canvas.getByLabelText("Scrollable flag editor");
    const tire = canvas.getByRole("button", { name: "Right front" });
    scroller.scrollTop = Math.max(0, tire.offsetTop - 80);
    const before = scroller.scrollTop;
    await userEvent.click(tire);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await expect(scroller.scrollTop).toBe(before);
  },
};

export const PhoneSafeAreaAndLongContent: Story = {
  render: () => (
    <WorkspaceFixture
      details={{ ...readyBus, location: "North lot · Lane 4 · Front position · awaiting dispatch review" }}
      initialEntry={{
        ...EMPTY_ENTRY,
        flags: Array.from({ length: 10 }, (_, index) => customNoteFlagId(`Operational note ${index + 1}`)),
      }}
    />
  ),
  parameters: {
    viewport: { defaultViewport: "phoneSmall" },
  },
  globals: {
    safeArea: "phone",
  },
};

export const CommonActionsStayInsideTheWorkspace: Story = {
  render: () => <WorkspaceFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const actions = canvas.getByLabelText("Common flags");
    await expect(actions.scrollWidth).toBeLessThanOrEqual(actions.clientWidth);
    await expect(canvas.getByRole("button", { name: /Brake test/ })).toBeVisible();
  },
};

export const FlagPillStates: Story = {
  render: () => (
    <div className="ui-story-column">
      <section className="ui-story-section">
        <h2>Active flags</h2>
        <div className="ui-story-row">
          <FlagPills
            entry={{
              flags: [
                "hold",
                "inspection",
                "retorque",
                customNoteFlagId("No power after road call"),
                customNoteFlagId("Won't probe"),
              ],
              note: "Legacy note remains readable",
              inspMiles: 300,
              holdReason: "Parts",
              retorqueTires: ["cf", "rf"],
              inspOption: "C-24",
            }}
          />
        </div>
      </section>
    </div>
  ),
};

export const FlagPillsWrapWithoutClipping: Story = {
  render: () => (
    <div
      aria-label="Constrained flag labels"
      style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", width: "14rem" }}
    >
      <FlagPills
        entry={{
          ...EMPTY_ENTRY,
          flags: ["oos", "hold", "offprop", "inspection", "cleaning"],
          holdReason: "Awaiting an unusually long parts description",
          inspOption: "C-24",
        }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const labels = canvas.getByLabelText("Constrained flag labels");
    await expect(labels.scrollWidth).toBeLessThanOrEqual(labels.clientWidth);
  },
};
