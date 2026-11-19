import { formatDuration, formatFileSize, formatFrameRate } from "./helpers";

export default function MetadataGrid({ metadata }) {
  const details = [
    ["Thời lượng", formatDuration(metadata.durationSeconds)],
    ["Độ phân giải", `${metadata.width} × ${metadata.height}`],
    ["Frame rate", formatFrameRate(metadata.frameRate)],
    ["Video codec", metadata.videoCodec.toUpperCase()],
    ["Audio codec", metadata.audioCodec?.toUpperCase() || "Không có audio"],
    [
      "Audio",
      metadata.audioCodec
        ? `${metadata.audioSampleRate ? `${metadata.audioSampleRate} Hz` : "?"} · ${metadata.audioChannels ? `${metadata.audioChannels} kênh` : "?"}`
        : "Không có audio stream",
    ],
    ["Container", metadata.container],
    ["Dung lượng", formatFileSize(metadata.sizeBytes)],
  ];
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
      {details.map(([label, value]) => (
        <div
          key={label}
          className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5"
        >
          <dt className="text-xs text-slate-400">{label}</dt>
          <dd className="text-xs font-semibold text-slate-100 text-right break-all">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
