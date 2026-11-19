import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Pause,
  Play,
  RefreshCw,
  Sliders,
  Volume2,
} from "lucide-react";
import {
  formatSecondsDisplay,
  formatSecondsToSrtTime,
} from "../../utils/srtParser";

export default function SubtitleStatusTable({
  activeJob,
  copiedSentenceIndex,
  currentMasterItem,
  handleCopySentenceAudio,
  handlePlayItemAudio,
  handlePlayMasterFromSentence,
  masterPlaying,
  playingItemIndex,
  subtitles,
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-950 rounded-none overflow-hidden">
      <div className="h-8 px-3 shrink-0 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 rounded-none text-xs">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-white uppercase tracking-wider text-[11px]">
            Bảng Phân Tích Phụ Đề & Trạng Thái Từng Câu
          </h3>
          <span className="px-1.5 py-0.2 rounded-none text-[10px] font-medium bg-amber-400/10 text-amber-400 border border-amber-400/20">
            Timeline Table
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-300 font-mono bg-slate-950 px-2 py-0.5 border border-slate-800 rounded-none text-[11px]">
            Tổng:{" "}
            <strong className="text-amber-400">
              {activeJob?.items ? activeJob.items.length : subtitles.length}
            </strong>{" "}
            câu
          </span>
        </div>
      </div>

      {/* Subtitles Table with Scroll View */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin rounded-none bg-slate-950">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 z-20 bg-slate-950 shadow-md">
            <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] font-mono">
              <th className="py-2.5 px-3 w-12 text-center">#</th>
              <th className="py-2.5 px-3 w-36">Timeline</th>
              <th className="py-2.5 px-3 min-w-[200px]">
                Lời thoại (Tiếng Việt)
              </th>
              <th className="py-2.5 px-3 w-20 text-right">Mục tiêu</th>
              <th className="py-2.5 px-3 w-20 text-right">TTS gốc</th>
              <th className="py-2.5 px-3 w-20 text-center">Tốc độ</th>
              <th className="py-2.5 px-3 w-20 text-right">Độ dài cuối</th>
              <th className="py-2.5 px-3 w-28 text-center">Trạng thái</th>
              <th className="py-2.5 px-3 w-24 text-center">Nghe thử</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {(activeJob?.items || subtitles).map((item) => {
              const isCurrentActiveSentence =
                activeJob?.masterAudio &&
                currentMasterItem?.item?.index === item.index &&
                !currentMasterItem.isSilenceGap;
              return (
                <tr
                  key={item.index}
                  id={`subtitle-row-${item.index}`}
                  className={`transition-colors ${
                    isCurrentActiveSentence
                      ? "bg-amber-500/20 border-l-4 border-l-amber-400 font-semibold ring-1 ring-amber-500/40 shadow-inner"
                      : item.warning
                        ? "bg-amber-500/5 hover:bg-slate-800/40"
                        : item.status === "failed"
                          ? "bg-rose-500/5 hover:bg-slate-800/40"
                          : "hover:bg-slate-800/30"
                  }`}
                >
                  {/* Index */}
                  <td className="py-2.5 px-3 text-center font-mono">
                    {isCurrentActiveSentence ? (
                      <span className="inline-flex items-center justify-center gap-1 text-amber-400 font-bold">
                        <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                        <span>{item.index}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400">{item.index}</span>
                    )}
                  </td>

                  {/* Timeline */}
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                    <div>{formatSecondsToSrtTime(item.startTime)}</div>
                    <div className="text-slate-400 text-[10px]">
                      ➔ {formatSecondsToSrtTime(item.endTime)}
                    </div>
                  </td>

                  {/* Text & Warning */}
                  <td className="py-2.5 px-3">
                    <p className="text-slate-200 font-medium leading-relaxed">
                      {item.text}
                    </p>
                    {item.warning && (
                      <p className="text-[10px] text-amber-400/90 mt-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>{item.warning}</span>
                      </p>
                    )}
                    {item.error && (
                      <p className="text-[10px] text-rose-400 mt-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>{item.error}</span>
                      </p>
                    )}
                  </td>

                  {/* Target Duration */}
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {item.targetDuration.toFixed(2)}s
                  </td>

                  {/* Original Duration */}
                  <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                    {item.originalDuration
                      ? `${item.originalDuration.toFixed(2)}s`
                      : "—"}
                  </td>

                  {/* Applied Speed */}
                  <td className="py-2.5 px-3 text-center font-mono">
                    {item.appliedSpeed ? (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          item.appliedSpeed > 1.05
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : item.appliedSpeed < 0.98
                              ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                              : "bg-slate-800 text-slate-300"
                        }`}
                        title={
                          item.appliedSpeed < 0.98
                            ? `Giảm tốc ${item.appliedSpeed.toFixed(2)}x để khớp thời lượng phụ đề dài hơn`
                            : item.appliedSpeed > 1.05
                              ? `Tăng tốc ${item.appliedSpeed.toFixed(2)}x để kịp thời lượng phụ đề`
                              : "Tốc độ gốc (1.00x)"
                        }
                      >
                        {item.appliedSpeed.toFixed(2)}x
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>

                  {/* Final Duration */}
                  <td className="py-2.5 px-3 text-right font-mono text-slate-200 font-semibold">
                    {item.finalDuration
                      ? `${item.finalDuration.toFixed(2)}s`
                      : "—"}
                  </td>

                  {/* Status Badge */}
                  <td className="py-2.5 px-3 text-center">
                    {item.status === "completed" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Hoàn thành</span>
                      </span>
                    )}
                    {item.status === "generating" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Đang tạo...</span>
                      </span>
                    )}
                    {item.status === "adjusting" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400">
                        <Sliders className="w-3 h-3" />
                        <span>Chỉnh tốc độ</span>
                      </span>
                    )}
                    {item.status === "failed" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Thất bại</span>
                      </span>
                    )}
                    {item.status === "pending" && (
                      <span className="text-[11px] text-slate-400">
                        Chờ xử lý
                      </span>
                    )}
                  </td>

                  {/* Audio Preview (Single Item & Master Timeline Jump) */}
                  <td className="py-2.5 px-3 text-center">
                    {activeJob && item.status === "completed" ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePlayItemAudio(item)}
                          className={`inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            playingItemIndex === item.index
                              ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30 scale-105 ring-2 ring-amber-400/50"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 hover:border-amber-500/40"
                          }`}
                          title={
                            playingItemIndex === item.index
                              ? "Dừng phát câu lẻ"
                              : "Nghe thử câu thoại lẻ này"
                          }
                        >
                          {playingItemIndex === item.index ? (
                            <>
                              <Pause className="w-3.5 h-3.5 fill-current text-slate-950" />
                              <span>Dừng</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 fill-current text-amber-400 ml-0.5" />
                              <span>Nghe</span>
                            </>
                          )}
                        </button>

                        {activeJob.masterAudio && (
                          <button
                            type="button"
                            onClick={() => handlePlayMasterFromSentence(item)}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              isCurrentActiveSentence && masterPlaying
                                ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md scale-105"
                                : "bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 border-slate-700"
                            }`}
                            title={`Tua Master Audio tới câu ${item.index} (${formatSecondsDisplay(item.startTime)}) và phát`}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopySentenceAudio(item)}
                          className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                          title={`Sao chép audio câu ${item.index} vào clipboard`}
                        >
                          {copiedSentenceIndex === item.index ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-600 font-mono text-[11px]">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
