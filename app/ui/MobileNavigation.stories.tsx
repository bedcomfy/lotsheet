import { useState } from "react";
import {
  Activity,
  BusFront,
  ClipboardList,
  FileText,
  Fuel,
  Home,
  Layers3,
  Moon,
  MoreHorizontal,
  SearchCode,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./Button";
import {
  MobileNavigationBar,
  type MobileNavigationItem,
} from "./MobileNavigationBar";
import {
  NavigationHub,
  type NavigationHubItem,
} from "./NavigationHub";

const tabs: MobileNavigationItem[] = [
  { id: "home", label: "Home", icon: <Home /> },
  { id: "lot", label: "Lot", icon: <ClipboardList /> },
  { id: "sheets", label: "Sheets", icon: <Layers3 /> },
  { id: "fleet", label: "Fleet", icon: <BusFront /> },
  { id: "more", label: "More", icon: <MoreHorizontal /> },
];

const routes: NavigationHubItem[] = [
  {
    id: "shop",
    label: "Shop",
    description: "Place buses in bays, apron, and cards.",
    icon: <Wrench />,
  },
  {
    id: "service",
    label: "Service Sheets",
    description: "Fuel, DEF, farebox, and service-lane sheets.",
    icon: <Fuel />,
  },
  {
    id: "work-order",
    label: "Work Order",
    description: "Open the printable Oracle eAM form.",
    icon: <FileText />,
  },
  {
    id: "staffing",
    label: "Staffing",
    description: "Review active employees and assignments.",
    icon: <Users />,
  },
  {
    id: "codes",
    label: "Object Codes",
    description: "Search repair and inspection object codes.",
    icon: <SearchCode />,
  },
  {
    id: "admin",
    label: "Admin Tools",
    description: "Manage flags, fleet records, and employees.",
    icon: <Settings />,
  },
  {
    id: "audit",
    label: "Audit Log",
    description: "Review recent operational changes.",
    icon: <Activity />,
  },
];

function MobileNavigationDemo({ long = false }: { long?: boolean }) {
  const [activeId, setActiveId] = useState("home");
  const [isOpen, setIsOpen] = useState(false);
  const hubRoutes = long
    ? [
        ...routes,
        ...Array.from({ length: 16 }, (_, index) => ({
          id: `utility-${index + 1}`,
          label: `Operations utility ${index + 1}`,
          description: "A deliberately long entry used to verify scrolling.",
          icon: <Settings />,
        })),
      ]
    : routes;

  return (
    <div className="ui-story-phone-page">
      <span className="ui-story-phone-page__eyebrow">Mobile foundation</span>
      <h1>Maintenance Logistics</h1>
      <p>
        Bottom navigation stays reachable while page directories own their
        scrolling area.
      </p>
      <Button onPress={() => setIsOpen(true)}>Open page directory</Button>

      <MobileNavigationBar
        activeId={activeId}
        items={tabs}
        onAction={(id) => {
          setActiveId(id);
          if (id === "more" || id === "sheets") setIsOpen(true);
        }}
      />

      <NavigationHub
        title="More"
        description="Pages, tools, and system controls."
        isOpen={isOpen}
        items={hubRoutes}
        onAction={(id) => {
          setActiveId(id);
          setIsOpen(false);
        }}
        onOpenChange={setIsOpen}
        footer={
          <Button variant="quiet">
            <Moon aria-hidden="true" />
            Dark mode
          </Button>
        }
      />
    </div>
  );
}

const meta = {
  title: "Patterns/Mobile Navigation",
  parameters: {
    layout: "fullscreen",
    viewport: {
      defaultViewport: "phoneSmall",
    },
  },
  globals: {
    safeArea: "phone",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PhoneBar: Story = {
  render: () => <MobileNavigationDemo />,
};

export const LongDirectory: Story = {
  render: () => <MobileNavigationDemo long />,
};
