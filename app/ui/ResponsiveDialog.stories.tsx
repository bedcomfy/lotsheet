import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./Button";
import { TextField } from "./Field";
import { ResponsiveDialog } from "./ResponsiveDialog";

const meta = {
  title: "Patterns/Responsive Dialog",
  component: DialogDemo,
  tags: ["autodocs"],
} satisfies Meta<typeof DialogDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

function DialogDemo({ long = false }: { long?: boolean }) {
  const [isOpen, setOpen] = useState(false);

  return (
    <>
      <Button variant="primary" onPress={() => setOpen(true)}>
        Open bus editor
      </Button>
      <ResponsiveDialog
        isOpen={isOpen}
        onOpenChange={setOpen}
        title="Edit bus 6427"
        description="Changes are shared with everyone viewing the sheet."
        footer={(close) => (
          <>
            <Button variant="quiet" onPress={close}>
              Cancel
            </Button>
            <Button variant="primary" onPress={close}>
              Save changes
            </Button>
          </>
        )}
      >
        <div className="ui-story-column">
          <TextField label="Bus number" defaultValue="6427" />
          <TextField label="Location" defaultValue="East lot" />
          {long &&
            Array.from({ length: 24 }, (_, index) => (
              <TextField
                key={index}
                label={`Maintenance item ${index + 1}`}
                defaultValue={
                  index % 3 === 0 ? "Inspection follow-up required" : ""
                }
                placeholder="Flag or note"
              />
            ))}
        </div>
      </ResponsiveDialog>
    </>
  );
}

export const Desktop: Story = {
  args: {
    long: false,
  },
};

export const PhoneWithLongContent: Story = {
  args: {
    long: true,
  },
  parameters: {
    viewport: {
      defaultViewport: "phoneSmall",
    },
  },
  globals: {
    safeArea: "phone",
  },
};
