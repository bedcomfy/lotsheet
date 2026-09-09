import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, userEvent, within } from "storybook/test";
import { BusMasterProvider } from "../components/BusMasterProvider";
import BusCard from "../components/BusCard";
import { emptyFlagEntry } from "../lib/serviceLaneSetup";
import type { FlagMap, LotSheet } from "../lib/types";

const SHEET: LotSheet = {
  cells: { s12: "6427" },
  lots: { north: ["6404"], east: [], fence: [], bay: ["", "", "6442", "", "", "", "", "", "", ""] },
  locks: [],
};

const FLAGS: FlagMap = {
  "6442": {
    ...emptyFlagEntry(),
    flags: ["hold", "oos", "cleaning", "retorque"],
    holdReason: "Cubs Bus",
    retorqueTires: ["cr", "rr"],
  },
  "6404": { ...emptyFlagEntry(), flags: ["inspection"] },
};

// The card reads the shared live queries; in Storybook the cache is seeded and
// never refetched, and every save is rejected (there is no API), so the
// failure path — revert + message — is what the play tests exercise.
function makeClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchInterval: false, refetchOnWindowFocus: false } },
  });
  client.setQueryData(["sheet"], { sheet: SHEET, updatedAt: "2026-09-09T02:00:00Z" });
  client.setQueryData(["flags"], FLAGS);
  client.setQueryData(["m-service-tonight"], {
    fuel: { entries: { "6442": { gals: "42" } } },
    def: { entries: {} },
    farebox: { entries: { "6442": { yn: "y" } } },
  });
  return client;
}

function Fixture({ bus }: { bus: string }) {
  return (
    <QueryClientProvider client={makeClient()}>
      <BusMasterProvider>
        <BusCard bus={bus} onClose={() => {}} onOpenLotSheet={() => {}} />
      </BusMasterProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Patterns/Bus Card",
  component: BusCard,
  parameters: { layout: "fullscreen" },
  args: { bus: "6442", onClose: () => {} },
} satisfies Meta<typeof BusCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeldBusInBay: Story = {
  render: () => <Fixture bus="6442" />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await expect(screen.getByRole("heading", { name: "Bus 6442" })).toBeInTheDocument();
    await expect(screen.getByText("Bay 3", { selector: "p" })).toBeInTheDocument();
    await expect(screen.getByText("Not ready for service")).toBeInTheDocument();
    await expect(screen.getByText("Hold · Cubs Bus")).toBeInTheDocument();
    await expect(screen.getByText("Fueled ✓")).toBeInTheDocument();
    await expect(screen.getByRole("button", { name: "Hold" })).toHaveAttribute("aria-pressed", "true");
  },
};

export const QuickFlagRevertsWhenTheSaveFails: Story = {
  render: () => <Fixture bus="6427" />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await expect(screen.getByText("No flags")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Needs cleaning" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that change");
    await expect(screen.getByRole("button", { name: "Needs cleaning" })).toHaveAttribute("aria-pressed", "false");
    await expect(screen.getByText("No flags")).toBeInTheDocument();
  },
};

export const ClearFlagsConfirmsInline: Story = {
  render: () => <Fixture bus="6442" />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await expect(screen.getByRole("alertdialog", { name: "Clear every flag from this bus?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    await expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await expect(screen.getByText("Hold · Cubs Bus")).toBeInTheDocument();
  },
};

export const PhoneSafeArea: Story = {
  render: () => <Fixture bus="6442" />,
  parameters: { viewport: { defaultViewport: "phoneSmall" } },
  globals: { safeArea: "phone" },
};
