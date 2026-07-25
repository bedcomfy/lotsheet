import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BusFront,
  ClipboardList,
  FileText,
  Fuel,
  Home,
  RefreshCw,
  SearchCode,
  ShieldAlert,
  Users,
  Wrench,
} from "lucide-react";

export interface AppRoute {
  path: string;
  label: string;
  icon: LucideIcon;
  description: string;
  matchPrefix?: string;
}

export interface AppRouteGroup {
  label: string;
  routes: AppRoute[];
}

export const HOME_ROUTE: AppRoute = {
  path: "/home",
  label: "Home",
  icon: Home,
  description: "Fleet status and daily overview",
};

export const DAILY_SHEET_ROUTES: AppRoute[] = [
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

export const SHOP_ROUTES: AppRoute[] = [
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

export const FORM_ROUTES: AppRoute[] = [
  {
    path: "/workorder",
    label: "Work Order",
    icon: FileText,
    description: "Create and print Oracle eAM work orders",
  },
];

export const STAFFING_ROUTE: AppRoute = {
  path: "/staffing/seniority",
  label: "Staffing",
  icon: Users,
  matchPrefix: "/staffing",
  description: "Seniority, employees, and work picks",
};

export const ADMIN_ROUTE: AppRoute = {
  path: "/admin/flags",
  label: "Admin Tools",
  icon: ShieldAlert,
  matchPrefix: "/admin",
  description: "Manage flags, fleet, and employees",
};

export const UTILITY_ROUTES: AppRoute[] = [
  {
    path: "/object-codes",
    label: "Object Codes",
    icon: SearchCode,
    description: "Search maintenance codes and descriptions",
  },
];

export const SYSTEM_ROUTES: AppRoute[] = [
  {
    path: "/audit",
    label: "Audit Log",
    icon: Activity,
    description: "Review changes across every sheet",
  },
];

export const NAVIGATION_GROUPS: AppRouteGroup[] = [
  { label: "Workspace", routes: [HOME_ROUTE] },
  {
    label: "Operations",
    routes: [...DAILY_SHEET_ROUTES, ...SHOP_ROUTES, ...FORM_ROUTES],
  },
  { label: "Workforce", routes: [STAFFING_ROUTE] },
  { label: "Reference", routes: UTILITY_ROUTES },
  {
    label: "Administration",
    routes: [ADMIN_ROUTE, ...SYSTEM_ROUTES],
  },
];

export const APP_ROUTES: AppRoute[] = NAVIGATION_GROUPS.flatMap(
  (group) => group.routes,
);

export const MOBILE_SHEET_ROUTES: AppRoute[] = [
  ...DAILY_SHEET_ROUTES,
  ...FORM_ROUTES,
];

export const MOBILE_MORE_ROUTES: AppRoute[] = [
  SHOP_ROUTES[0],
  STAFFING_ROUTE,
  ...UTILITY_ROUTES,
  ADMIN_ROUTE,
  ...SYSTEM_ROUTES,
];

export function routeIsActive(
  route: AppRoute,
  pathname: string | null,
): boolean {
  if (!pathname) return false;
  if (route.matchPrefix) {
    return pathname === route.path || pathname.startsWith(route.matchPrefix);
  }
  return pathname === route.path;
}

export function currentAppRoute(pathname: string | null): AppRoute {
  return (
    APP_ROUTES.find((route) => routeIsActive(route, pathname)) ??
    DAILY_SHEET_ROUTES[0]
  );
}
