import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { COLORS, fullScreen } from "../styles";

export const ClosingCard: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, 15], [0.95, 1], { extrapolateRight: "clamp" });
  const btnOpacity = interpolate(frame, [20, 35], [0, 1], { extrapolateRight: "clamp" });
  const btnY = interpolate(frame, [20, 35], [15, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ ...fullScreen, flexDirection: "column", gap: 30 }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 40%, ${COLORS.bgLight} 0%, ${COLORS.bg} 70%)`,
      }} />

      <div style={{
        position: "relative", zIndex: 1,
        display: "flex", flexDirection: "column", alignItems: "center",
        opacity, transform: `scale(${scale})`,
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 18,
          background: COLORS.accent, display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 36, fontWeight: 700, color: COLORS.accentFg,
          marginBottom: 28,
        }}>
          PS
        </div>

        <div style={{
          fontSize: 56, fontWeight: 700, color: COLORS.white,
          letterSpacing: "-1px",
        }}>
          PaneStreet
        </div>

        <div style={{
          fontSize: 22, color: COLORS.textMuted, marginTop: 12,
        }}>
          Multi-session terminal multiplexer for Claude Code
        </div>
      </div>

      <div style={{
        position: "relative", zIndex: 1,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
        opacity: btnOpacity, transform: `translateY(${btnY}px)`,
      }}>
        <div style={{
          padding: "14px 40px",
          background: COLORS.accent,
          color: COLORS.accentFg,
          borderRadius: 10,
          fontSize: 22,
          fontWeight: 600,
        }}>
          Download Free on GitHub
        </div>

        <div style={{ fontSize: 18, color: COLORS.textMuted }}>
          github.com/ben4mn/PaneStreet
        </div>
      </div>
    </AbsoluteFill>
  );
};
