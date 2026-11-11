import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { FUEL_COLUMNS } from "../lib/fuelBuses";
import { PaperViewport } from "../sheets/core";
import { LETTER_PORTRAIT } from "../sheets/core/profiles";
import { CustomSheetPaper } from "../sheets/custom-sheet/CustomSheetPaper";
import { customSheetSchema } from "../sheets/custom-sheet/schema";
import { TextField } from "./Field";
import styles from "./NewOperationalSheets.stories.module.css";

function CustomSheetExample({ blank = false, longHeader = false, phone = false }) {
  const [data, setData] = useState(() => customSheetSchema.parse({
    header: longHeader ? "Northwest garage special equipment checks and follow-up work for the November service review" : "Equipment Checks",
    date: "11/10/26", entries: { "2770": { gals: "22.5", serv: "AB" } },
  }));
  const content = <>
    {!blank && <TextField label="Sheet header" value={data.header} onChange={(header) => setData({ ...data, header })} />}
    <PaperViewport profile={LETTER_PORTRAIT} mobileViewer label="Custom Sheet paper preview">
      <CustomSheetPaper data={data} busNumbers={FUEL_COLUMNS.flat()} blank={blank} onChange={blank ? undefined : setData} />
    </PaperViewport>
  </>;
  return <main className={styles.canvas}>
    {phone ? <div className={styles.phone}><div className={styles.phoneGallery}>{content}</div></div> : content}
  </main>;
}

const meta = {
  title: "Sheets/Custom Sheet",
  component: CustomSheetExample,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CustomSheetExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Typical: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getByRole("textbox", { name: "Sheet header" });
    await userEvent.clear(header);
    await userEvent.type(header, "November checks");
    await expect(canvasElement.querySelector("[data-sheet-title]")).toHaveTextContent("November checks");
    const paper = canvasElement.querySelector('[data-sheet-id="custom-sheet"]')!.getBoundingClientRect();
    const title = canvasElement.querySelector("[data-sheet-title]")!.getBoundingClientRect();
    const date = canvasElement.querySelector("[data-sheet-date]")!.getBoundingClientRect();
    await expect(Math.abs((title.left + title.right) / 2 - (paper.left + paper.right) / 2)).toBeLessThan(1);
    await expect(date.left).toBeGreaterThan(title.right);
    const gallons = canvas.getByRole("textbox", { name: "Bus 2770 gallons" });
    await userEvent.clear(gallons);
    await userEvent.type(gallons, "12.5");
    await expect(gallons).toHaveValue("12.5");
    await expect(gallons).toHaveFocus();
  },
};
export const Blank: Story = {
  args: { blank: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-sheet-title]")?.textContent?.trim()).toBe("");
    await expect(within(canvasElement).queryByText("Equipment Checks")).not.toBeInTheDocument();
  },
};
export const Dark: Story = { globals: { theme: "dark" } };
export const LongHeader: Story = { args: { longHeader: true } };
export const Phone: Story = { args: { phone: true }, globals: { safeArea: "phone" } };
export const PhoneDark: Story = { args: { phone: true, longHeader: true }, globals: { theme: "dark", safeArea: "phone" } };
