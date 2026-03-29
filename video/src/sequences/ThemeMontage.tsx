import { AbsoluteFill, useCurrentFrame, interpolate, Img, staticFile } from "remotion";
import { COLORS, fullScreen, featureLabel } from "../styles";

const THEMES = [
  { file: "theme-dark.png", name: "Dark", accent: "#2a6df0" },
  { file: "theme-midnight-blue.png", name: "Midnight Blue", accent: "#4a9eff" },
  { file: "theme-dracula.png", name: "Dracula", accent: "#bd93f9" },
  { file: "theme-nord.png", name: "Nord", accent: "#88c0d0" },
  { file: "theme-solarized.png", name: "Solarized Dark", accent: "#268bd2" },
  { file: "theme-gruvbox.png", name: "Gruvbox Dark", accent: "#fabd2f" },
  { file: "theme-tokyo-night.png", name: "Tokyo Night", accent: "#7aa2f7" },
  { file: "theme-one-dark.png", name: "One Dark", accent: "#61afef" },
  { file: "theme-catppuccin.png", name: "Catppuccin Mocha", accent: "#cba6f7" },
  { file: "theme-rose-pine.png", name: "Rose Pine", accent: "#c4a7e7" },
  { file: "theme-kanagawa.png", name: "Kanagawa", accent: "#7e9cd8" },
  { file: "theme-everforest.png", name: "Everforest", accent: "#a7c080" },
  { file: "theme-synthwave.png", name: "Synthwave 84", accent: "#f97e72" },
  { file: "theme-ayu.png", name: "Ayu Dark", accent: "#ffb454" },
  { file: "theme-horizon.png", name: "Horizon", accent: "#e95678" },
  { file: "theme-moonlight.png", name: "Moonlight", accent: "#82aaff" },
];

export const ThemeMontage: React.FC = () => {
  const frame = useCurrentFrame();
  const clipDuration = 18; // ~0.6s per theme

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
