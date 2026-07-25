"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BusFront,
  ClipboardList,
  Home,
  Layers3,
  Moon,
  MoreHorizontal,
  Sun,
} from "lucide-react";
import type { AppRoute } from "../lib/navigation";
import {
  MOBILE_MORE_ROUTES,
  MOBILE_SHEET_ROUTES,
} from "../lib/navigation";
import { Button } from "../ui/Button";
import {
  MobileNavigationBar,
  type MobileNavigationItem,
} from "../ui/MobileNavigationBar";
import {
  NavigationHub,
  type NavigationHubItem,
} from "../ui/NavigationHub";

const SHEET_PATHS = [
  "/turnover",
  "/service",
  "/workorder",
  "/fuel",
  "/def",
  "/farebox",
];

const TABS: Array<{
  id: "home" | "lot" | "sheets" | "fleet" | "more";
  label: string;
  icon: LucideIcon;
}> = [
  { id: "home", label: "Home", icon: Home },
  { id: "lot", label: "Lot", icon: ClipboardList },
  { id: "sheets", label: "Sheets", icon: Layers3 },
  { id: "fleet", label: "Fleet", icon: BusFront },
  { id: "more", label: "More", icon: MoreHorizontal },
];

function hubItems(routes: AppRoute[]): NavigationHubItem[] {
  return routes.map((route) => {
    const Icon = route.icon;
    return {
      id: route.path,
      label: route.label,
      description: route.description,
      icon: <Icon />,
    };
  });
}

export default function MobileTabBar() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const [hub, setHub] = useState<null | "sheets" | "more">(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => setHub(null), [pathname]);
  useEffect(() => {
    setTheme(
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : "light",
    );
  }, [hub]);

  if (searchParams.get("print") === "1") return null;

  function go(path: string) {
    setHub(null);
    router.push(path);
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("pace:theme", next);
    } catch {}
  }

  function activeTab() {
    if (hub) return hub;
    if (pathname === "/home") return "home";
    if (pathname === "/") return "lot";
    if (pathname === "/buses") return "fleet";
    if (SHEET_PATHS.some((path) => pathname.startsWith(path))) return "sheets";
    return "more";
  }

  function handleTab(id: string) {
    if (id === "home") go("/home");
    else if (id === "lot") go("/");
    else if (id === "fleet") go("/buses");
    else if (id === "sheets" || id === "more") {
      setHub((current) => (current === id ? null : id));
    }
  }

  const tabs: MobileNavigationItem[] = TABS.map((tab) => {
    const Icon = tab.icon;
    return {
      id: tab.id,
      label: tab.label,
      icon: <Icon />,
    };
  });

  return (
    <>
      <MobileNavigationBar
        activeId={activeTab()}
        items={tabs}
        onAction={handleTab}
      />

      <NavigationHub
        isOpen={hub === "sheets"}
        onOpenChange={(open) => {
          if (!open) setHub(null);
        }}
        title="Sheets"
        description="Daily garage forms"
        items={hubItems(MOBILE_SHEET_ROUTES)}
        onAction={go}
      />

      <NavigationHub
        isOpen={hub === "more"}
        onOpenChange={(open) => {
          if (!open) setHub(null);
        }}
        title="More"
        description="Tools and administration"
        items={hubItems(MOBILE_MORE_ROUTES)}
        onAction={go}
        footer={
          <Button fullWidth onPress={toggleTheme}>
            {theme === "dark" ? (
              <Sun aria-hidden="true" />
            ) : (
              <Moon aria-hidden="true" />
            )}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </Button>
        }
      />
    </>
  );
}
