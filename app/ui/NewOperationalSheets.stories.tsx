import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PaperViewport } from "../sheets/core";
import { LETTER_PORTRAIT } from "../sheets/core/profiles";
import { BusErrorsPaper } from "../sheets/bus-errors/BusErrorsPaper";
import { busErrorsFixtures } from "../sheets/bus-errors/fixtures";
import { InteriorCleaningPaper } from "../sheets/interior-cleaning/InteriorCleaningPaper";
import { interiorCleaningFixtures } from "../sheets/interior-cleaning/fixtures";
import { HybridWeeklyPaper } from "../sheets/hybrid-weekly/HybridWeeklyPaper";
import {
  HYBRID_WEEKLY_SAMPLE_BUSES,
  hybridWeeklyFixtures,
} from "../sheets/hybrid-weekly/fixtures";
import { MeterReadingsPaper } from "../sheets/meter-readings/MeterReadingsPaper";
import { meterReadingsFixtures } from "../sheets/meter-readings/fixtures";
import styles from "./NewOperationalSheets.stories.module.css";

type FixtureName = "blank" | "typical" | "stress";

function SheetGallery({ fixture = "typical" }: { fixture?: FixtureName }) {
  return (
    <main className={styles.canvas}>
      <div className={styles.gallery}>
        <InteriorCleaningPaper data={interiorCleaningFixtures[fixture]} />
        <MeterReadingsPaper data={meterReadingsFixtures[fixture]} />
        <BusErrorsPaper data={busErrorsFixtures[fixture]} />
        <HybridWeeklyPaper
          data={hybridWeeklyFixtures[fixture]}
          busNumbers={HYBRID_WEEKLY_SAMPLE_BUSES}
        />
      </div>
    </main>
  );
}

const meta = {
  title: "Sheets/New Operational Forms",
  component: SheetGallery,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SheetGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Blank: Story = {
  args: { fixture: "blank" },
};

export const Typical: Story = {
  args: { fixture: "typical" },
};

export const Stress: Story = {
  args: { fixture: "stress" },
};

export const PhoneFit: Story = {
  globals: { safeArea: "phone" },
  render: () => (
    <main className={styles.canvas}>
      <div className={styles.phone}>
        <div className={styles.phoneGallery}>
          <PaperViewport
            profile={LETTER_PORTRAIT}
            mobileViewer
            label="Interior Cleaning phone preview"
          >
            <InteriorCleaningPaper data={interiorCleaningFixtures.typical} />
          </PaperViewport>
          <PaperViewport
            profile={LETTER_PORTRAIT}
            mobileViewer
            label="Fuel Meter Readings phone preview"
          >
            <MeterReadingsPaper data={meterReadingsFixtures.typical} />
          </PaperViewport>
          <PaperViewport
            profile={LETTER_PORTRAIT}
            mobileViewer
            label="Bus Errors phone preview"
          >
            <BusErrorsPaper data={busErrorsFixtures.typical} />
          </PaperViewport>
          <PaperViewport
            profile={LETTER_PORTRAIT}
            mobileViewer
            label="Hybrid Weekly Service Log phone preview"
          >
            <HybridWeeklyPaper
              data={hybridWeeklyFixtures.typical}
              busNumbers={HYBRID_WEEKLY_SAMPLE_BUSES}
            />
          </PaperViewport>
        </div>
      </div>
    </main>
  ),
};
