import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CircleAlert,
  Download,
  Loader2,
  Palette,
  RotateCcw,
  X,
} from 'lucide-react';
import { useImagePreview } from './useImagePreview';

interface AddBgModalProps {
  isOpen: boolean;
  filePath: string;
  onSave: (filePath: string, bg: string, padding: number, corners: number, shadow: number) => void;
  onClose: () => void;
}

const DEFAULT_BG = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
const DEFAULT_COLORS = ['#667eea', '#764ba2', '#0f172a'];
const PRESETS = [
  DEFAULT_BG,
  'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
  'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
  'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  '#0F172A',
  '#FFFFFF',
];

function customBackground(colors: string[], gradient: boolean, third: boolean): string {
  if (!gradient) return colors[0];
  if (third) {
    return `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%)`;
  }
  return `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`;
}

export const AddBgModal: React.FC<AddBgModalProps> = ({
  isOpen,
  filePath,
  onSave,
  onClose,
}) => {
  const [padding, setPadding] = useState(32);
  const [corners, setCorners] = useState(16);
  const [shadow, setShadow] = useState(24);
  const [selectedBg, setSelectedBg] = useState(DEFAULT_BG);
  const [customColors, setCustomColors] = useState<string[]>(DEFAULT_COLORS);
  const [gradient, setGradient] = useState(true);
  const [thirdColor, setThirdColor] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const { preview, loading, error } = useImagePreview(filePath, isOpen, reloadToken);

  if (!isOpen) return null;

  const imageWidth = preview?.width ?? 0;
  const imageHeight = preview?.height ?? 0;
  const outputWidth = imageWidth + padding * 2;
  const outputHeight = imageHeight + padding * 2;
  const previewScale =
    imageWidth > 0
      ? Math.min(480 / Math.max(outputWidth, 1), 230 / Math.max(outputHeight, 1))
      : 1;
  const canvasWidth = outputWidth * previewScale;
  const canvasHeight = outputHeight * previewScale;
  const imageDisplayWidth = imageWidth * previewScale;
  const imageDisplayHeight = imageHeight * previewScale;
  const paddingDisplay = padding * previewScale;
  const cornerDisplay =
    Math.min(corners * previewScale, Math.min(imageDisplayWidth, imageDisplayHeight) / 2);
  const shadowDisplay = shadow * previewScale;

  const selectPreset = (bg: string) => {
    const colors = bg.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
    const isGradient = bg.startsWith('linear-gradient') && colors.length >= 2;
    setSelectedBg(bg);
    setGradient(isGradient);
    setThirdColor(isGradient && colors.length >= 3);
    setCustomColors((previous) => {
      const next = [...previous];
      colors.slice(0, 3).forEach((color, index) => {
        next[index] = color;
      });
      return next;
    });
  };

  const updateColor = (index: number, value: string) => {
    const next = customColors.map((color, colorIndex) =>
      colorIndex === index ? value : color
    );
    setCustomColors(next);
    setSelectedBg(customBackground(next, gradient, thirdColor));
  };

  const toggleGradient = () => {
    const next = !gradient;
    setGradient(next);
    setSelectedBg(customBackground(customColors, next, thirdColor));
  };

  const toggleThirdColor = () => {
    const next = !thirdColor;
    setThirdColor(next);
    setSelectedBg(customBackground(customColors, gradient, next));
  };

  const reset = () => {
    setPadding(32);
    setCorners(16);
    setShadow(24);
    setSelectedBg(DEFAULT_BG);
    setCustomColors(DEFAULT_COLORS);
    setGradient(true);
    setThirdColor(false);
  };

  return (
    <AnimatePresence>
      <div
        data-aether-interactive
        className="aether-interactive fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="glass-panel flex max-h-[calc(100vh-32px)] w-[560px] max-w-[calc(100vw-32px)] flex-col gap-3 overflow-y-auto rounded-2xl border border-[var(--aether-line)] p-5 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--aether-line-soft)] pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <Palette
                size={18}
                className="shrink-0 text-[var(--aether-accent-text)]"
              />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[var(--aether-text-1)]">
                  Add Background &amp; Polish
                </h3>
                <p
                  title={filePath}
                  className="truncate text-[9px] text-[var(--aether-text-4)]"
                >
                  {filePath}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="relative flex h-[270px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--aether-line)] bg-[var(--aether-surface-3)]">
            {loading ? (
              <div className="flex items-center gap-2 text-[11px] text-[var(--aether-text-2)]">
                <Loader2 size={14} className="animate-spin" />
                Loading image…
              </div>
            ) : error ? (
              <div className="flex max-w-[320px] flex-col items-center gap-2 text-center">
                <CircleAlert size={16} className="text-[var(--aether-danger)]" />
                <p className="text-[10px] leading-snug text-[var(--aether-text-2)]">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => setReloadToken((value) => value + 1)}
                  className="rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2.5 py-1 text-[10px] text-[var(--aether-text-1)] transition hover:border-[var(--aether-line-strong)]"
                >
                  Try again
                </button>
              </div>
            ) : preview ? (
              <div
                className="relative overflow-hidden"
                style={{
                  width: canvasWidth,
                  height: canvasHeight,
                  background: selectedBg,
                  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.45)',
                }}
              >
                <img
                  src={preview.dataUrl}
                  alt=""
                  draggable={false}
                  className="absolute select-none object-fill"
                  style={{
                    left: paddingDisplay,
                    top: paddingDisplay,
                    width: imageDisplayWidth,
                    height: imageDisplayHeight,
                    borderRadius: cornerDisplay,
                    boxShadow:
                      shadowDisplay > 0
                        ? `0 ${shadowDisplay / 2}px ${shadowDisplay}px rgba(0,0,0,0.45)`
                        : undefined,
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 text-[10px] text-[var(--aether-text-3)]">
            <span>
              {preview
                ? `Image ${imageWidth} × ${imageHeight} px`
                : 'Image size unavailable'}
            </span>
            <span className="font-mono text-[var(--aether-text-2)]">
              {preview ? `Output ${outputWidth} × ${outputHeight} px` : ''}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-[var(--aether-text-2)]">
              Background Preset
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((bg) => (
                <button
                  key={bg}
                  type="button"
                  aria-label="Use background preset"
                  title={bg}
                  onClick={() => selectPreset(bg)}
                  style={{ background: bg }}
                  className={`h-7 w-7 rounded-full border-2 transition ${
                    selectedBg === bg
                      ? 'scale-110 border-[var(--aether-text-1)] shadow-lg'
                      : 'border-[var(--aether-line-strong)] hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-[var(--aether-text-2)]">
                Custom colors
              </span>
              <button
                type="button"
                aria-pressed={gradient}
                onClick={toggleGradient}
                className={`rounded-md px-2 py-0.5 text-[9px] font-medium transition ${
                  gradient
                    ? 'accent-fill'
                    : 'border border-[var(--aether-line)] text-[var(--aether-text-2)] hover:bg-[var(--aether-fill-2)]'
                }`}
              >
                Gradient
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {customColors.map((color, index) => {
                const disabled =
                  !gradient || (index === 2 && !thirdColor);
                return (
                  <label
                    key={index}
                    className={`flex items-center gap-1.5 text-[9px] text-[var(--aether-text-3)] ${
                      disabled ? 'opacity-40' : ''
                    }`}
                  >
                    <span
                      className="relative h-6 w-6 overflow-hidden rounded-full border border-[var(--aether-line-strong)]"
                      style={{ background: color }}
                    >
                      <input
                        type="color"
                        value={color}
                        disabled={disabled}
                        onChange={(event) => updateColor(index, event.target.value)}
                        aria-label={`Custom color ${index + 1}`}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
                      />
                    </span>
                    <span>Color {index + 1}</span>
                  </label>
                );
              })}
              <label className="ml-auto flex items-center gap-1 text-[9px] text-[var(--aether-text-3)]">
                <input
                  type="checkbox"
                  checked={thirdColor}
                  disabled={!gradient}
                  onChange={toggleThirdColor}
                  className="h-3 w-3 accent-[var(--aether-accent)]"
                />
                3rd color
              </label>
            </div>
            <p className="text-[9px] leading-snug text-[var(--aether-text-4)]">
              Pick one color for a solid fill, or two to three colors for a gradient.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--aether-text-2)]">Padding</span>
              <span className="font-mono text-[var(--aether-text-2)]">{padding}px</span>
            </div>
            <input
              type="range"
              min="8"
              max="64"
              value={padding}
              onChange={(event) => setPadding(Number(event.target.value))}
              style={{ accentColor: 'var(--aether-accent)' }}
              className="w-full cursor-pointer"
            />

            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--aether-text-2)]">Corners</span>
              <span className="font-mono text-[var(--aether-text-2)]">{corners}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="32"
              value={corners}
              onChange={(event) => setCorners(Number(event.target.value))}
              style={{ accentColor: 'var(--aether-accent)' }}
              className="w-full cursor-pointer"
            />

            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--aether-text-2)]">Drop Shadow</span>
              <span className="font-mono text-[var(--aether-text-2)]">{shadow}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              value={shadow}
              onChange={(event) => setShadow(Number(event.target.value))}
              style={{ accentColor: 'var(--aether-accent)' }}
              className="w-full cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between border-t border-[var(--aether-line-soft)] pt-2">
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(filePath, selectedBg, padding, corners, shadow);
                onClose();
              }}
              className="accent-fill flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold shadow-lg transition hover:opacity-90"
            >
              <Download size={14} />
              <span>Save with Background</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
