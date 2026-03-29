import { AbsoluteFill, useCurrentFrame, interpolate, Img, staticFile } from "remotion";
import { COLORS, fullScreen, featureLabel } from "../styles";

const THEMES = [
  { file: "hero.png", name: "Dark (Default)", accent: "#2a6df0" },
  { file: "freeform.png", name: "Midnight Blue", accent: "#4a9eff" },
  { file: "hero.png", name: "Dracula", accent: "#bd93f9" },
  { file: "freeform.png", name: "Nord", accent: "#88c0d0" },
  { file: "hero.png", name: "Solarized Dark", accent: "#268bd2" },
  { file: "freeform.png", name: "Gruvbox Dark", accent: "#fabd2f" },
  { file: "hero.png", name: "Tokyo Night", accent: "#7aa2f7" },
  { file: "freeform.png", name: "One Dark", accent: "#61afef" },
  { file: "hero.png", name: "Catppuccin Mocha", accent: "#cba6f7" },
  { file: "freeform.png", name: "Rose Pine", accent: "#c4a7e7" },
  { file: "hero.png", name: "Kanagawa", accent: "#7e9cd8" },
  { file: "freeform.png", name: "Synthwave 84", accent: "#f97e72" },
  { file: "hero.png", name: "Everforest", accent: "#a7c080" },
  { file: "freeform.png", name: "Ayu Dark", accent: "#ffb454" },
  { file: "hero.png", name: "Horizon", accent: "#e95678" },
  { file: "freeform.png", name: "Moonlight", accent: "#82aaff" },
];

export const ThemeMontage: React.FC = () => {
  const frame = useCurrentFrame();
  const clipDuration = 18; // frames per theme (~0.6s each — rapid fire)

  const themeIndex = Math.min(Math.floor(frame / clipDuration), THEMES.length - 1);
  const localFrame = frame - themeIndex * clipDuration;

  const opacity = interpolate(localFrame, [0, 4, clipDuration - 4, clipDuration], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });

  const scale = interpolate(localFrame, [0, clipDuration], [1.03, 1.0], { extrapolateRight: "clamp" });

  const theme = THEMES[themeIndex];

  return (
    <AbsoluteFill style={{ ...fullScreen, flexDirection: "column" }}>
      <div style={{
        position: "absolute", inset: 0,
        background: COLORS.bg,
      }} />

      {/* Theme counter */}
      <div style={{
        position: "absolute", top: 40, right: 60, zIndex: 10,
        fontSize: 18, color: COLORS.textMuted,
        fontFamily: '"SF Mono", "Fira Code", monospace',
      }}>
        {themeIndex + 1} / {THEMES.length}
      </div>

      <div style={{
        position: "relative", zIndex: 1, flex: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity,
        transform: `scale(${scale})`,
      }}>
        <Img
          src={staticFile(`screenshots/${theme.file}`)}
          style={{
            borderRadius: 12,
            boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 0 2px ${theme.accent}55`,
            maxWidth: "85%",
            maxHeight: "78%",
            objectFit: "contain" as const,
          }}
        />
      </div>

      <div style={{
        ...featureLabel,
        fontSize: 32,
      }}>
        {theme.name}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: theme.accent, margin: "10px auto 0",
          boxShadow: `0 0 12px ${theme.accent}66`,
        }} />
      </div>
    </AbsoluteFill>
  );
};
