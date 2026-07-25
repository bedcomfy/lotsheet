import { useState } from "react";
import {
  ClipboardList,
  Flag,
  MapPin,
  MoreHorizontal,
  Printer,
  RotateCcw,
  Trash2,
  Wrench,
} from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import {
  ActionMenu,
  Button,
  Chip,
  Panel,
  Pressable,
  ResponsiveDialog,
  SearchField,
  StaticChip,
  StatusBadge,
} from "./index";
import styles from "./WorkflowRegression.stories.module.css";

const meta = {
  title: "Patterns/Workflow Regressions",
  component: LotToolbarFixture,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LotToolbarFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

function LotToolbarFixture() {
  const [query, setQuery] = useState("");
  const found = query === "6427";

  return (
    <div className={styles.canvas}>
      <div className={styles.toolbar}>
        <h2 className={styles.title}>Lot Sheet</h2>
        <SearchField
          className={styles.search}
          label="Find bus"
          labelHidden
          placeholder="Find bus"
          inputMode="numeric"
          value={query}
          onChange={setQuery}
        />
        {found && (
          <span className={styles.findResult}>
            <MapPin aria-hidden="true" />
            Row 8 {"\u00b7"} #38
          </span>
        )}
        <div className={styles.toolbarActions}>
          <StaticChip tone="success">95 usable</StaticChip>
          <Button variant="primary">
            <ClipboardList aria-hidden="true" />
            Fill rows
          </Button>
          <ActionMenu
            label={
              <>
                <MoreHorizontal aria-hidden="true" />
                More
              </>
            }
            items={[
              { id: "flags", label: "Edit flags", icon: <Flag /> },
              { id: "shop", label: "Shop", icon: <Wrench /> },
              { id: "print", label: "Print blank", icon: <Printer /> },
              {
                id: "clear",
                label: "Clear lots",
                icon: <Trash2 />,
                tone: "danger",
              },
            ]}
            onAction={fn()}
          />
        </div>
      </div>
    </div>
  );
}

function PhoneLongDialogFixture() {
  const [open, setOpen] = useState(true);

  return (
    <div className={styles.canvas}>
      {!open && (
        <Button variant="primary" onPress={() => setOpen(true)}>
          Reopen locations
        </Button>
      )}
      <ResponsiveDialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Move bus 6427"
        description="Choose a location. The list scrolls while Done stays reachable."
        footer={(close) => (
          <Button variant="primary" onPress={close}>
            Done
          </Button>
        )}
      >
        <div className={styles.list}>
          {Array.from({ length: 34 }, (_, index) => (
            <Pressable className={styles.row} key={index}>
              <MapPin aria-hidden="true" />
              <span className={styles.rowCopy}>
                <strong>East lot position {index + 1}</strong>
                <span>
                  {index % 5 === 0
                    ? "Long maintenance note remains contained in the scrolling body"
                    : "Available"}
                </span>
              </span>
            </Pressable>
          ))}
        </div>
      </ResponsiveDialog>
    </div>
  );
}

function BulkFlagFixture() {
  return (
    <div className={styles.canvas}>
      <Panel
        title="Split"
        description="3 buses carry this flag"
        actions={
          <Button variant="danger">
            <Trash2 aria-hidden="true" />
            Remove from all
          </Button>
        }
      >
        <div className={styles.list}>
          {["6427", "6451", "6514"].map((bus) => (
            <div className={styles.row} key={bus}>
              <span className={styles.rowCopy}>
                <strong>Bus {bus}</strong>
                <span>North lot {"\u00b7"} active maintenance item</span>
              </span>
              <Chip tone="warning" isSelected>
                Split
              </Chip>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function HistoryFixture({
  state,
}: {
  state: "empty" | "loading" | "populated";
}) {
  return (
    <div className={styles.canvas}>
      <Panel
        title="Revision history"
        description="Live operational changes"
        actions={
          <Button size="sm">
            <RotateCcw aria-hidden="true" />
            Refresh
          </Button>
        }
      >
        {state === "empty" && (
          <div className={styles.row}>No revisions recorded yet.</div>
        )}
        {state === "loading" && (
          <div className={styles.list} aria-label="Loading revisions">
            {Array.from({ length: 4 }, (_, index) => (
              <div className={styles.row} key={index}>
                Loading revision {index + 1}
              </div>
            ))}
          </div>
        )}
        {state === "populated" && (
          <div className={styles.list}>
            {[
              ["Bus 6427 moved to East lot", "4:18 AM"],
              ["Inspection added to bus 2772", "4:16 AM"],
              ["Split removed from 3 buses", "4:12 AM"],
            ].map(([label, time], index) => (
              <div className={styles.row} key={label}>
                <StatusBadge tone={index === 1 ? "warning" : "info"}>
                  {index === 1 ? "Flag" : "Sheet"}
                </StatusBadge>
                <span className={styles.rowCopy}>
                  <strong>{label}</strong>
                  <span>{time} {"\u00b7"} live update</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function WorkOrderControlsFixture() {
  return (
    <div className={styles.canvas}>
      <section className={styles.paper}>
        <header className={styles.paperHead}>
          <h2>Oracle eAM Work Order</h2>
          <StaticChip tone="accent">Screen controls</StaticChip>
        </header>
        <div className={styles.paperActions}>
          <Button variant="primary">Add operation</Button>
          <Button>Assign employee</Button>
          <Button variant="danger">Remove line</Button>
        </div>
        <div className={styles.paperLine} />
        <div className={styles.paperLine} />
      </section>
    </div>
  );
}

export const LotToolbarInlineLookup: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("searchbox"), "6427");
    await expect(canvas.getByText(/Row 8/)).toBeVisible();
  },
};

export const PhoneDialogWithLongLocations: Story = {
  render: () => <PhoneLongDialogFixture />,
  parameters: {
    viewport: { defaultViewport: "phoneSmall" },
  },
  globals: {
    safeArea: "phone",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await waitFor(async () => {
      await expect(canvas.getByRole("button", { name: "Done" })).toBeVisible();
    });
    await expect(
      canvas.getByRole("button", { name: /East lot position 34/ }),
    ).toBeInTheDocument();
  },
};

export const BulkFlagRemoval: Story = {
  render: () => <BulkFlagFixture />,
};

export const RevisionHistoryPopulated: Story = {
  render: () => <HistoryFixture state="populated" />,
};

export const RevisionHistoryEmpty: Story = {
  render: () => <HistoryFixture state="empty" />,
};

export const RevisionHistoryLoading: Story = {
  render: () => <HistoryFixture state="loading" />,
};

export const WorkOrderScreenControls: Story = {
  render: () => <WorkOrderControlsFixture />,
};
