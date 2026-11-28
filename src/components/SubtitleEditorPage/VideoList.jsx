import { Paper, Stack } from "@mui/material";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileVideo2,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import React from "react";

export default function VideoList({
  readyVideoCount,
  items,
  selectedItem,
  selectedId,
  setSelectedId,
  setActiveCueIndex,
  statusColor,
  statusLabel,
  removeItem,
  translationInProgress,
  downloadSrt,
  fileInputRef,
}) {
  return (
    <Stack sx={{ height: "100%", overflow: "hidden", padding: 1 }}>
      <div className="px-2 py-1 flex items-center justify-between border-b border-slate-800">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">
          Hàng đợi
        </span>
        <span className="font-mono text-[9px] text-slate-500">
          {readyVideoCount}/{items.filter((item) => item.video).length} có SRT
        </span>
      </div>
      <Paper
        sx={(theme) => {
          return {
            background: theme.palette.background.default,
            height: "100%",
            overflowY: "auto",
          };
        }}
      >
        {items.length ? (
          items.map((item) => (
            <div
              key={item.id}
              title={item.error || undefined}
              className={`flex items-center gap-1.5 px-2 ${selectedId === item.id ? "bg-violet-500/10" : "hover:bg-slate-900/60"}`}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedId(item.id);
                  setActiveCueIndex(-1);
                }}
                aria-pressed={selectedId === item.id}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left cursor-pointer"
              >
                <FileVideo2
                  className={`h-3.5 w-3.5 shrink-0 ${selectedId === item.id ? "text-violet-300" : "text-slate-500"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-medium text-slate-200">
                    {item.video?.name || item.subtitleFile?.name}
                  </span>
                  <span
                    className={`mt-0.5 block text-[9px] font-mono ${statusColor(item.status)}`}
                  >
                    {item.status === "translating" ? (
                      <>
                        <LoaderCircle className="mr-1 inline h-2.5 w-2.5 animate-spin" />
                        {statusLabel(item.status)}
                      </>
                    ) : item.status === "translated" ? (
                      <>
                        <CheckCircle2 className="mr-1 inline h-2.5 w-2.5" />
                        {statusLabel(item.status)}
                      </>
                    ) : item.status === "error" ? (
                      <>
                        <AlertCircle className="mr-1 inline h-2.5 w-2.5" />
                        {item.error}
                      </>
                    ) : (
                      statusLabel(item.status)
                    )}
                    {item.cues.length ? ` · ${item.cues.length}` : ""}
                  </span>
                </span>
              </button>
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  disabled={translationInProgress}
                  title="Xóa khỏi danh sách"
                  aria-label={`Xóa ${item.video?.name || item.subtitleFile?.name}`}
                  className="p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-300 disabled:opacity-30 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="flex flex-row items-center">
                  <div className="flex flex-row items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-300">
                    <Download className="h-2 w-2" />
                    <span className="truncate text-[10px] font-medium text-slate-200">
                      SRT
                    </span>
                  </div>

                  <div className="border border-slate-700/50 rounded-md flex flex-row items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        selectedItem && downloadSrt(selectedItem, false)
                      }
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                    >
                      Gốc
                    </button>
                    <button
                      type="button"
                      disabled={
                        !item.cues.every((cue) => cue.translatedText.trim())
                      }
                      onClick={() => downloadSrt(item, true)}
                      className="inline-flex items-center gap-1  bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40 cursor-pointer"
                    >
                      Dịch
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 px-4 py-6 text-[10px] text-slate-500 hover:text-violet-200 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            Thêm video và tệp SRT
          </button>
        )}
      </Paper>
    </Stack>
  );
}
