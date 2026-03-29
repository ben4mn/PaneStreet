import { Series } from "remotion";
import { TitleCard } from "./sequences/TitleCard";
import { ScreenshotClip } from "./sequences/ScreenshotClip";
import { CroppedClip } from "./sequences/CroppedClip";
import { ThemeMontage } from "./sequences/ThemeMontage";
import { ClosingCard } from "./sequences/ClosingCard";

export const PaneStreetDemo: React.FC = () => {
  return (
    <Series>
      {/* 1. Title card (3s) */}
      <Series.Sequence durationInFrames={90}>
        <TitleCard />
      </Series.Sequence>

      {/* 2. Hero — multi-terminal grid (4s) */}
      <Series.Sequence durationInFrames={120}>
        <ScreenshotClip
          src="hero.png"
          label="Multi-Terminal Grid Layout"
          sublabel="Run multiple sessions side by side"
        />
      </Series.Sequence>

      {/* 3. Freeform layout (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <ScreenshotClip
          src="freeform.png"
          label="Freeform Window Management"
          sublabel="Drag, resize, and snap panes freely"
        />
      </Series.Sequence>

      {/* 4. File viewer — start full, zoom to file tree (4s) */}
      <Series.Sequence durationInFrames={120}>
        <CroppedClip
          src="file-viewer.png"
          label="Built-in File Viewer"
          sublabel="Browse files with syntax highlighting and git diff indicators"
          crop={[60, 5, 38, 90]}
        />
      </Series.Sequence>

      {/* 5. Notifications — zoom into notification area (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <CroppedClip
          src="notifications.png"
          label="Smart Notifications"
          sublabel="Alerts when terminals need attention"
          crop={[55, 5, 42, 60]}
        />
      </Series.Sequence>

      {/* 6. Git branch timeline — zoom into footer (4s) */}
      <Series.Sequence durationInFrames={120}>
        <CroppedClip
          src="git-footer.png"
          label="Git Branch Timeline"
          sublabel="Expandable branch graph with commit history"
          crop={[5, 70, 90, 28]}
        />
      </Series.Sequence>

      {/* 7. Scheduled tasks panel (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <CroppedClip
          src="scheduled.png"
          label="Claude Session Monitor"
          sublabel="View active Claude Code sessions and scheduled tasks"
          crop={[6, 5, 55, 55]}
        />
      </Series.Sequence>

      {/* 8. Rapid-fire theme montage — all 16 themes (10s) */}
      <Series.Sequence durationInFrames={300}>
        <ThemeMontage />
      </Series.Sequence>

      {/* 9. Settings / customization (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <ScreenshotClip
          src="settings-theme.png"
          label="Deep Customization"
          sublabel="16+ themes, rebindable shortcuts, and more"
        />
      </Series.Sequence>

      {/* 10. Mascot — zoom to robot area (3.5s) */}
      <Series.Sequence durationInFrames={105}>
        <CroppedClip
          src="mascot.png"
          label="Interactive Robot Companion"
          sublabel="Reacts to your terminal activity in real time"
          crop={[30, 65, 40, 32]}
        />
      </Series.Sequence>

      {/* 11. Closing card (4s) */}
      <Series.Sequence durationInFrames={120}>
        <ClosingCard />
      </Series.Sequence>
    </Series>
  );
};
