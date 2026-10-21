import React from 'react';

interface MediaBarsProps {
  active: boolean;
  spotify?: boolean;
  compact?: boolean;
}

/**
 * Animated now-playing glyph. Source-aware: Spotify sessions use Spotify green;
 * other sources fall back to the active theme accent.
 */
export const MediaBars: React.FC<MediaBarsProps> = ({
  active,
  spotify = false,
  compact = false,
}) => {
  if (!active) return null;
  const color = spotify ? '#1DB954' : 'var(--aether-accent)';
  const heights = compact ? [8, 15, 10] : [11, 18, 14];
  const delays = ['0ms', '140ms', '70ms'];

  return (
    <span
      className="inline-flex items-end gap-[3px]"
      style={{ color, height: compact ? 16 : 20 }}
      aria-label="Media playing"
      role="img"
    >
      {heights.map((height, index) => (
        <span
          key={index}
          className="media-bar w-[2.5px] rounded-full bg-current"
          style={{
            height,
            animationDelay: delays[index],
            opacity: index === 0 ? 0.78 : 1,
          }}
        />
      ))}
      <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
    </span>
  );
};
