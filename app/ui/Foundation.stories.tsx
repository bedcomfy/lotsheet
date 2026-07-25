import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { CSSProperties } from "react";

const meta = {
  title: "Foundation/Tokens",
  parameters: {
    docs: {
      description: {
        component:
          "The Pace application token layer. Printable sheets keep their own independent paper styles.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const swatches = [
  ["Canvas", "var(--ui-canvas)"],
  ["Surface", "var(--ui-surface)"],
  ["Raised surface", "var(--ui-surface-raised)"],
  ["Muted surface", "var(--ui-surface-muted)"],
  ["Action", "var(--ui-accent-soft)"],
  ["Success", "var(--ui-success-soft)"],
  ["Warning", "var(--ui-warning-soft)"],
  ["Danger", "var(--ui-danger-soft)"],
  ["Information", "var(--ui-info-soft)"],
];

export const ColorAndType: Story = {
  render: () => (
    <div className="ui-story-column">
      <section className="ui-story-section">
        <h2>Interface colors</h2>
        <p>
          Ghost White anchors the light canvas and Onyx anchors the dark
          canvas. Change the theme from the Storybook toolbar.
        </p>
        <div className="ui-token-grid">
          {swatches.map(([label, value]) => (
            <div
              key={label}
              className="ui-token-swatch"
              style={{ "--swatch": value } as CSSProperties}
            >
              {label}
            </div>
          ))}
        </div>
      </section>

      <section className="ui-story-section">
        <h2>Typography</h2>
        <p>
          Regular and medium weights carry most interface text. Semibold is
          reserved for compact headings and important values.
        </p>
        <div style={{ fontSize: "var(--ui-font-size-xl)", fontWeight: 600 }}>
          Fleet readiness
        </div>
        <div style={{ fontSize: "var(--ui-font-size-lg)", fontWeight: 500 }}>
          Bus 6427 · East lot
        </div>
        <div style={{ color: "var(--ui-text-muted)" }}>
          Updated a few seconds ago from the shared lot sheet.
        </div>
      </section>
    </div>
  ),
};
