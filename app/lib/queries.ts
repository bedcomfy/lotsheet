"use client";

// Shared server-state hooks (TanStack Query). One cached, deduplicated source per
// endpoint — many components can read the same data without each running its own
// fetch + setInterval. Refetch intervals stand in for "how live" each slice is,
// and are the natural hook point for real-time invalidation later.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Employee, FlagMap, LotSheet, MasterBus } from "./types";
import type { WorkPick } from "./staffing";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

// Refetch intervals below are only a safety FALLBACK — the /api/live long-poll
// (useLiveSync) invalidates these queries within ~1s of any change, so the
// intervals can be generous.
export function useLotSheet(refetchInterval = 30000) {
  return useQuery({
    queryKey: ["sheet"],
    queryFn: () => getJson<{ sheet: LotSheet | null; updatedAt: string | null }>("/api/sheet"),
    refetchInterval,
  });
}

export function useFlags(refetchInterval = 30000) {
  return useQuery({
    queryKey: ["flags"],
    queryFn: async () => (await getJson<{ flags?: FlagMap }>("/api/flags")).flags || {},
    refetchInterval,
  });
}

export function useBusMasterList(refetchInterval = 60000) {
  return useQuery({
    queryKey: ["buses"],
    queryFn: async () => (await getJson<{ master?: { buses?: MasterBus[] } }>("/api/buses")).master?.buses || [],
    refetchInterval,
  });
}

export function useEmployees(refetchInterval = 60000) {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => (await getJson<{ employees?: Employee[] }>("/api/employees")).employees || [],
    refetchInterval,
  });
}

export function useWorkPick(refetchInterval = 60000) {
  return useQuery({
    queryKey: ["workpick"],
    queryFn: async () => (await getJson<{ value?: WorkPick | null }>("/api/state/workpick")).value ?? null,
    refetchInterval,
  });
}

// Save the roster, then refresh the shared cache so every reader updates.
export function useSaveEmployees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (employees: Employee[]) => {
      const res = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employees }),
      });
      if (!res.ok) throw new Error(`save employees → ${res.status}`);
      return (await res.json()) as { employees?: Employee[] };
    },
    onSuccess: (data) => {
      if (data.employees) qc.setQueryData(["employees"], data.employees);
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

// Save the work pick, then refresh the shared cache.
export function useSaveWorkPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: WorkPick | null) => {
      const res = await fetch("/api/state/workpick", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error(`save workpick → ${res.status}`);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workpick"] }),
  });
}
