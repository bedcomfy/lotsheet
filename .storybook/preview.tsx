import type { Decorator, Preview } from "@storybook/nextjs-vite";
import "../app/ui/styles/tokens.css";
import "../app/ui/styles/storybook.css";

const UiEnvironmentDecorator: Decorator = (Story, context) => {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.uiTheme = context.globals.theme;
    document.documentElement.dataset.uiSafeArea = context.globals.safeArea;
  }

  return (
    <div
      className={
        context.parameters.layout === "fullscreen"
          ? "ui-story-canvas ui-story-canvas--fullscreen"
          : "ui-story-canvas"
      }
      data-ui-theme={context.globals.theme}
      data-ui-safe-area={context.globals.safeArea}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Pace interface theme",
      defaultValue: "light",
      toolbar: {
        icon: "paintbrush",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
    safeArea: {
      description: "Simulated mobile safe area",
      defaultValue: "none",
      toolbar: {
        icon: "mobile",
        items: [
          { value: "none", title: "No safe area" },
          { value: "phone", title: "Modern phone" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [UiEnvironmentDecorator],
  parameters: {
    layout: "fullscreen",
    options: {
      storySort: {
        order: ["Foundation", "Components", "Patterns", "Sheets"],
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: "error",
    },
    viewport: {
      options: {
        phoneSmall: {
          name: "Phone 390 x 844",
          styles: { width: "390px", height: "844px" },
        },
        phoneLarge: {
          name: "Phone 430 x 932",
          styles: { width: "430px", height: "932px" },
        },
        tablet: {
          name: "Tablet 768 x 1024",
          styles: { width: "768px", height: "1024px" },
        },
        desktop: {
          name: "Desktop 1440 x 900",
          styles: { width: "1440px", height: "900px" },
        },
      },
    },
  },
};

export default preview;
