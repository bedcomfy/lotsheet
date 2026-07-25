import { useState } from "react";
import { ArrowRight, BusFront } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Pressable } from "./Pressable";

function PressableDemo() {
  const [pressed, setPressed] = useState(0);
  return (
    <Pressable
      onPress={() => setPressed((value) => value + 1)}
      style={{
        display: "flex",
        width: "min(28rem, 100%)",
        alignItems: "center",
        gap: "0.75rem",
        padding: "1rem",
        border: "1px solid var(--ui-border)",
        borderRadius: "var(--ui-radius-md)",
        color: "var(--ui-text)",
        background: "var(--ui-surface-raised)",
        textAlign: "left",
      }}
    >
      <BusFront aria-hidden="true" />
      <span style={{ display: "grid", flex: 1 }}>
        <strong>Bus 6427</strong>
        <small style={{ color: "var(--ui-text-muted)" }}>
          Row 8 · pressed {pressed} times
        </small>
      </span>
      <ArrowRight aria-hidden="true" />
    </Pressable>
  );
}

const meta = {
  title: "Components/Pressable",
  component: PressableDemo,
  tags: ["autodocs"],
} satisfies Meta<typeof PressableDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FeatureRow: Story = {};
