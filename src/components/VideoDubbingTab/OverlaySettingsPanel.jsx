import Tabs from "../customs/Tabs";
import CardScanTab from "./CardScanTab";
import LogoTitleTab from "./LogoTitleTab";
import SubtitleAudioSection from "./SubtitleAudioSection";
import SubtitleOverlayTab from "./SubtitleOverlayTab";
import { useVideoDubbing } from "./VideoDubbingContext";

export default function OverlaySettingsPanel() {
  return (
    <Tabs
      defaultTab="logotitle"
      tabs={[
        {
          id: "logotitle",
          label: "Logo & Title",
          content: <LogoTitleTab />,
        },
        {
          id: "text",
          label: "Text",
          content: <SubtitleOverlayTab />,
        },
        {
          id: "character-card",
          label: "Quét thẻ",
          content: <CardScanTab />,
        },
        {
          id: "subtitle-audio",
          label: "Phụ đề",
          content: <SubtitleAudioSection />,
        },
      ]}
    />
  );
}
