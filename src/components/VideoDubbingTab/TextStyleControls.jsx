import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export default function TextStyleControls({
  value,
  onChange,
  fontOptions,
  disabled = false,
  minFontSize = 8,
  maxFontSize = 160,
}) {
  const buttonClass = (active) =>
    `min-w-8 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-violet-400 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`;
  const numberClass =
    "w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-xs text-white";
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const fontPickerRef = useRef(null);
  useEffect(() => {
    if (!fontPickerOpen) return;
    const closeOnOutsideClick = (event) => {
      if (
        event.target instanceof Node &&
        !fontPickerRef.current?.contains(event.target)
      ) {
        setFontPickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [fontPickerOpen]);
  return (
    <div className="space-y-3 rounded-lg text-xs text-slate-200">
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Font</span>
        <div ref={fontPickerRef} className="relative min-w-0">
          <button
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={fontPickerOpen}
            aria-label={`Font: ${value.fontFamily}`}
            onClick={() => setFontPickerOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setFontPickerOpen(false);
            }}
            className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-left text-xs text-white disabled:opacity-50"
          >
            <span
              className="min-w-0 truncate"
              style={{ fontFamily: value.fontFamily }}
            >
              {value.fontFamily}
            </span>
            <span
              className="shrink-0 text-sm"
              style={{ fontFamily: value.fontFamily }}
            >
              {value.fontFamily} - Xin Chào
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${fontPickerOpen ? "rotate-180" : ""}`}
            />
          </button>
          {fontPickerOpen && !disabled && (
            <div
              role="listbox"
              aria-label="Chọn font chữ"
              className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900 p-1 shadow-xl"
            >
              {fontOptions.map((font) => (
                <button
                  key={font}
                  type="button"
                  role="option"
                  aria-selected={value.fontFamily === font}
                  onClick={() => {
                    onChange({ fontFamily: font });
                    setFontPickerOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-700 ${
                    value.fontFamily === font
                      ? "bg-violet-500/15 text-violet-100"
                      : "text-slate-200"
                  }`}
                >
                  <span className="min-w-0 truncate">{font}</span>
                  <span
                    className="shrink-0 text-sm"
                    style={{ fontFamily: font }}
                  >
                    {font} - Xin Chào
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)_64px] items-center gap-3">
        <span>Font size</span>
        <input
          type="range"
          min={minFontSize}
          max={maxFontSize}
          value={value.fontSize}
          disabled={disabled}
          onChange={(event) =>
            onChange({ fontSize: Number(event.target.value) })
          }
          className="w-full accent-violet-400"
          aria-label="Cỡ chữ"
        />
        <input
          type="number"
          min={minFontSize}
          max={maxFontSize}
          value={value.fontSize}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              fontSize: Math.max(
                minFontSize,
                Math.min(
                  maxFontSize,
                  Number(event.target.value) || minFontSize,
                ),
              ),
            })
          }
          className={numberClass}
          aria-label="Cỡ chữ"
        />
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Pattern</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={value.bold}
            onClick={() => onChange({ bold: !value.bold })}
            className={`${buttonClass(value.bold)} font-black`}
          >
            B
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={value.underline}
            onClick={() => onChange({ underline: !value.underline })}
            className={`${buttonClass(value.underline)} underline`}
          >
            U
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={value.italic}
            onClick={() => onChange({ italic: !value.italic })}
            className={`${buttonClass(value.italic)} italic`}
          >
            I
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Case</span>
        <div className="flex flex-wrap gap-1.5">
          {[
            ["none", "Aa"],
            ["uppercase", "TT"],
            ["lowercase", "tt"],
            ["capitalize", "Tt"],
          ].map(([textCase, label]) => (
            <button
              key={textCase}
              type="button"
              disabled={disabled}
              aria-pressed={value.textCase === textCase}
              onClick={() => onChange({ textCase })}
              className={buttonClass(value.textCase === textCase)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Color</span>
        <input
          type="color"
          value={value.color}
          disabled={disabled}
          onChange={(event) => onChange({ color: event.target.value })}
          className="h-8 w-20 cursor-pointer rounded-md border border-slate-700 bg-slate-950 p-1"
        />
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Outline</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="checkbox"
            checked={value.outlineEnabled}
            disabled={disabled}
            onChange={(event) =>
              onChange({ outlineEnabled: event.target.checked })
            }
            className="accent-violet-400"
            aria-label="Bật outline"
          />
          <input
            type="color"
            value={value.outlineColor}
            disabled={disabled || !value.outlineEnabled}
            onChange={(event) => onChange({ outlineColor: event.target.value })}
            className="h-8 w-16 cursor-pointer rounded-md border border-slate-700 bg-slate-950 p-1"
            aria-label="Màu outline"
          />
          <input
            type="number"
            min={0}
            max={8}
            step={0.5}
            value={value.outlineWidthPx}
            disabled={disabled || !value.outlineEnabled}
            onChange={(event) =>
              onChange({
                outlineWidthPx: Math.max(
                  0,
                  Math.min(8, Number(event.target.value) || 0),
                ),
              })
            }
            className={numberClass}
            aria-label="Độ dày outline"
          />
          <span className="text-[10px] text-slate-400">px</span>
        </div>
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Character</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={40}
            step={1}
            value={value.characterSpacingPx}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                characterSpacingPx: Math.max(
                  0,
                  Math.min(40, Number(event.target.value) || 0),
                ),
              })
            }
            className={numberClass}
            aria-label="Giãn ký tự"
          />
          <span className="text-[10px] text-slate-400">px</span>
        </div>
      </div>
      <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3">
        <span>Line</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={80}
            step={1}
            value={value.lineSpacingPx}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                lineSpacingPx: Math.max(
                  0,
                  Math.min(80, Number(event.target.value) || 0),
                ),
              })
            }
            className={numberClass}
            aria-label="Giãn dòng"
          />
          <span className="text-[10px] text-slate-400">px</span>
        </div>
      </div>
    </div>
  );
}
