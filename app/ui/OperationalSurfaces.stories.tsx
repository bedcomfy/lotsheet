import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BusMasterProvider } from "../components/BusMasterProvider";
import FlagPills from "../components/FlagPills";
import {
  GlobalBusResult,
  type GlobalBusDetails,
} from "../components/GlobalBusSearch";

const meta = {
  title: "Patterns/Operational Surfaces",
  component: GlobalBusResult,
  decorators: [
    (Story) => (
      <BusMasterProvider>
        <div className="ui-story-column" style={{ maxWidth: "32rem" }}>
          <Story />
        </div>
      </BusMasterProvider>
    ),
  ],
} satisfies Meta<typeof GlobalBusResult>;

export default meta;
type Story = StoryObj<typeof meta>;

const readyBus: GlobalBusDetails = {
  bus: "6427",
  label: "6427",
  model: "2014 ENC Axess",
  location: "Row 8 · #38",
  status: "ready",
  entry: {
    flags: [],
    note: "",
    inspMiles: null,
    holdReason: "",
    retorqueTires: [],
    inspOption: "",
  },
};

export const BusReady: Story = {
  args: {
    details: readyBus,
    onOpenLotSheet: () => {},
  },
};

export const BusWithLongFlags: Story = {
  args: {
    details: {
      ...readyBus,
      bus: "2772",
      label: "2772",
      model: "2010 ENC EZ-Rider II",
      location: "Bay 10",
      status: "notReady",
      entry: {
        flags: ["hold", "inspection", "retorque"],
        note: "Verify curbside door before pull-out",
        inspMiles: 300,
        holdReason: "Parts",
        retorqueTires: ["lf", "rf"],
        inspOption: "c24",
      },
    },
    onOpenLotSheet: () => {},
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
              flags: ["hold", "inspection", "retorque"],
              note: "No power after road call",
              inspMiles: 300,
              holdReason: "Parts",
              retorqueTires: ["lf", "rf"],
              inspOption: "c24",
            }}
          />
        </div>
      </section>
    </div>
  ),
  args: {
    details: readyBus,
  },
};
