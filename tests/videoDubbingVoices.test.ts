import assert from "node:assert/strict";
import { test } from "node:test";
import { AVAILABLE_MODELS } from "../voice-catalog";
import { getAvailableVideoDubbingVoices } from "../src/utils/videoDubbingVoices";

test("includes installed VieNeu Turbo voices and excludes unavailable voices", () => {
  const voices = [
    { ...AVAILABLE_MODELS.find((voice) => voice.id === "local:hoaimy-vietnamese-vi-medium-ljkjhi")!, engine: "piper" as const, hasLocalFile: true },
    { ...AVAILABLE_MODELS.find((voice) => voice.id === "vieneu:minh_quan_pro")!, hasLocalFile: true },
    { ...AVAILABLE_MODELS.find((voice) => voice.id === "vieneu:truc_ly")!, hasLocalFile: false },
    { id: "invalid", modelId: "", engine: "piper" as const, hasLocalFile: true },
  ];

  const available = getAvailableVideoDubbingVoices(voices);
  assert.deepEqual(
    available.map((voice) => voice.id),
    ["local:hoaimy-vietnamese-vi-medium-ljkjhi", "vieneu:minh_quan_pro"],
  );
});
