"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bus, Flag, Users } from "lucide-react";
import AdminFlagEditor from "./AdminFlagEditor";
import AdminGate from "./AdminGate";
import BusListEditor from "./BusListEditor";
import EmployeesEditor from "./EmployeesEditor";

type AdminTool = "flags" | "buses" | "employees";

interface AdminToolsPageProps {
  initialTool?: AdminTool;
}

export default function AdminToolsPage({ initialTool = "flags" }: AdminToolsPageProps) {
  const router = useRouter();
  const [busListOpen, setBusListOpen] = useState(false);
  const [employeesOpen, setEmployeesOpen] = useState(false);

  useEffect(() => {
    setBusListOpen(initialTool === "buses");
    setEmployeesOpen(initialTool === "employees");
  }, [initialTool]);

  const cards = [
    { id: "flags", label: "Flag Editor", meta: "Names, aliases, colors, quick chips, and print behavior.", icon: Flag, path: "/admin/flags" },
    { id: "buses", label: "Bus Lists", meta: "Fleet status, lane inclusion, types, and full CSV editing.", icon: Bus, path: "/admin/buses" },
    { id: "employees", label: "Employees", meta: "Names and badge numbers for Turnover autofill.", icon: Users, path: "/admin/employees" },
  ] as const;

  return (
    <AdminGate>
      <main className="adminpage">
        <section className="adminhero">
          <div>
            <span className="adminhero__eyebrow">Admin Tools</span>
            <h1>Sheet Configuration</h1>
            <p>Protected controls for the data and display rules that affect everyone using the sheets.</p>
          </div>
        </section>

        <section className="admintiles" aria-label="Admin tools">
          {cards.map((card) => {
            const Icon = card.icon;
            const active = initialTool === card.id;
            return (
              <button
                key={card.id}
                className={`admintile ${active ? "admintile--active" : ""}`}
                onClick={() => router.push(card.path)}
              >
                <Icon size={20} />
                <span>
                  <strong>{card.label}</strong>
                  <small>{card.meta}</small>
                </span>
              </button>
            );
          })}
        </section>

        <AdminFlagEditor />

        {busListOpen && (
          <BusListEditor
            onClose={() => {
              setBusListOpen(false);
              router.push("/admin/flags");
            }}
          />
        )}
        {employeesOpen && (
          <EmployeesEditor
            onClose={() => {
              setEmployeesOpen(false);
              router.push("/admin/flags");
            }}
          />
        )}
      </main>
    </AdminGate>
  );
}
