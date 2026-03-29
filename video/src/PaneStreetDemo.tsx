import { Series } from "remotion";
import { TitleCard } from "./sequences/TitleCard";
import { ScreenshotClip } from "./sequences/ScreenshotClip";
import { ThemeMontage } from "./sequences/ThemeMontage";
import { ClosingCard } from "./sequences/ClosingCard";

export const PaneStreetDemo: React.FC = () => {
  return (
    <Series>
      {/* 1. Title card (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <TitleCard />
      </Series.Sequence>

      {/* 2. Hero — multi-terminal grid (5s) */}
      <Series.Sequence durationInFrames={150}>
        <ScreenshotClip
          src="hero.png"
          label="Multi-Terminal Grid Layout"
          sublabel="Run multiple sessions side by side"
        />
      </Series.Sequence>

      {/* 3. Freeform layout (4s) */}
      <Series.Sequence durationInFrames={120}>
        <ScreenshotClip
          src="freeform.png"
          label="Freeform Window Management"
          sublabel="Drag, resize, and snap panes freely"
        />
      </Series.Sequence>

      {/* 4. File viewer (4s) */}
      <Series.Sequence durationInFrames={120}>
        <ScreenshotClip
          src="file-viewer.png"
          label="Built-in File Viewer"
          sublabel="Browse and preview files alongside your terminals"
        />
      </Series.Sequence>

      {/* 5. Notifications (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <ScreenshotClip
          src="notifications.png"
          label="Smart Notifications"
          sublabel="Alerts when terminals need attention"
        />
      </Series.Sequence>

      {/* 6. Quick feature montage (5s) */}
      <Series.Sequence durationInFrames={150}>
        <ThemeMontage />
      </Series.Sequence>

      {/* 7. Settings (4s) */}
      <Series.Sequence durationInFrames={120}>
        <ScreenshotClip
          src="settings-theme.png"
          label="Deep Customization"
          sublabel="16+ themes, rebindable shortcuts, and more"
        />
      </Series.Sequence>

      {/* 8. Mascot (4s) */}
      <Series.Sequence durationInFrames={120}>
        <ScreenshotClip
          src="mascot.png"
          label="Interactive Robot Companion"
          sublabel="Reacts to your terminal activity in real time"
          zoomIn={false}
        />
      </Series.Sequence>

      {/* 9. Closing card (4.5s) */}
      <Series.Sequence durationInFrames={135}>
        <ClosingCard />
      </Series.Sequence>
    </Series>
  );
};
