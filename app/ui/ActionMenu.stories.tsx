import {
  ClipboardList,
  Flag,
  MapPin,
  MoreHorizontal,
  Printer,
  Trash2,
  Wrench,
} from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { ActionMenu } from "./ActionMenu";
import type { ActionMenuItem } from "./ActionMenu";

const baseItems: ActionMenuItem[] = [
  {
    id: "fill",
    label: "Fill rows",
    description: "Enter buses row by row",
    icon: <ClipboardList />,
  },
  {
    id: "flags",
    label: "Edit flags",
    description: "Add or resolve maintenance flags",
    icon: <Flag />,
  },
  {
    id: "shop",
    label: "Send to shop",
    description: "Choose a bay, apron, or card location",
    icon: <Wrench />,
  },
  {
    id: "print",
    label: "Print PDF",
    description: "Open the current printable sheet",
    icon: <Printer />,
  },
  {
    id: "clear",
    label: "Clear lots",
    description: "Remove every bus from lot locations",
    icon: <Trash2 />,
    tone: "danger",
  },
];

const meta = {
  title: "Components/Action Menu",
  component: ActionMenu,
  tags: ["autodocs"],
  args: {
    label: (
      <>
        <MoreHorizontal aria-hidden="true" />
        More
      </>
    ),
    items: baseItems,
    onAction: fn(),
  },
} satisfies Meta<typeof ActionMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongOperationalList: Story = {
  args: {
    label: "Choose location",
    items: Array.from({ length: 30 }, (_, index) => ({
      id: `east-${index + 1}`,
      label: `East lot position ${index + 1}`,
      description:
        index % 4 === 0
          ? "Contains a longer operational note that must remain inside the menu"
          : `${index + 1} buses currently assigned`,
      icon: <MapPin />,
    })),
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
