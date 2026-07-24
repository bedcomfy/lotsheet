"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BusFront,
  ChevronDown,
  ClipboardList,
  FileText,
  Fuel,
  Home,
  RefreshCw,
  Search,
  SearchCode,
  ShieldAlert,
  Users,
  Wrench,
  X,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { useMobileNav } from "./MobileNavContext";
import { APP_VERSION } from "../lib/appVersion";

export interface SheetLink {
  path: string;
  label: string;
  icon: LucideIcon;
  description: string;
  matchPrefix?: string;
}

const HOME_LINK: SheetLink = {
  path: "/home",
  label: "Home",
  icon: Home,
  description: "Fleet status and daily overview",
};

export const DAILY_SHEETS: SheetLink[] = [
  {
    path: "/",
    label: "Lot Sheet",
    icon: ClipboardList,
    description: "Live bus locations, flags, and lots",
  },
  {
    path: "/turnover",
    label: "Turnover Sheet",
    icon: RefreshCw,
    description: "Shift handoff and first-half notes",
  },
  {
    path: "/service",
    label: "Service Sheets",
    icon: Fuel,
    matchPrefix: "/service",
    description: "Fuel, DEF, farebox, and lane sheets",
  },
];

export const SHOP_SHEETS: SheetLink[] = [
  {
    path: "/shop",
    label: "Shop",
    icon: Wrench,
    description: "Bays, cards, apron, and shop work",
  },
  {
    path: "/buses",
    label: "Fleet",
    icon: BusFront,
    description: "Find buses, locations, flags, and service status",
  },
];

export const FORM_SHEETS: SheetLink[] = [
  {
    path: "/workorder",
    label: "Work Order",
    icon: FileText,
    description: "Create and print Oracle eAM work orders",
  },
];

export const STAFFING_LINK: SheetLink = {
  path: "/staffing/seniority",
  label: "Staffing",
  icon: Users,
  matchPrefix: "/staffing",
  description: "Seniority, employees, and work picks",
};

export const ADMIN_LINK: SheetLink = {
  path: "/admin/flags",
  label: "Admin Tools",
  icon: ShieldAlert,
  matchPrefix: "/admin",
  description: "Manage flags, fleet, and employees",
};

export const UTILITY_LINKS: SheetLink[] = [
  {
    path: "/object-codes",
    label: "Object Codes",
    icon: SearchCode,
    description: "Search maintenance codes and descriptions",
  },
];

export const SYSTEM_LINKS: SheetLink[] = [
  {
    path: "/audit",
    label: "Audit Log",
    icon: Activity,
    description: "Review changes across every sheet",
  },
];

export const NAV_LINKS: SheetLink[] = [
  ...DAILY_SHEETS,
  ...SHOP_SHEETS,
  ...FORM_SHEETS,
  STAFFING_LINK,
  ...UTILITY_LINKS,
];
export const BOTTOM_LINKS: SheetLink[] = [ADMIN_LINK, ...SYSTEM_LINKS];
export const SHEETS: SheetLink[] = [HOME_LINK, ...NAV_LINKS, ...BOTTOM_LINKS];

const NAV_GROUPS = [
  { label: "Workspace", links: [HOME_LINK] },
  { label: "Operations", links: [...DAILY_SHEETS, ...SHOP_SHEETS, ...FORM_SHEETS] },
  { label: "Workforce", links: [STAFFING_LINK] },
  { label: "Reference", links: UTILITY_LINKS },
  { label: "Administration", links: [ADMIN_LINK, ...SYSTEM_LINKS] },
];

function isActive(sheet: SheetLink, pathname: string | null): boolean {
  if (!pathname) return false;
  if (sheet.matchPrefix) return pathname === sheet.path || pathname.startsWith(sheet.matchPrefix);
  return pathname === sheet.path;
}

export default function SheetNav() {
  const router = useRouter();
  const pathname = usePathname();
  const currentSheet = SHEETS.find((sheet) => isActive(sheet, pathname)) || DAILY_SHEETS[0];
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [globalFind, setGlobalFind] = useState("");
  const { lotStatus, openLotSearch, openLotStatus } = useMobileNav();
  const isLotSheet = currentSheet.path === "/";

  useEffect(() => {
    if (!switcherOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSwitcherOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [switcherOpen]);

  function navigate(path: string) {
    setSwitcherOpen(false);
    router.push(path);
  }

  function findBus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const bus = globalFind.trim();
    router.push(bus ? `/?find=${encodeURIComponent(bus)}` : "/");
  }

  function renderLink(sheet: SheetLink) {
    const Icon = sheet.icon;
    return (
      <button
        key={sheet.path}
        type="button"
        className={`appnav__link ${isActive(sheet, pathname) ? "appnav__link--active" : ""}`}
        onClick={() => navigate(sheet.path)}
      >
        <Icon size={18} />
        <span>{sheet.label}</span>
      </button>
    );
  }

  return (
    <>
      <nav className="appnav no-print" aria-label="Main navigation">
        <div className="appnav__brand">
          <span className="appnav__mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="appnav__logo" src="/logo.png" alt="" />
          </span>
          <span className="appnav__brandcopy">
            <span className="appnav__name">Pace Northwest</span>
            <span className="appnav__sub">Maintenance Logistics</span>
          </span>
        </div>

        <div className="appnav__mobilebar">
          <button
            type="button"
            className="appnav__pagetitle"
            onClick={() => setSwitcherOpen(true)}
            aria-expanded={switcherOpen}
            aria-haspopup="dialog"
          >
            <span>{currentSheet.label}</span>
            <ChevronDown size={17} />
          </button>
          {isLotSheet && lotStatus && (
            <button type="button" className="appnav__status" onClick={openLotStatus}>
              <span>{lotStatus.usable} usable</span>
              <span aria-hidden="true">&middot;</span>
              <span>{lotStatus.outOfService} out</span>
            </button>
          )}
          {isLotSheet && (
            <button type="button" className="appnav__search" onClick={openLotSearch} aria-label="Find bus">
              <Search size={19} />
            </button>
          )}
        </div>

        <div className="appnav__desktoplinks">
          {NAV_GROUPS.map((group) => (
            <div className="appnav__section" key={group.label}>
              <div className="appnav__sectionlabel">{group.label}</div>
              {group.links.map(renderLink)}
            </div>
          ))}
        </div>
        <div className="appnav__section appnav__section--bottom">
          <ThemeToggle />
          <div className="appnav__version">
            <span>Maintenance Logistics</span>
            <strong>v{APP_VERSION}</strong>
          </div>
        </div>
      </nav>

      <header className="appheader no-print">
        <div className="appheader__page">
          <strong>{currentSheet.label}</strong>
          <span>{currentSheet.description}</span>
        </div>
        <form className="appheader__search" onSubmit={findBus}>
          <Search size={18} />
          <input
            value={globalFind}
            inputMode="numeric"
            aria-label="Search fleet"
            placeholder="Search fleet by bus number"
            onChange={(event) => setGlobalFind(event.target.value.replace(/\D/g, "").slice(0, 5))}
          />
          <kbd>Enter</kbd>
        </form>
        <div className="appheader__status">
          <span className="appheader__live"><i /> Live</span>
          <button type="button" className="appheader__fleet" onClick={() => router.push("/buses")}>
            <BusFront size={17} />
            Fleet
          </button>
        </div>
      </header>

      {switcherOpen && (
        <div
          className="pageswitch no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Choose a page"
          onClick={() => setSwitcherOpen(false)}
        >
          <div className="pageswitch__panel" onClick={(event) => event.stopPropagation()}>
            <header className="pageswitch__head">
              <div>
                <h2>Pages</h2>
                <p>Choose where you want to work.</p>
              </div>
              <button
                type="button"
                className="pageswitch__close"
                onClick={() => setSwitcherOpen(false)}
                aria-label="Close page switcher"
              >
                <X size={22} />
              </button>
            </header>
            <div className="pageswitch__grid">
              {SHEETS.map((sheet) => {
                const Icon = sheet.icon;
                const active = isActive(sheet, pathname);
                return (
                  <button
                    key={sheet.path}
                    type="button"
                    className={`pageswitch__tile ${active ? "pageswitch__tile--active" : ""}`}
                    onClick={() => navigate(sheet.path)}
                  >
                    <span className="pageswitch__icon"><Icon size={21} /></span>
                    <span className="pageswitch__copy">
                      <strong>{sheet.label}</strong>
                      <small>{sheet.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <footer className="pageswitch__foot">
              <ThemeToggle />
              <span>v{APP_VERSION}</span>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
