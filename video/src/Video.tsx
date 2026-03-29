import { Composition } from "remotion";
import { PaneStreetDemo } from "./PaneStreetDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PaneStreetDemo"
        component={PaneStreetDemo}
        durationInFrames={1380}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
