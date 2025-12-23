export enum AppMode {
  HOME = 'HOME',
  EDITOR = 'EDITOR',
  VIDEO_PREVIEW = 'VIDEO_PREVIEW',
  HISTORY = 'HISTORY'
}

export interface CaptureHistory {
  id: string;
  imageData: string;
  timestamp: number;
  filename?: string;
}

export enum ToolType {
  SELECT = 'SELECT',
  RECTANGLE = 'RECTANGLE',
  ARROW = 'ARROW',
  TEXT = 'TEXT',
  PEN = 'PEN',
  HIGHLIGHTER = 'HIGHLIGHTER',
  COUNTER = 'COUNTER',
  PIXELATE = 'PIXELATE'
}

export interface Point {
  x: number;
  y: number;
}

export interface Annotation {
  id: string;
  type: ToolType;
  points?: Point[]; // For pen/highlighter
  startPoint?: Point; // For shapes
  endPoint?: Point; // For shapes
  text?: string;
  color: string;
  strokeWidth: number;
  number?: number; // For counter
}

export interface BackgroundConfig {
  type: 'color' | 'gradient' | 'transparent';
  value: string;
  padding: number;
  shadow: boolean;
  inset: number; // Scale of image relative to canvas
}

export const PRESET_BACKGROUNDS = [
  { name: 'Clean', value: 'linear-gradient(135deg, #e0e7ff 0%, #cffafe 100%)' },
  { name: 'Midnight', value: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' },
  { name: 'Sunset', value: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
  { name: 'Neon', value: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)' },
  { name: 'Solid White', value: '#ffffff' },
  { name: 'Transparent', value: 'transparent' },
];