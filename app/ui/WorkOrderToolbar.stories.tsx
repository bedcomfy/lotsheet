import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import WorkOrderToolbar from "../components/WorkOrderToolbar";

const meta = {
  title: "Patterns/Work Order Toolbar",
  component: WorkOrderToolbar,
  parameters: { layout: "fullscreen" },
  args: { savedFlash: false, onOpenSaved: fn(), onSave: fn(), onClear: fn(), onPrintBlank: fn(), onPrintPdf: fn() },
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement);
    for (const name of ["Saved", "Clear", "Print blank", "Print PDF"]) {
      await expect(screen.getByRole("button", { name })).toBeVisible();
    }
    await expect(screen.queryByRole("button", { name: "Print options" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Print blank" }));
    await expect(args.onPrintBlank).toHaveBeenCalledTimes(1);
    await expect(args.onPrintPdf).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await expect(args.onClear).toHaveBeenCalledTimes(1);
  },
} satisfies Meta<typeof WorkOrderToolbar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Saved: Story = { args: { savedFlash: true } };
export const PhoneSafeArea: Story = {
  globals: { safeArea: "phone", viewport: { value: "phoneSmall", isRotated: false } },
};
