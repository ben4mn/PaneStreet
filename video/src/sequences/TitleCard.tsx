import { AbsoluteFill, useCurrentFrame, interpolate, Img, staticFile } from "remotion";
import { COLORS, fullScreen } from "../styles";

export const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();

  const logoScale = interpolate(frame, [0, 20], [0.5, 1], { extrapolateRight: "clamp" });
  const logoOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [10, 30], [30, 0], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(frame, [10, 25], [0, 1], { extrapolateRight: "clamp" });
  const taglineOpacity = interpolate(frame, [25, 40], [0, 1], { extrapolateRight: "clamp" });
  const taglineY = interpolate(frame, [25, 40], [20, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ ...fullScreen, flexDirection: "column", gap: 20 }}>
      {/* Subtle gradient bg */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 40%, ${COLORS.bgLight} 0%, ${COLORS.bg} 70%)`,
      }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ opacity: logoOpacity, transform: `scale(${logoScale})`, marginBottom: 24 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: COLORS.accent, display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 40, fontWeight: 700, color: COLORS.accentFg,
          }}>
            PS
          </div>
        </div>

        <div style={{
          fontSize: 72, fontWeight: 700, color: COLORS.white,
          letterSpacing: "-2px",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}>
          PaneStreet
        </div>

        <div style={{
          fontSize: 26, color: COLORS.textMuted, marginTop: 16,
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
        }}>
          A modern terminal multiplexer for Claude Code
        </div>
      </div>
    </AbsoluteFill>
  );
};
