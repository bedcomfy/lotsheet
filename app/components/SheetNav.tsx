"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import GlobalBusSearch from "./GlobalBusSearch";
import { useMobileNav } from "./MobileNavContext";
import { APP_VERSION } from "../lib/appVersion";
import {
  APP_ROUTES,
  currentAppRoute,
  NAVIGATION_GROUPS,
} from "../lib/navigation";
import { AppNavigation, type NavigationItem } from "../ui/Navigation";
import {
  NavigationHub,
  type NavigationHubItem,
} from "../ui/NavigationHub";
import { Pressable } from "../ui/Pressable";
import styles from "./SheetNav.module.css";

export default function SheetNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSheet = currentAppRoute(pathname);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);

  // Collapsed icon-rail preference — restored after mount so SSR markup stays
  // stable; the brief expanded flash matches how the theme restore behaves.
  useEffect(() => {
    try {
      if (localStorage.getItem("pace:nav-rail") === "1") setRailCollapsed(true);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-nav-rail", railCollapsed);
    try {
      localStorage.setItem("pace:nav-rail", railCollapsed ? "1" : "0");
    } catch {}
  }, [railCollapsed]);
  const { lotStatus, openLotSearch, openLotStatus } = useMobileNav();
  const isLotSheet = currentSheet.path === "/";
  const printMode = searchParams.get("print") === "1";

  if (printMode) return null;

  const navigationItems: NavigationItem[] = NAVIGATION_GROUPS.flatMap(
    (group) =>
      group.routes.filter((route) => route.path !== "/buses").map((route) => {
        const Icon = route.icon;
        return {
          id: route.path,
          label: route.label,
          href: route.path,
          section: group.label,
          icon: <Icon size={18} />,
        };
      }),
  );
  const switcherItems: NavigationHubItem[] = APP_ROUTES.map((route) => {
    const Icon = route.icon;
    return {
      id: route.path,
      label: route.label,
      description: route.description,
      icon: <Icon />,
    };
  });

  function navigate(path: string) {
    setSwitcherOpen(false);
    router.push(path);
  }

  return (
    <>
      <nav
        className={`${styles.navigation} ${railCollapsed ? styles.rail : ""} no-print`}
        aria-label="Main navigation"
      >
        <div className={styles.brand}>
          <span className={styles.mark}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.logo} src="/logo.png" alt="" />
          </span>
          <span className={styles.brandCopy}>
            <span className={styles.name}>Pace Northwest</span>
            <span className={styles.subtitle}>Maintenance Logistics</span>
          </span>
        </div>

        <div className={styles.mobileBar}>
          <Pressable
            className={styles.pageTitle}
            onPress={() => setSwitcherOpen(true)}
            aria-expanded={switcherOpen}
            aria-haspopup="dialog"
          >
            <span>{currentSheet.label}</span>
            <ChevronDown size={17} />
          </Pressable>
          {isLotSheet && lotStatus && (
            <Pressable className={styles.mobileStatus} onPress={openLotStatus}>
              <span>{lotStatus.usable} usable</span>
              <span aria-hidden="true">&middot;</span>
              <span>{lotStatus.outOfService} out</span>
            </Pressable>
          )}
          {isLotSheet && (
            <Pressable className={styles.mobileSearch} onPress={openLotSearch} aria-label="Find bus">
              <Search size={19} />
            </Pressable>
          )}
        </div>

        <div className={styles.desktopLinks}>
          <AppNavigation
            activeId={currentSheet.path}
            items={navigationItems}
            className={styles.desktopNavigation}
            collapsed={railCollapsed}
          />
        </div>
        <div className={styles.bottom}>
          {!railCollapsed && <ThemeToggle />}
          <Pressable
            className={styles.railToggle}
            onPress={() => setRailCollapsed((current) => !current)}
            aria-label={railCollapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {railCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            {!railCollapsed && <span>Collapse</span>}
          </Pressable>
          {!railCollapsed && (
            <div className={styles.version}>
              <span>Maintenance Logistics</span>
              <strong>v{APP_VERSION}</strong>
            </div>
          )}
        </div>
      </nav>

      <header className={`${styles.header} no-print`}>
        <div className={styles.headerPage}>
          <strong>{currentSheet.label}</strong>
          <span>{currentSheet.description}</span>
        </div>
        <GlobalBusSearch />
      </header>

      <NavigationHub
        isOpen={switcherOpen}
        onOpenChange={setSwitcherOpen}
        title="Pages"
        description="Choose where you want to work."
        items={switcherItems}
        onAction={navigate}
        footer={
          <div className={styles.hubFooter}>
            <ThemeToggle />
            <span>v{APP_VERSION}</span>
          </div>
        }
      />
    </>
  );
}
