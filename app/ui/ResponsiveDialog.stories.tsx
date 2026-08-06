import { useEffect, useState } from "react";
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

function DialogDemo({ long = false, keyboard = false }: { long?: boolean; keyboard?: boolean }) {
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    if (!keyboard) return;
    const root = document.documentElement;
    const previousHeight = root.style.getPropertyValue("--ui-viewport-height");
    root.style.setProperty("--ui-viewport-height", "31.25rem");
    root.setAttribute("data-ui-keyboard-open", "");
    return () => {
      if (previousHeight) root.style.setProperty("--ui-viewport-height", previousHeight);
      else root.style.removeProperty("--ui-viewport-height");
      root.removeAttribute("data-ui-keyboard-open");
    };
  }, [keyboard]);

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
    keyboard: false,
  },
};

export const PhoneWithLongContent: Story = {
  args: {
    long: true,
    keyboard: false,
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

export const PhoneWithKeyboardAndLongContent: Story = {
  args: {
    long: true,
    keyboard: true,
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
