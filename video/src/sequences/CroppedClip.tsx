import { AbsoluteFill, useCurrentFrame, interpolate, Img, staticFile } from "remotion";
import { COLORS, fullScreen, featureLabel } from "../styles";

interface Props {
  src: string;
  label: string;
  sublabel?: string;
  /** Crop region as percentages of the image: [left, top, width, height] */
  crop: [number, number, number, number];
}

export const CroppedClip: React.FC<Props> = ({ src, label, sublabel, crop }) => {
  const frame = useCurrentFrame();

  // Start showing full image, then zoom into the crop region
  const progress = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });
  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const labelOpacity = interpolate(frame, [30, 45], [0, 1], { extrapolateRight: "clamp" });
  const labelY = interpolate(frame, [30, 45], [20, 0], { extrapolateRight: "clamp" });

  // Interpolate from full view to cropped view
  const [cx, cy, cw, ch] = crop;

  // Scale: start at 1 (full image visible), zoom to show crop region filling ~85% of frame
  const targetScale = 100 / cw; // e.g., crop is 40% width -> scale to 2.5x
  const scale = interpolate(progress, [0, 1], [1, Math.min(targetScale, 3)]);

  // Translate to center the crop region
  const translateX = interpolate(progress, [0, 1], [0, -(cx + cw / 2 - 50)]);
  const translateY = interpolate(progress, [0, 1], [0, -(cy + ch / 2 - 50)]);

  return (
    <AbsoluteFill style={{ ...fullScreen, flexDirection: "column" }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 50%, ${COLORS.bgLight} 0%, ${COLORS.bg} 70%)`,
      }} />

      <div style={{
        position: "relative", zIndex: 1, flex: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: fadeIn,
        overflow: "hidden",
      }}>
        <Img
          src={staticFile(`screenshots/${src}`)}
          style={{
            borderRadius: 12,
            boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
            maxWidth: "85%",
            maxHeight: "80%",
            objectFit: "contain" as const,
            transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
            transformOrigin: "center center",
          }}
        />
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
