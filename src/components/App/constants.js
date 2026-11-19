import React from "react";

export const VoiceEffectsPage = React.lazy(() => import("../VoiceEffectsPage"));

export const DEFAULT_PRESETS = [
  {
    id: "preset-balanced",
    name: "Mặc định - Cân bằng (Khuyên dùng)",
    isDefault: true,
    voiceId: "local:hoaimy-vietnamese-vi-medium-ljkjhi",
    batchSizeChoice: "4",
    customBatchSize: 4,
    maxSpeed: 1.5,
    minSpeed: 0.8,
    speedPriority: "balanced",
    padSilence: true,
    trimStartMs: 0,
    trimEndMs: 0,
    outputFormat: "mp3",
    normalizeNumbers: true,
    soundOnComplete: true,
    soundOnlyUnfocused: true,
    customPronunciationRules: [],
  },
];
