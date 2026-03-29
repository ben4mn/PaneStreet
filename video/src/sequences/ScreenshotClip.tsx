import { AbsoluteFill, useCurrentFrame, interpolate, Img, staticFile } from "remotion";
import { COLORS, fullScreen, screenshotStyle, featureLabel } from "../styles";

interface Props {
  src: string;
  label: string;
  sublabel?: string;
  zoomIn?: boolean;
}

export const ScreenshotClip: React.FC<Props> = ({ src, label, sublabel, zoomIn = true }) => {
  const frame = useCurrentFrame();

  const imgOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const imgScale = zoomIn
    ? interpolate(frame, [0, 90], [1.05, 1.0], { extrapolateRight: "clamp" })
    : 1;
  const labelOpacity = interpolate(frame, [8, 20], [0, 1], { extrapolateRight: "clamp" });
  const labelY = interpolate(frame, [8, 20], [20, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ ...fullScreen, flexDirection: "column" }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 50%, ${COLORS.bgLight} 0%, ${COLORS.bg} 70%)`,
      }} />

      <div style={{
        position: "relative", zIndex: 1, flex: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: imgOpacity,
        transform: `scale(${imgScale})`,
      }}>
        <Img src={staticFile(`screenshots/${src}`)} style={screenshotStyle} />
      </div>

      <div style={{
        ...featureLabel,
        opacity: labelOpacity,
        transform: `translateY(${labelY}px)`,
      }}>
        {label}
        {sublabel && (
          <div style={{ fontSize: 20, color: COLORS.textMuted, marginTop: 6, fontWeight: 400 }}>
            {sublabel}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
