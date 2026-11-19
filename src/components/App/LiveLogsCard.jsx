import { Download, Maximize2, Minimize2, Terminal, Trash2 } from "lucide-react";

export default function LiveLogsCard({
  activeJob,
  completedSentencesCount,
  completionPercent,
  displayLogs,
  isLogsExpanded,
  logFilter,
  logsContainerRef,
  setActiveJob,
  setIsLogsExpanded,
  setLogFilter,
  totalSentencesCount,
}) {
  return (
    <div className="shrink-0 border-t border-slate-800 bg-slate-950 rounded-none overflow-hidden font-mono text-xs">
      {/* Logs Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-3 py-1.5 bg-slate-900/80 border-b border-slate-800/80 rounded-none">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Terminal className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-white">Live Logs</span>
          {totalSentencesCount > 0 && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 shadow-sm">
              <span>Hoàn thành:</span>
              <strong className="text-amber-200">
                {completedSentencesCount}/{totalSentencesCount}
              </strong>
              <span>câu</span>
              <span className="text-[10px] text-amber-400/80">
                ({completionPercent}%)
              </span>
            </span>
          )}
          <span className="text-[11px] text-slate-400">
            ({displayLogs.length} sự kiện)
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter tabs (Only visible when expanded) */}
          {isLogsExpanded && (
            <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[11px]">
              {["ALL", "INFO", "SUCCESS", "WARNING", "ERROR"].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLogFilter(lvl)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    logFilter === lvl
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          )}

          {/* Actions when expanded */}
          {isLogsExpanded && activeJob && (
            <a
              href={`/api/subtitles/job/${activeJob.id}/logs/download`}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 text-[11px] transition-colors"
              title="Xuất nhật ký thành file TXT"
            >
              <Download className="w-3 h-3 text-amber-400" />
              <span>Tải Logs (.txt)</span>
            </a>
          )}

          {isLogsExpanded && (
            <button
              type="button"
              onClick={() => {
                if (activeJob) setActiveJob({ ...activeJob, logs: [] });
              }}
              className="p-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-800 cursor-pointer"
              title="Xóa nhật ký trên màn hình"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}

          {/* Expand / Close Toggle Button (Requirement 3) */}
          <button
            type="button"
            onClick={() => setIsLogsExpanded(!isLogsExpanded)}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold rounded-lg border border-slate-700 text-xs transition-colors cursor-pointer"
            title={
              isLogsExpanded
                ? "Đóng / Thu gọn Live Logs"
                : "Mở rộng khung Live Logs"
            }
          >
            {isLogsExpanded ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Thu Gọn Logs</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Mở Rộng Logs</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsed Preview Strip (When Closed) */}
      {!isLogsExpanded ? (
        <div className="px-4 py-2 bg-slate-950/90 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-900">
          <div className="flex items-center gap-2 truncate">
            <span className="text-amber-400 font-semibold">
              [Logs đang đóng]
            </span>
            {displayLogs.length > 0 ? (
              <span className="truncate text-slate-300">
                Mới nhất: {displayLogs[displayLogs.length - 1].message}
              </span>
            ) : (
              <span>Chưa có log phát sinh.</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsLogsExpanded(true)}
            className="text-amber-400 hover:underline shrink-0 ml-2 font-medium cursor-pointer"
          >
            Mở để xem chi tiết →
          </button>
        </div>
      ) : (
        /* Expanded Logs Stream Window (Scrollable internally without moving viewport) */
        <div
          ref={logsContainerRef}
          className="h-60 overflow-y-auto space-y-1.5 p-4 select-text text-[11px] scrollbar-thin"
        >
          {displayLogs.length === 0 ? (
            <div className="text-slate-500 py-8 text-center italic">
              Chưa có nhật ký hoạt động. Nhấn "Bắt đầu xử lý" để theo dõi các sự
              kiện theo thời gian thực.
            </div>
          ) : (
            displayLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 leading-relaxed"
              >
                <span className="text-slate-500 shrink-0">
                  [{log.timestamp}]
                </span>
                <span
                  className={`px-1 py-0.2 rounded font-bold shrink-0 text-[10px] ${
                    log.level === "SUCCESS"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : log.level === "WARNING"
                        ? "bg-amber-500/20 text-amber-400"
                        : log.level === "ERROR"
                          ? "bg-rose-500/20 text-rose-400"
                          : "bg-sky-500/20 text-sky-400"
                  }`}
                >
                  [{log.level}]
                </span>
                <span
                  className={`${
                    log.level === "ERROR"
                      ? "text-rose-300 font-semibold"
                      : log.level === "WARNING"
                        ? "text-amber-200"
                        : log.level === "SUCCESS"
                          ? "text-emerald-200"
                          : "text-slate-300"
                  }`}
                >
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
