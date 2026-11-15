import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { FusionExpiryCountdown } from "../components/FusionExpiryCountdown";

const meta = { title: "Patterns/Oracle Access Countdown", component: FusionExpiryCountdown,
  args: { expiresAt: Date.now() + 7200000 }, parameters: { layout: "padded" },
} satisfies Meta<typeof FusionExpiryCountdown>;
export default meta;
type Story = StoryObj<typeof meta>;
function FreshExpiry({ duration }: { duration: number }) {
  const [expiry] = useState(() => Date.now() + duration);
  return <FusionExpiryCountdown expiresAt={expiry} />;
}
export const Running: Story = { render: () => <FreshExpiry duration={7200000} />,
  play: async ({ canvasElement }) => {
    const timer = within(canvasElement).getByRole("timer", { name: "Oracle access time remaining" });
    await waitFor(() => expect(timer).toHaveTextContent(/\d{2}:\d{2}:\d{2} remaining/));
    const first = Number(timer.getAttribute("data-remaining-seconds"));
    await waitFor(() => expect(Number(timer.getAttribute("data-remaining-seconds"))).toBeLessThan(first), { timeout: 3000 });
    await expect(timer).toHaveAttribute("aria-live", "off");
  } };
export const Expiring: Story = { render: () => <FreshExpiry duration={1500} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByRole("timer")).toHaveTextContent("Access expired · reconnect"), { timeout: 4000 });
  } };
export const Expired: Story = { render: () => <FreshExpiry duration={-1000} /> };
export const Dark: Story = { ...Running, play: undefined, globals: { theme: "dark" } };
export const PhoneSafeArea: Story = { ...Running, play: undefined, globals: { safeArea: "phone", viewport: { value: "phoneSmall" } }, parameters: { viewport: { defaultViewport: "phoneSmall" } } };
export const LongContent: Story = { render: () => <FreshExpiry duration={90061000} /> };
