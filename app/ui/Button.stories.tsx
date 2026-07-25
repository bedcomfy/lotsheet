import { Flag, Printer, Trash2 } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Button, IconButton } from "./Button";

const meta = {
  title: "Components/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    children: "Save changes",
    onPress: fn(),
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: "primary",
  },
};

export const Secondary: Story = {};

export const Quiet: Story = {
  args: {
    variant: "quiet",
  },
};

export const Danger: Story = {
  args: {
    variant: "danger",
    children: "Clear lots",
  },
};

export const AllStates: Story = {
  render: () => (
    <div className="ui-story-column">
      <section className="ui-story-section">
        <h2>Variants</h2>
        <div className="ui-story-stack">
          <Button variant="primary">
            <Flag aria-hidden="true" />
            Edit flags
          </Button>
          <Button variant="secondary">
            <Printer aria-hidden="true" />
            Print PDF
          </Button>
          <Button variant="quiet">Cancel</Button>
          <Button variant="danger">
            <Trash2 aria-hidden="true" />
            Clear
          </Button>
        </div>
      </section>

      <section className="ui-story-section">
        <h2>Sizes and disabled state</h2>
        <div className="ui-story-stack">
          <Button size="sm">Small</Button>
          <Button size="md">Default</Button>
          <Button size="lg">Large touch target</Button>
          <Button isDisabled>Unavailable</Button>
          <IconButton aria-label="Print sheet">
            <Printer aria-hidden="true" />
          </IconButton>
        </div>
      </section>
    </div>
  ),
};
