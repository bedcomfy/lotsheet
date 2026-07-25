import {
  BusFront,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  FileText,
  Flag,
  Home,
  Layers,
  MapPinOff,
  MoreHorizontal,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppNavigation } from "./Navigation";
import type { NavigationItem } from "./Navigation";
import { MetricTile } from "./MetricTile";
import { StatusBadge } from "./StatusBadge";

const sidebarItems: NavigationItem[] = [
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

const bottomItems: NavigationItem[] = [
  { id: "home", label: "Home", href: "/home", icon: <Home /> },
  { id: "lot", label: "Lot", href: "/", icon: <ClipboardList /> },
  { id: "sheets", label: "Sheets", href: "/service", icon: <Layers /> },
  { id: "fleet", label: "Fleet", href: "/buses", icon: <BusFront /> },
  { id: "more", label: "More", href: "/home", icon: <MoreHorizontal /> },
];

function FleetContent() {
  return (
    <main className="ui-shell-demo__content">
      <header className="ui-shell-demo__header">
        <div>
          <div className="ui-shell-demo__eyebrow">Live operations</div>
          <h1>Maintenance Logistics</h1>
          <p>Fleet readiness and garage placement from the working sheets.</p>
        </div>
        <StatusBadge tone="accent">Live updates</StatusBadge>
      </header>

      <div className="ui-metric-grid">
        <MetricTile
          label="Usable buses"
          value={95}
          detail="Ready for service"
          icon={<CircleCheck />}
          tone="success"
        />
        <MetricTile
          label="Out of service"
          value={35}
          detail="Lots and shop"
          icon={<Wrench />}
          tone="warning"
        />
        <MetricTile
          label="Off property"
          value={3}
          detail="Tracked separately"
          icon={<MapPinOff />}
          tone="info"
        />
        <MetricTile
          label="Missing"
          value={116}
          detail="Not assigned tonight"
          icon={<CircleAlert />}
          tone="danger"
        />
      </div>

      <section className="ui-shell-demo__band">
        <div>
          <span className="ui-shell-demo__band-value">11</span>
          <strong>flagged buses</strong>
          <span>Open maintenance items</span>
        </div>
        <Flag aria-hidden="true" />
      </section>
    </main>
  );
}

const meta = {
  title: "Patterns/Operations Shell",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  render: () => (
    <div className="ui-shell-demo ui-shell-demo--desktop">
      <aside className="ui-shell-demo__rail">
        <div className="ui-shell-demo__brand">
          <img src="/logo.png" alt="" />
          <span>
            <strong>Pace Northwest</strong>
            <small>Operations</small>
          </span>
        </div>
        <AppNavigation activeId="home" items={sidebarItems} />
      </aside>
      <FleetContent />
    </div>
  ),
};

export const Phone: Story = {
  render: () => (
    <div className="ui-shell-demo ui-shell-demo--phone">
      <div className="ui-shell-demo__phone-top">
        <img src="/logo.png" alt="" />
        <strong>Home</strong>
        <StatusBadge tone="accent" size="sm">
          Live
        </StatusBadge>
      </div>
      <FleetContent />
      <AppNavigation activeId="home" items={bottomItems} mode="bottom" />
    </div>
  ),
  parameters: {
    viewport: {
      defaultViewport: "phoneSmall",
    },
  },
  globals: {
    safeArea: "phone",
  },
};
