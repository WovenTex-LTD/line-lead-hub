import type { NoteTag, NoteStatus, NoteImpact, NoteDepartment } from '@/hooks/useProductionNotes';
import {
  TrendingDown,
  Clock,
  Search,
  Package,
  Cog,
  Users,
  RefreshCw,
  SquarePen,
} from 'lucide-react';

export const TAG_CONFIG: Record<NoteTag, { label: string; icon: React.ReactNode; bg: string; text: string; dot: string }> = {
  output:       { label: 'Output',        icon: <TrendingDown className="h-4 w-4" />, bg: 'bg-blue-50 dark:bg-blue-950/40',     text: 'text-blue-700 dark:text-blue-300',     dot: 'bg-blue-500' },
  delay:        { label: 'Delay',         icon: <Clock className="h-4 w-4" />,        bg: 'bg-orange-50 dark:bg-orange-950/40',  text: 'text-orange-700 dark:text-orange-300',  dot: 'bg-orange-500' },
  quality:      { label: 'Quality',       icon: <Search className="h-4 w-4" />,       bg: 'bg-red-50 dark:bg-red-950/40',       text: 'text-red-700 dark:text-red-300',       dot: 'bg-red-500' },
  material:     { label: 'Material',      icon: <Package className="h-4 w-4" />,      bg: 'bg-amber-50 dark:bg-amber-950/40',   text: 'text-amber-700 dark:text-amber-300',   dot: 'bg-amber-500' },
  machine:      { label: 'Machine',       icon: <Cog className="h-4 w-4" />,          bg: 'bg-slate-50 dark:bg-slate-950/40',   text: 'text-slate-700 dark:text-slate-300',   dot: 'bg-slate-500' },
  staffing:     { label: 'Staffing',      icon: <Users className="h-4 w-4" />,        bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
  buyer_change: { label: 'Buyer Change',  icon: <RefreshCw className="h-4 w-4" />,    bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
  other:        { label: 'Other',         icon: <SquarePen className="h-4 w-4" />,    bg: 'bg-gray-50 dark:bg-gray-950/40',     text: 'text-gray-700 dark:text-gray-300',     dot: 'bg-gray-500' },
};

export const STATUS_CONFIG: Record<NoteStatus, { label: string; bg: string; text: string; ring: string }> = {
  open:       { label: 'Open',       bg: 'bg-red-500/10',    text: 'text-red-600 dark:text-red-400',       ring: 'ring-red-500/20' },
  monitoring: { label: 'Monitoring', bg: 'bg-yellow-500/10', text: 'text-yellow-600 dark:text-yellow-400', ring: 'ring-yellow-500/20' },
  resolved:   { label: 'Resolved',   bg: 'bg-green-500/10',  text: 'text-green-600 dark:text-green-400',   ring: 'ring-green-500/20' },
};

export const IMPACT_CONFIG: Record<NoteImpact, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-500' },
  medium: { label: 'Medium', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500' },
  high:   { label: 'High',   color: 'text-red-600 dark:text-red-400',     bg: 'bg-red-500' },
};

export const DEPARTMENT_OPTIONS: { value: NoteDepartment; label: string }[] = [
  { value: 'cutting', label: 'Cutting' },
  { value: 'sewing', label: 'Sewing' },
  { value: 'finishing', label: 'Finishing' },
  { value: 'qc', label: 'QC' },
  { value: 'storage', label: 'Storage' },
];

export const TAG_OPTIONS: { value: NoteTag; label: string }[] = Object.entries(TAG_CONFIG).map(
  ([value, { label }]) => ({ value: value as NoteTag, label })
);

export const IMPACT_OPTIONS: { value: NoteImpact; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const STATUS_OPTIONS: { value: NoteStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'resolved', label: 'Resolved' },
];
