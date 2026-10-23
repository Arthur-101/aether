import { createContext, useContext } from 'react';
import type { TimeFormat } from '../types/ipc';

/** The default matches the pre-setting behaviour in this app. */
export const TimeFormatContext = createContext<TimeFormat>('12h');

export function useTimeFormat(): TimeFormat {
  return useContext(TimeFormatContext);
}
