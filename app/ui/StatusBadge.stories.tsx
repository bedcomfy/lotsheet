import { CircleAlert, CircleCheck, MapPin, Wrench } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StatusBadge } from "./StatusBadge";

const meta = {
  title: "Components/Status Badge",
  component: StatusBadge,
  tags: ["autodocs"],
  args: {
    children: "Ready for service",
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OperationalStates: Story = {
  render: () => (
    <div className="ui-story-stack">
      <StatusBadge icon={<CircleCheck />} tone="success">
        95 usable
      </StatusBadge>
      <StatusBadge icon={<Wrench />} tone="warning">
        35 out of service
      </StatusBadge>
      <StatusBadge icon={<MapPin />} tone="info">
        3 off property
      </StatusBadge>
      <StatusBadge icon={<CircleAlert />} tone="danger">
        116 missing
      </StatusBadge>
      <StatusBadge tone="accent">Live updates</StatusBadge>
      <StatusBadge>Last saved 8 seconds ago</StatusBadge>
    </div>
  ),
};

export const LongContent: Story = {
  args: {
    children:
      "A deliberately long operational status that must stay inside its parent",
    tone: "warning",
  },
  parameters: {
    viewport: {
      defaultViewport: "phoneSmall",
    },
  },
};
