import { memo, useMemo, useState } from "react";
import {
  ArrowUpFromLine,
  Captions,
  Eraser,
  Filter,
  Merge,
  Plus,
  Search,
  Subtitles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { filterSubtitleAudioItems } from "../../utils/subtitleAudioFilters";

const SubtitleCueRow = memo(
  function SubtitleCueRow({
    cue,
    index,
    itemId,
    isActive,
    translationInProgress,
    bgDefault,
    subtitleCueElementsRef,
    selectCue,
    updateCue,
    mergeCueAbove,
    joinCueAbove,
    deleteCue,
  }) {
    return (
      <div
        ref={(element) => {
          if (element) {
            subtitleCueElementsRef.current.set(index, element);
          } else {
            subtitleCueElementsRef.current.delete(index);
          }
        }}
        className={`
          grid
          grid-cols-[50px_72px_1fr_1fr_84px]
          transition-colors
          ${isActive ? "bg-violet-500/8" : "hover:bg-slate-900/40"}
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
              updateCue(itemId, index, {
                text: event.target.value,
              })
            }
            rows={Math.min(3, Math.max(1, cue.text.split("\n").length))}
            style={{ background: bgDefault }}
            className="w-full resize-y text-[10px] font-normal leading-relaxed text-slate-100 outline-none focus:border-cyan-500/60 disabled:opacity-60 pt-1 px-1"
          />
        </div>

        {/* Bản dịch */}
        <div>
          <textarea
            value={cue.translatedText}
            disabled={translationInProgress}
            size="small"
            onChange={(event) =>
              updateCue(itemId, index, {
                translatedText: event.target.value,
              })
            }
            rows={Math.min(3, Math.max(1, cue.translatedText.split("\n").length))}
            placeholder="Nhập hoặc sửa…"
            style={{ background: bgDefault }}
            className="w-full resize-y text-[10px] font-normal leading-relaxed text-slate-100 outline-none focus:border-cyan-500/60 disabled:opacity-60 pt-1 px-1"
          />
        </div>

        {/* Action */}
        <div className="flex items-start justify-center gap-0.5 pt-0.5 px-1">
          <Tooltip title="Merge above (xóa câu lặp & kéo dài thời gian câu trên)">
            <span>
              <IconButton
                size="small"
                disabled={index === 0 || translationInProgress}
                onClick={() => mergeCueAbove?.(itemId, index)}
                sx={{ p: 0.5 }}
              >
                <ArrowUpFromLine size={13} />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Join above (ghép thành 1 câu dài với câu trên)">
            <span>
              <IconButton
                size="small"
                color="primary"
                disabled={index === 0 || translationInProgress}
                onClick={() => joinCueAbove?.(itemId, index)}
                sx={{ p: 0.5 }}
              >
                <Merge size={13} />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Xóa câu này">
            <span>
              <IconButton
                size="small"
                color="error"
                disabled={translationInProgress}
                onClick={() => deleteCue?.(itemId, index)}
                sx={{ p: 0.5 }}
              >
                <Trash2 size={13} />
              </IconButton>
            </span>
          </Tooltip>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.cue === next.cue &&
    prev.index === next.index &&
    prev.itemId === next.itemId &&
    prev.isActive === next.isActive &&
    prev.translationInProgress === next.translationInProgress &&
    prev.bgDefault === next.bgDefault,
);

function SubtitleList({
  selectedItem,
  subtitleListRef,
  subtitleCueElementsRef,
  activeCue,
  selectCue,
  updateCue,
  addSubtitleCue,
  mergeCueAbove,
  joinCueAbove,
  deleteCue,
  onRemoveNonLetterCues,
  onQuickMergeSimilar,
  translationInProgress,
  onRawClick,
}) {
  const theme = useTheme();
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [toolsAnchorEl, setToolsAnchorEl] = useState(null);
  const [filterTarget, setFilterTarget] = useState("original"); // "original" | "translated"
  const [searchText, setSearchText] = useState("");
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [shortFilterEnabled, setShortFilterEnabled] = useState(false);
  const [maxCharacterCount, setMaxCharacterCount] = useState(5);
  const [specialCharactersOnly, setSpecialCharactersOnly] = useState(false);
  const [nonAlphabetOnly, setNonAlphabetOnly] = useState(false);
  const [similarAdjacent, setSimilarAdjacent] = useState(false);

  const activeFilterCount =
    Number(Boolean(searchText.length > 0)) +
    Number(shortFilterEnabled) +
    Number(specialCharactersOnly) +
    Number(nonAlphabetOnly) +
    Number(similarAdjacent);

  const hasActiveFilter = activeFilterCount > 0;

  const resetFilters = () => {
    setSearchText("");
    setSearchCaseSensitive(false);
    setShortFilterEnabled(false);
    setMaxCharacterCount(5);
    setSpecialCharactersOnly(false);
    setNonAlphabetOnly(false);
    setSimilarAdjacent(false);
  };

  const filteredCues = useMemo(() => {
    const cues = selectedItem?.cues ?? [];
    if (!cues.length) return [];
    const items = cues.map((cue, index) => ({
      id: String(index),
      text:
        filterTarget === "translated"
          ? cue.translatedText || ""
          : cue.text || "",
      cue,
      originalIndex: index,
    }));
    if (!hasActiveFilter) return items;
    return filterSubtitleAudioItems(items, {
      ...(shortFilterEnabled
        ? { maxCharacterCount: Math.max(1, Number(maxCharacterCount) || 1) }
        : {}),
      specialCharactersOnly,
      nonAlphabetOnly,
      similarAdjacent,
      similarityThreshold: 0.8,
      searchText,
      searchCaseSensitive,
    });
  }, [
    selectedItem?.cues,
    filterTarget,
    hasActiveFilter,
    shortFilterEnabled,
    maxCharacterCount,
    specialCharactersOnly,
    nonAlphabetOnly,
    similarAdjacent,
    searchText,
    searchCaseSensitive,
  ]);
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
      }}
    >
      {/* Header */}
      <div className="h-8 px-2.5 shrink-0 flex items-center justify-between ">
        <div className="flex items-center gap-1.5 min-w-0">
          <Typography
            sx={{
              textTransform: "uppercase",
              fontWeight: 600,
              fontSize: 12,
              color: "text.secondary",
            }}
          >
            Danh sách phụ đề
          </Typography>
          {selectedItem && (
            <span className="border border-slate-700 px-1 text-[9px] font-mono text-cyan-300">
              {hasActiveFilter
                ? `${filteredCues.length}/${selectedItem.cues.length}`
                : selectedItem.cues.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            onClick={(e) => setToolsAnchorEl(e.currentTarget)}
            disabled={!selectedItem?.cues?.length || translationInProgress}
            variant="text"
            color="inherit"
            size="small"
            startIcon={<Wrench className="h-2.5 w-2.5 text-amber-300" />}
          >
            Tools
          </Button>
          <Button
            onClick={(e) => setFilterAnchorEl(e.currentTarget)}
            disabled={!selectedItem?.cues?.length}
            variant={hasActiveFilter ? "contained" : "text"}
            color={hasActiveFilter ? "primary" : "inherit"}
            size="small"
            startIcon={<Filter className="h-2.5 w-2.5" />}
          >
            Lọc{hasActiveFilter ? ` (${activeFilterCount})` : ""}
          </Button>
          <Button
            onClick={() => onRawClick(true)}
            disabled={!selectedItem}
            variant="text"
            size="small"
            startIcon={<Subtitles className="h-2.5 w-2.5 text-violet-300" />}
          >
            Raw
          </Button>
          <Button
            onClick={addSubtitleCue}
            disabled={!selectedItem?.video}
            variant="text"
            size="small"
            startIcon={<Plus className="h-2.5 w-2.5 text-violet-300" />}
          >
            Thêm
          </Button>
        </div>
      </div>

      <Menu
        anchorEl={toolsAnchorEl}
        open={Boolean(toolsAnchorEl)}
        onClose={() => setToolsAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem
          onClick={() => {
            setToolsAnchorEl(null);
            if (selectedItem) {
              onRemoveNonLetterCues?.(selectedItem.id);
            }
          }}
        >
          <ListItemIcon>
            <Eraser size={15} />
          </ListItemIcon>
          <ListItemText
            primary="Xóa câu không chứa chữ"
            secondary="Xóa câu chỉ có ký tự đặc biệt hoặc khoảng trắng"
          />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setToolsAnchorEl(null);
            if (selectedItem) {
              onQuickMergeSimilar?.(selectedItem.id);
            }
          }}
        >
          <ListItemIcon>
            <Merge size={15} />
          </ListItemIcon>
          <ListItemText
            primary="Gộp Nhanh"
            secondary="Gộp các câu liền kề giống nhau (>80%)"
          />
        </MenuItem>
      </Menu>

      <Popover
        open={Boolean(filterAnchorEl)}
        anchorEl={filterAnchorEl}
        onClose={() => setFilterAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ p: 2, width: 320 }}>
          <Stack spacing={1.5}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography variant="subtitle2" fontWeight={600}>
                Lọc danh sách phụ đề
              </Typography>
              {hasActiveFilter && (
                <Button size="small" color="warning" onClick={resetFilters}>
                  Xóa lọc
                </Button>
              )}
            </Stack>

            <ToggleButtonGroup
              size="small"
              exclusive
              fullWidth
              value={filterTarget}
              onChange={(_, val) => val && setFilterTarget(val)}
            >
              <ToggleButton value="original">Phụ đề gốc</ToggleButton>
              <ToggleButton value="translated">Bản dịch</ToggleButton>
            </ToggleButtonGroup>

            <TextField
              size="small"
              fullWidth
              placeholder="Tìm nội dung..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={14} />
                    </InputAdornment>
                  ),
                  endAdornment: searchText ? (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setSearchText("")}
                      >
                        <X size={14} />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
            />

            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={searchCaseSensitive}
                  onChange={(e) => setSearchCaseSensitive(e.target.checked)}
                />
              }
              label={<Typography variant="body2">Phân biệt hoa/thường</Typography>}
            />

            <Divider />

            <Stack direction="row" alignItems="center" spacing={1}>
              <FormControlLabel
                sx={{ flex: 1, mr: 0 }}
                control={
                  <Checkbox
                    size="small"
                    checked={shortFilterEnabled}
                    onChange={(e) => setShortFilterEnabled(e.target.checked)}
                  />
                }
                label={<Typography variant="body2">Câu ngắn ≤</Typography>}
              />
              <TextField
                size="small"
                type="number"
                value={maxCharacterCount}
                onChange={(e) => setMaxCharacterCount(Number(e.target.value))}
                disabled={!shortFilterEnabled}
                slotProps={{ htmlInput: { min: 1, max: 200 } }}
                sx={{ width: 76 }}
              />
              <Typography variant="caption" color="text.secondary">
                ký tự
              </Typography>
            </Stack>

            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={specialCharactersOnly}
                  onChange={(e) => setSpecialCharactersOnly(e.target.checked)}
                />
              }
              label={<Typography variant="body2">Chỉ ký tự đặc biệt</Typography>}
            />

            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={nonAlphabetOnly}
                  onChange={(e) => setNonAlphabetOnly(e.target.checked)}
                />
              }
              label={<Typography variant="body2">Có ký tự ngoài Latin (CJK...)</Typography>}
            />

            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={similarAdjacent}
                  onChange={(e) => setSimilarAdjacent(e.target.checked)}
                />
              }
              label={<Typography variant="body2">Câu liền kề giống nhau (&gt;80%)</Typography>}
            />
          </Stack>
        </Box>
      </Popover>
      <Divider />
      {filteredCues.length ? (
        <div
          ref={subtitleListRef}
          className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
        >
          <div className="min-w-full">
            {/* Header */}
            <div
              style={{ background: theme.palette.background.paper }}
              className="sticky top-0 z-10 grid grid-cols-[50px_72px_1fr_1fr_84px] border-b border-slate-700 text-[9px] font-semibold uppercase tracking-wide text-slate-400"
            >
              <div className="p-2">#</div>
              <div className="p-2">Thời lượng</div>
              <div className="p-2">Phụ đề gốc</div>
              <div className="p-2 text-violet-300">Bản dịch</div>
              <div className="p-2 text-center">Action</div>
            </div>

            {filteredCues.map(({ cue, originalIndex: index }) => (
              <SubtitleCueRow
                key={`${selectedItem.id}-${index}`}
                cue={cue}
                index={index}
                itemId={selectedItem.id}
                isActive={activeCue === cue}
                translationInProgress={translationInProgress}
                bgDefault={theme.palette.background.default}
                subtitleCueElementsRef={subtitleCueElementsRef}
                selectCue={selectCue}
                updateCue={updateCue}
                mergeCueAbove={mergeCueAbove}
                joinCueAbove={joinCueAbove}
                deleteCue={deleteCue}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <Captions className="mx-auto h-7 w-7 text-slate-700" />
            <p className="mt-2 text-[10px] text-slate-500">
              {selectedItem?.cues?.length && hasActiveFilter
                ? "Không có phụ đề nào khớp bộ lọc"
                : selectedItem
                  ? selectedItem.status === "missing-subtitle"
                    ? "Video chưa có phụ đề SRT"
                    : "Chưa có phụ đề"
                  : "Chưa chọn video"}
            </p>
            {selectedItem?.cues?.length && hasActiveFilter && (
              <Button size="small" sx={{ mt: 1 }} onClick={resetFilters}>
                Xóa bộ lọc
              </Button>
            )}
          </div>
        </div>
      )}
      {/* </div> */}
    </Paper>
  );
}

export default memo(
  SubtitleList,
  (prev, next) =>
    prev.selectedItem === next.selectedItem &&
    prev.activeCue === next.activeCue &&
    prev.translationInProgress === next.translationInProgress,
);
