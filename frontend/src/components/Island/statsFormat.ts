/** Formatting helpers for the Stats tab. */

import type { TimeFormat } from '../../types/ipc';
import { formatClockTime } from './timeFormat';

export function formatUptime(seconds?: number | null): string {
  if (seconds == null || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function bootTime(
  seconds?: number | null,
  timeFormat: TimeFormat = '12h'
): string {
  if (seconds == null) return '—';
  const booted = new Date(Date.now() - seconds * 1000);
  const date = booted.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${date}, ${formatClockTime(booted, timeFormat)}`;
}

export function formatGb(value?: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)} GB`;
}

export function formatAppRam(megabytes: number): string {
  if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(1)} GB`;
  return `${Math.round(megabytes)} MB`;
}

export function formatRate(value?: number | null, suffix = 'MB/s'): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (value >= 100) return `${Math.round(value)} ${suffix}`;
  return `${value.toFixed(1)} ${suffix}`;
}

export function formatSpeed(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (value >= 100) return `${Math.round(value)}`;
  return value.toFixed(1);
}

export function formatPing(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}`;
}

export function formatTestedAt(
  testedAt?: string,
  timeFormat: TimeFormat = '12h'
): string {
  if (!testedAt) return '';
  const date = new Date(testedAt);
  if (Number.isNaN(date.getTime())) return '';
  return formatClockTime(date, timeFormat);
}
