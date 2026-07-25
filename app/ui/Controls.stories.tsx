import { useState } from "react";
import {
  CalendarDays,
  CircleAlert,
  Flag,
  MapPin,
  Wrench,
} from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  SelectField,
  StaticChip,
  TabBar,
  Tooltip,
} from "./index";

const meta = {
  title: "Components/Operational Controls",
  component: ControlsDemo,
  tags: ["autodocs"],
} satisfies Meta<typeof ControlsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlsDemo() {
  const [location, setLocation] = useState("east");
  const [selected, setSelected] = useState("bus");
  const [maintenance, setMaintenance] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="ui-story-column">
      <section className="ui-story-section">
        <h2>Selection controls</h2>
        <SelectField
          label="Garage location"
          selectedKey={location}
          onSelectionChange={(key) => setLocation(String(key))}
          options={[
            {
              id: "east",
              label: "East lot",
              description: "30 buses currently assigned",
            },
            {
              id: "north",
              label: "North lot",
              description: "18 buses currently assigned",
            },
            {
              id: "shop",
              label: "Shop",
              description: "Apron, bays, and cards",
            },
          ]}
        />
        <Checkbox
          isSelected={maintenance}
          onChange={setMaintenance}
          description="Include maintenance details on the printed sheet."
        >
          Maintenance information
        </Checkbox>
      </section>

      <section className="ui-story-section">
        <h2>Chips and tabs</h2>
        <div className="ui-story-row">
          <Chip tone="success" isSelected icon={<MapPin />}>
            Ready
          </Chip>
          <Chip tone="warning" icon={<Wrench />}>
            In shop
          </Chip>
          <StaticChip tone="danger" icon={<CircleAlert />}>
            12 missing
          </StaticChip>
        </div>
        <TabBar
          label="Editor view"
          selectedKey={selected}
          onSelectionChange={(key) => setSelected(String(key))}
          items={[
            { id: "bus", label: "By bus", icon: <Flag /> },
            { id: "flag", label: "By flag", icon: <Wrench /> },
            { id: "history", label: "History", icon: <CalendarDays /> },
          ]}
        />
      </section>

      <section className="ui-story-section">
        <h2>Protected actions</h2>
        <div className="ui-story-row">
          <Tooltip content="Removes every bus from the three printed lots">
            <Button variant="danger" onPress={() => setConfirmOpen(true)}>
              Clear lots
            </Button>
          </Tooltip>
          <Button variant="primary">Save changes</Button>
        </div>
      </section>

      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Clear every lot?"
        description="North lot, East lot, and Fence will all be emptied."
        confirmLabel="Clear lots"
        tone="danger"
        onConfirm={() => undefined}
      />
    </div>
  );
}

export const AllStates: Story = {};
