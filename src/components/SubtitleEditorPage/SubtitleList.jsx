import { Captions, Plus, Subtitles } from "lucide-react";
import { Button, Paper, Typography } from "@mui/material";
export default function SubtitleList({
  selectedItem,
  subtitleListRef,
  subtitleCueElementsRef,
  activeCue,
  selectCue,
  updateCue,
  addSubtitleCue,
  translationInProgress,
  onRawClick,
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        width: {
          xs: "100%",
          lg: "50%",
        },
        minWidth: 340,
        maxWidth: 760,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        // bgcolor: "#020617", // slate-950
      }}
    >
      {/* <div className="w-[48%] lg:w-[50%] min-w-[340px] max-w-[760px] h-full flex flex-col overflow-hidden bg-slate-950"> */}
      {/* Header */}
      <div className="h-8 px-2.5 shrink-0 flex items-center justify-between border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center gap-1.5 min-w-0">
          <Typography
            sx={{
              textTransform: "uppercase",
              fontWeight: 600,
              fontSize: 12,
              color: "text.secondary",
            }}
          >
            {" "}
            Danh sách phụ đề
          </Typography>
          {/* <span className="text-[10px] font-bold text-white uppercase tracking-wide truncate">
           
          </span> */}
          {selectedItem && (
            <span className="border border-slate-700 px-1 text-[9px] font-mono text-cyan-300">
              {selectedItem.cues.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            onClick={() => onRawClick(true)}
            disabled={!selectedItem}
            variant="outlined"
            size="small"
            startIcon={<Subtitles className="h-2.5 w-2.5 text-violet-300" />}
          >
            Raw
          </Button>
          <Button
            onClick={addSubtitleCue}
            disabled={!selectedItem?.video}
            variant="outlined"
            color="secondary"
            size="small"
            startIcon={<Plus className="h-2.5 w-2.5 text-violet-300" />}
          >
            {/* <Subtitles className="h-2.5 w-2.5 text-violet-300" /> */}
            Thêm
          </Button>
          {/* <button
            type="button"
            onClick={addSubtitleCue}
            disabled={!selectedItem?.video}
            title="Thêm câu tại vị trí hiện tại"
            className="border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 cursor-pointer flex items-center gap-0.5"
          >
            <Plus className="h-2.5 w-2.5" />
            Thêm
          </button> */}
        </div>
      </div>

      {selectedItem?.cues.length ? (
        <div
          ref={subtitleListRef}
          className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
        >
          <div className="min-w-full">
            {/* Header */}
            <div className="sticky top-0 z-10 grid grid-cols-[60px_140px_1fr_1fr] border-b border-slate-700 bg-slate-950 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              <div className="p-2">#</div>
              <div className="p-2">Thời lượng</div>
              <div className="p-2">Phụ đề gốc</div>
              <div className="p-2 text-violet-300">Bản dịch</div>
            </div>

            {selectedItem.cues.map((cue, index) => (
              <div
                key={`${selectedItem.id}-${index}`}
                ref={(element) => {
                  if (element) {
                    subtitleCueElementsRef.current.set(index, element);
                  } else {
                    subtitleCueElementsRef.current.delete(index);
                  }
                }}
                className={`
                            grid
                            grid-cols-[50px_80px_1fr_1fr]
                            divide-x
                            divide-slate-800
                            border-b
                            border-slate-800/80
                            transition-colors
                            ${
                              activeCue === cue
                                ? "bg-violet-500/8"
                                : "hover:bg-slate-900/40"
                            }
                          `}
              >
                {/* STT */}
                <div className="px-2 flex items-start justify-center">
                  <button
                    type="button"
                    onClick={() => selectCue(index)}
                    className="font-mono text-[12px] text-cyan-300 hover:text-cyan-100 cursor-pointer"
                  >
                    #{index + 1}
                  </button>
                </div>

                {/* Thời lượng */}
                <div className="px-2">
                  <button
                    type="button"
                    onClick={() => selectCue(index)}
                    className="flex flex-row gap-1 w-full"
                  >
                    <div className="text-[12px] text-slate-500">
                      {(cue.endTime - cue.startTime).toFixed(2)}s
                    </div>
                  </button>
                </div>

                {/* Phụ đề gốc */}
                <div>
                  <textarea
                    aria-label={`Nội dung gốc câu ${index + 1}`}
                    value={cue.text}
                    disabled={translationInProgress}
                    onChange={(event) =>
                      updateCue(selectedItem.id, index, {
                        text: event.target.value,
                      })
                    }
                    rows={Math.min(3, Math.max(1, cue.text.split("\n").length))}
                    className="
                                w-full
                                resize-y
                                border
                                border-slate-700/80
                                bg-slate-950/70
                                text-[10px]
                                font-normal
                                leading-relaxed
                                text-slate-100
                                outline-none
                                focus:border-cyan-500/60
                                disabled:opacity-60
                                pt-1
                                px-1
                              "
                  />
                </div>

                {/* Bản dịch */}
                <div>
                  <textarea
                    aria-label={`Bản dịch câu ${index + 1}`}
                    value={cue.translatedText}
                    disabled={translationInProgress}
                    onChange={(event) =>
                      updateCue(selectedItem.id, index, {
                        translatedText: event.target.value,
                      })
                    }
                    rows={Math.min(
                      3,
                      Math.max(1, cue.translatedText.split("\n").length),
                    )}
                    placeholder="Nhập hoặc sửa…"
                    className="
                                w-full
                                resize-y
                                border
                                border-violet-500/20
                                bg-violet-950/10
                                text-[10px]
                                font-normal
                                leading-relaxed
                                text-violet-100
                                outline-none
                                placeholder:text-slate-600
                                focus:border-violet-400/60
                                disabled:opacity-60
                                pt-1
                                px-1
                              "
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <Captions className="mx-auto h-7 w-7 text-slate-700" />
            <p className="mt-2 text-[10px] text-slate-500">
              {selectedItem
                ? selectedItem.status === "missing-subtitle"
                  ? "Video chưa có phụ đề SRT"
                  : "Chưa có phụ đề"
                : "Chưa chọn video"}
            </p>
          </div>
        </div>
      )}
      {/* </div> */}
    </Paper>
  );
}
