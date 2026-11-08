import type { ComponentType } from 'react';
import { Smile, Heart, Meh, Frown, CloudRain } from 'lucide-react';

export interface MoodOption {
  value: number;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  colorClass: string;       // text color
  bgClass: string;          // bg tint when selected
  borderClass: string;      // border color when selected
}

export const MOOD_OPTIONS: MoodOption[] = [
  { value: 5, label: 'Muito Bem', Icon: Smile,     colorClass: 'text-green-600',  bgClass: 'bg-green-50 dark:bg-green-950/30',   borderClass: 'border-green-500' },
  { value: 4, label: 'Bem',       Icon: Heart,     colorClass: 'text-blue-600',   bgClass: 'bg-blue-50 dark:bg-blue-950/30',     borderClass: 'border-blue-500' },
  { value: 3, label: 'Neutro',    Icon: Meh,       colorClass: 'text-yellow-600', bgClass: 'bg-yellow-50 dark:bg-yellow-950/30', borderClass: 'border-yellow-500' },
  { value: 2, label: 'Mal',       Icon: Frown,     colorClass: 'text-rose-600',   bgClass: 'bg-rose-50 dark:bg-rose-950/30',     borderClass: 'border-rose-500' },
  { value: 1, label: 'Muito Mal', Icon: CloudRain, colorClass: 'text-red-600',    bgClass: 'bg-red-50 dark:bg-red-950/30',       borderClass: 'border-red-500' },
];

export const getMoodOptionByValue = (value: number | null) =>
  MOOD_OPTIONS.find((m) => m.value === value) || null;
