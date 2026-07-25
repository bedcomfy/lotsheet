import {
  BusFront,
  CircleAlert,
  CircleCheck,
  Flag,
  MapPinOff,
  Wrench,
} from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { MetricTile } from "./MetricTile";

const meta = {
  title: "Components/Metric Tile",
  component: MetricTile,
  tags: ["autodocs"],
  args: {
    label: "Usable buses",
    value: 95,
    detail: "Ready for service",
    icon: <CircleCheck />,
    tone: "success",
    onPress: fn(),
  },
} satisfies Meta<typeof MetricTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FleetOverview: Story = {
  render: () => (
    <div className="ui-metric-grid">
      <MetricTile
        label="Usable buses"
        value={95}
        detail="Ready for service"
        icon={<CircleCheck />}
        tone="success"
      />
      <MetricTile
        label="Out of service"
        value={35}
        detail="Lots and shop"
        icon={<Wrench />}
        tone="warning"
      />
      <MetricTile
        label="Off property"
        value={3}
        detail="Tracked separately"
        icon={<MapPinOff />}
        tone="info"
      />
      <MetricTile
        label="Missing"
        value={116}
        detail="Not assigned tonight"
        icon={<CircleAlert />}
        tone="danger"
      />
      <MetricTile
        label="On grid"
        value={4}
        detail="Available now"
        icon={<BusFront />}
        tone="accent"
      />
      <MetricTile
        label="Flagged buses"
        value={11}
        detail="Open maintenance items"
        icon={<Flag />}
      />
    </div>
  ),
};

export const PhoneGrid: Story = {
  render: () => (
    <div className="ui-metric-grid ui-metric-grid--phone">
      <MetricTile
        label="Usable"
        value={95}
        icon={<CircleCheck />}
        tone="success"
      />
      <MetricTile
        label="Out of service"
        value={35}
        icon={<Wrench />}
        tone="warning"
      />
      <MetricTile
        label="Off property"
        value={3}
        icon={<MapPinOff />}
        tone="info"
      />
      <MetricTile
        label="Missing"
        value={116}
        icon={<CircleAlert />}
        tone="danger"
      />
    </div>
  ),
  parameters: {
    viewport: {
      defaultViewport: "phoneSmall",
    },
  },
  globals: {
    safeArea: "phone",
  },
};
