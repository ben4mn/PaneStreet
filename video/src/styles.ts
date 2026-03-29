import { CSSProperties } from "react";

export const COLORS = {
  bg: "#0e1a2b",
  bgLight: "#162640",
  accent: "#fddb32",
  accentFg: "#0e1a2b",
  text: "#d4dce8",
  textMuted: "#5e7491",
  white: "#f0f4f8",
};

export const fullScreen: CSSProperties = {
  width: 1920,
  height: 1080,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: COLORS.bg,
  fontFamily: '"SF Pro Display", "Inter", -apple-system, sans-serif',
  color: COLORS.text,
  overflow: "hidden",
};

export const heading: CSSProperties = {
  fontSize: 64,
  fontWeight: 700,
  color: COLORS.white,
  letterSpacing: "-1px",
};

export const subheading: CSSProperties = {
  fontSize: 28,
  fontWeight: 400,
  color: COLORS.textMuted,
  marginTop: 12,
};

export const badge: CSSProperties = {
  display: "inline-block",
  padding: "8px 20px",
  background: COLORS.accent,
  color: COLORS.accentFg,
  borderRadius: 8,
  fontSize: 20,
  fontWeight: 600,
};

export const screenshotStyle: CSSProperties = {
  borderRadius: 12,
  boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
  maxWidth: "85%",
  maxHeight: "80%",
  objectFit: "contain" as const,
};

export const featureLabel: CSSProperties = {
  position: "absolute" as const,
  bottom: 60,
  left: 0,
  right: 0,
  textAlign: "center" as const,
  fontSize: 36,
  fontWeight: 600,
  color: COLORS.white,
  textShadow: "0 2px 20px rgba(0,0,0,0.8)",
};
