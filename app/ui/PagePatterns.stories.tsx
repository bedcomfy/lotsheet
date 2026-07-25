import { AlertTriangle, BusFront, Plus } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  AppPage,
  Button,
  DataTableFrame,
  EmptyState,
  PageHeader,
  Panel,
  SearchField,
  Skeleton,
  StaticChip,
  Toolbar,
  ToolbarGroup,
} from "./index";

const meta = {
  title: "Patterns/Page States",
  component: PageStateDemo,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageStateDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

function PageStateDemo({ state = "ready" }: { state?: "ready" | "empty" | "loading" | "error" }) {
  return (
    <AppPage>
      <PageHeader
        eyebrow="Reference"
        title="Object Codes"
        description="Search maintenance object codes by number or description."
        actions={<Button variant="primary"><Plus /> Add code</Button>}
      />
      <Toolbar>
        <ToolbarGroup>
          <SearchField
            label="Search object codes"
            labelHidden
            placeholder="Code or description"
          />
        </ToolbarGroup>
        <ToolbarGroup>
          <StaticChip tone="accent">284 codes</StaticChip>
        </ToolbarGroup>
      </Toolbar>
      <Panel title="Code directory" description="Shared maintenance reference">
        {state === "loading" && (
          <div className="ui-story-column">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} style={{ height: "2.75rem" }} />
            ))}
          </div>
        )}
        {state === "empty" && (
          <EmptyState
            title="No object codes match"
            description="Try a broader number or description."
            icon={<BusFront />}
          />
        )}
        {state === "error" && (
          <EmptyState
            kind="error"
            title="Object codes could not load"
            description="The live reference is temporarily unavailable."
            icon={<AlertTriangle />}
            action={<Button>Try again</Button>}
          />
        )}
        {state === "ready" && (
          <DataTableFrame>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ padding: 12, textAlign: "left" }}>Code</th>
                  <th style={{ padding: 12, textAlign: "left" }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["0100", "Repair front axle and suspension as needed"],
                  ["0415", "Brake test as needed"],
                  ["6603", "PM-A 3000 miles"],
                ].map(([code, description]) => (
                  <tr key={code}>
                    <td style={{ padding: 12 }}>{code}</td>
                    <td style={{ padding: 12 }}>{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableFrame>
        )}
      </Panel>
    </AppPage>
  );
}

export const Ready: Story = { args: { state: "ready" } };
export const Empty: Story = { args: { state: "empty" } };
export const Loading: Story = { args: { state: "loading" } };
export const Error: Story = { args: { state: "error" } };
