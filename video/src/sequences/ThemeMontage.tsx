import { AbsoluteFill, useCurrentFrame, interpolate, Img, staticFile } from "remotion";
import { COLORS, fullScreen, featureLabel } from "../styles";

const THEMES = [
  { file: "hero.png", name: "Multi-Terminal Grid", accent: "#fddb32" },
  { file: "freeform.png", name: "Freeform Layout", accent: "#fddb32" },
  { file: "file-viewer.png", name: "Built-in File Viewer", accent: "#fddb32" },
  { file: "mascot.png", name: "Robot Companion", accent: "#fddb32" },
];

export const ThemeMontage: React.FC = () => {
  const frame = useCurrentFrame();
  const FPS = 30;
  const clipDuration = 37; // frames per theme (~1.2s each)

  const themeIndex = Math.min(Math.floor(frame / clipDuration), THEMES.length - 1);
  const localFrame = frame - themeIndex * clipDuration;

  const opacity = interpolate(localFrame, [0, 6, clipDuration - 6, clipDuration], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });

  const scale = interpolate(localFrame, [0, clipDuration], [1.02, 1.0], { extrapolateRight: "clamp" });

  const theme = THEMES[themeIndex];

  return (
    <AbsoluteFill style={{ ...fullScreen, flexDirection: "column" }}>
      <div style={{
        position: "absolute", inset: 0,
        background: COLORS.bg,
      }} />

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
            boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 0 2px ${theme.accent}33`,
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
        }} />
      </div>
    </AbsoluteFill>
  );
};
