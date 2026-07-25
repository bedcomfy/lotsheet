import type { Meta, StoryObj } from "@storybook/react";
import { PaperPage, PaperViewport } from "../sheets/core";
import { LEGAL_PORTRAIT, LETTER_PORTRAIT } from "../sheets/core/profiles";
import { SHEET_DEFINITIONS } from "../sheets/registry";
import type { PaperProfile } from "../sheets/core/types";
import styles from "./PaperLab.module.css";

function FixturePaper({
  profile,
  title,
  rows = 12,
}: {
  profile: PaperProfile;
  title: string;
  rows?: number;
}) {
  return (
    <PaperPage profile={profile} sheetId="paper-lab" pageNumber={1} className={styles.paper}>
      <header className={styles.header}>
        <h1>{title}</h1>
        <span className={styles.meta}>{profile.widthIn} x {profile.heightIn} in</span>
      </header>
      <table className={styles.table}>
        <thead>
          <tr>
            <th style={{ width: "18%" }}>Bus</th>
            <th style={{ width: "22%" }}>Location</th>
            <th>Maintenance note</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, index) => (
            <tr key={index}>
              <td>{6401 + index}</td>
              <td>{index % 3 === 0 ? "North Lot" : index % 3 === 1 ? "Bay" : "Grid"}</td>
              <td>{index === rows - 1 ? "Maximum realistic content remains inside the printable safe area." : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <span className={styles.footer}>Page 1 of 1</span>
    </PaperPage>
  );
}

function PaperLab() {
  return (
    <main className={styles.lab}>
      <div className={styles.stack}>
        <FixturePaper profile={LETTER_PORTRAIT} title="US Letter fixture" />
      </div>
    </main>
  );
}

const meta = {
  title: "Sheets/Paper Lab",
  component: PaperLab,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PaperLab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LetterTypical: Story = {};

export const LetterStress: Story = {
  render: () => (
    <main className={styles.lab}>
      <div className={styles.stack}>
        <FixturePaper profile={LETTER_PORTRAIT} title="US Letter stress fixture" rows={24} />
      </div>
    </main>
  ),
};

export const LegalTypical: Story = {
  render: () => (
    <main className={styles.lab}>
      <div className={styles.stack}>
        <FixturePaper profile={LEGAL_PORTRAIT} title="US Legal fixture" rows={30} />
      </div>
    </main>
  ),
};

export const PhoneFit: Story = {
  globals: { safeArea: "phone" },
  render: () => (
    <div className={styles.phoneFrame}>
      <PaperViewport profile={LEGAL_PORTRAIT} mobileViewer label="Legal paper mobile viewer">
        <FixturePaper profile={LEGAL_PORTRAIT} title="Turnover profile" rows={30} />
      </PaperViewport>
    </div>
  ),
};

export const Registry: Story = {
  render: () => (
    <main className={styles.lab}>
      <table className={styles.registry}>
        <thead>
          <tr>
            <th>Sheet</th>
            <th>Route</th>
            <th>Paper</th>
            <th>Expected pages</th>
            <th>Render version</th>
          </tr>
        </thead>
        <tbody>
          {SHEET_DEFINITIONS.map((definition) => (
            <tr key={definition.id}>
              <td>{definition.title}</td>
              <td>{definition.path}</td>
              <td>{definition.paper.label}</td>
              <td>{definition.expectedPages.min}-{definition.expectedPages.max}</td>
              <td>{definition.renderVersion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  ),
};
