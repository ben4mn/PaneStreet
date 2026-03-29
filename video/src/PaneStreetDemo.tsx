import { Series } from "remotion";
import { TitleCard } from "./sequences/TitleCard";
import { ScreenshotClip } from "./sequences/ScreenshotClip";
import { ThemeMontage } from "./sequences/ThemeMontage";
import { ClosingCard } from "./sequences/ClosingCard";

export const PaneStreetDemo: React.FC = () => {
  return (
    <Series>
      {/* 1. Title card (3s) */}
      <Series.Sequence durationInFrames={90}>
        <TitleCard />
      </Series.Sequence>

      {/* 2. Hero — multi-terminal 4-pane grid (4s) */}
      <Series.Sequence durationInFrames={120}>
        <ScreenshotClip
          src="hero.png"
          label="Multi-Terminal Grid Layout"
          sublabel="Run multiple sessions side by side"
        />
      </Series.Sequence>

      {/* 3. Freeform 2-pane layout (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <ScreenshotClip
          src="freeform.png"
          label="Freeform Window Management"
          sublabel="Drag, resize, and snap panes freely"
        />
      </Series.Sequence>

      {/* 4. File viewer with rendered markdown (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <ScreenshotClip
          src="file-content.png"
          label="Built-in File Viewer"
          sublabel="Browse files with syntax highlighting and markdown rendering"
        />
      </Series.Sequence>

      {/* 5. Notifications panel (3s) */}
      <Series.Sequence durationInFrames={90}>
        <ScreenshotClip
          src="notifications.png"
          label="Smart Notifications"
          sublabel="Alerts when terminals need attention"
          zoomIn={false}
        />
      </Series.Sequence>

      {/* 6. Scheduled panel — Claude sessions (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <ScreenshotClip
          src="scheduled.png"
          label="Claude Session Monitor"
          sublabel="View active Claude Code sessions and scheduled tasks"
        />
      </Series.Sequence>

      {/* 7. 3-pane layout with mascot active (3s) */}
      <Series.Sequence durationInFrames={90}>
        <ScreenshotClip
          src="three-pane.png"
          label="Interactive Robot Companion"
          sublabel="Reacts to your terminal activity in real time"
        />
      </Series.Sequence>

      {/* 8. Plugins panel (2.5s) */}
      <Series.Sequence durationInFrames={75}>
        <ScreenshotClip
          src="plugins.png"
          label="Claude Plugins"
          sublabel="Manage your installed Claude Code plugins"
          zoomIn={false}
        />
      </Series.Sequence>

      {/* 9. Memory / CLAUDE.md viewer (3s) */}
      <Series.Sequence durationInFrames={90}>
        <ScreenshotClip
          src="memory.png"
          label="Project Memory"
          sublabel="View and edit CLAUDE.md and project memories"
        />
      </Series.Sequence>

      {/* 10. Keyboard shortcuts (3s) */}
      <Series.Sequence durationInFrames={90}>
        <ScreenshotClip
          src="settings-keys.png"
          label="Customizable Shortcuts"
          sublabel="Click any shortcut to rebind it"
          zoomIn={false}
        />
      </Series.Sequence>

      {/* 11. Rapid-fire theme montage — all 16 themes (10s) */}
      <Series.Sequence durationInFrames={300}>
        <ThemeMontage />
      </Series.Sequence>

      {/* 12. Closing card (4s) */}
      <Series.Sequence durationInFrames={120}>
        <ClosingCard />
      </Series.Sequence>
    </Series>
  );
};
