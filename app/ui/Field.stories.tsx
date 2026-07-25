import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SearchField, TextAreaField, TextField } from "./Field";

const meta = {
  title: "Components/Fields",
  component: TextField,
  tags: ["autodocs"],
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Bus number",
    placeholder: "Enter bus number",
    description: "Searches the active fleet and current sheet placement.",
  },
};

export const Invalid: Story = {
  args: {
    label: "Employee badge",
    defaultValue: "ABC",
    isInvalid: true,
    errorMessage: "Badge numbers must contain digits only.",
  },
};

export const FieldSet: Story = {
  args: {
    label: "Field examples",
  },
  render: () => (
    <div className="ui-story-column">
      <TextField
        label="Object code description"
        placeholder="Repair cooling system as needed"
      />
      <SearchField
        label="Find a bus"
        placeholder="Bus number, model, or flag"
        description="The entire control is clickable and keyboard accessible."
      />
      <TextField
        label="A deliberately long field label that must wrap without stretching or clipping"
        placeholder="Long labels stay readable"
      />
      <TextField
        label="Read-only value"
        value="6427"
        isReadOnly
      />
      <TextField
        label="Disabled value"
        value="Unavailable"
        isDisabled
      />
      <TextAreaField
        label="Operational notes"
        defaultValue="Farebox will not probe after reset."
        description="Long text uses the same focus and validation contract."
        rows={4}
      />
    </div>
  ),
};
