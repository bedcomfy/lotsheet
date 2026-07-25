import {
  BusFront,
  ClipboardList,
  FileText,
  Home,
  Layers,
  MoreHorizontal,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppNavigation } from "./Navigation";
import type { NavigationItem } from "./Navigation";

const desktopItems: NavigationItem[] = [
  { id: "home", label: "Home", href: "/home", icon: <Home /> },
  {
    id: "lot",
    label: "Lot Sheet",
    href: "/",
    icon: <ClipboardList />,
    section: "Sheets",
  },
  {
    id: "service",
    label: "Service Sheets",
    href: "/service",
    icon: <Layers />,
    section: "Sheets",
  },
  {
    id: "turnover",
    label: "Turnover Sheet",
    href: "/turnover",
    icon: <FileText />,
    section: "Sheets",
  },
  {
    id: "shop",
    label: "Shop",
    href: "/shop",
    icon: <Wrench />,
    section: "Operations",
  },
  {
    id: "fleet",
    label: "Fleet",
    href: "/buses",
    icon: <BusFront />,
    section: "Operations",
  },
  {
    id: "staffing",
    label: "Staffing",
    href: "/staffing/seniority",
    icon: <Users />,
    section: "Operations",
  },
  {
    id: "admin",
    label: "Admin Tools",
    href: "/admin/flags",
    icon: <Settings />,
    section: "System",
  },
];

const mobileItems: NavigationItem[] = [
  { id: "home", label: "Home", href: "/home", icon: <Home /> },
  { id: "lot", label: "Lot", href: "/", icon: <ClipboardList /> },
  { id: "sheets", label: "Sheets", href: "/service", icon: <Layers /> },
  { id: "fleet", label: "Fleet", href: "/buses", icon: <BusFront /> },
  { id: "more", label: "More", href: "/home", icon: <MoreHorizontal /> },
];

const meta = {
  title: "Components/Navigation",
  component: AppNavigation,
  tags: ["autodocs"],
  args: {
    activeId: "lot",
    items: desktopItems,
  },
} satisfies Meta<typeof AppNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sidebar: Story = {};

export const BottomBar: Story = {
  args: {
    activeId: "fleet",
    items: mobileItems,
    mode: "bottom",
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

export const LongLabels: Story = {
  args: {
    activeId: "long",
    items: [
      ...desktopItems,
      {
        id: "long",
        label: "A deliberately long navigation destination that cannot escape",
        href: "/home",
        icon: <Settings />,
        section: "System",
      },
    ],
  },
};
