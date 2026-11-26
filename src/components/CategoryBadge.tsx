import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Wind,
} from 'lucide-react';
import { CPCB_CATEGORY_STYLES } from '../lib/cpcb';
import type { CpcbCategoryKey } from '../types/vayu';

interface CategoryBadgeProps {
  categoryKey: CpcbCategoryKey;
  label: string;
}

export function CategoryIcon({
  categoryKey,
  className = 'h-4 w-4',
}: {
  categoryKey: CpcbCategoryKey;
  className?: string;
}) {
  switch (categoryKey) {
    case 'good':
      return <CheckCircle2 className={className} aria-hidden="true" />;
    case 'satisfactory':
      return <Wind className={className} aria-hidden="true" />;
    case 'moderate':
      return <Info className={className} aria-hidden="true" />;
    case 'poor':
      return <AlertTriangle className={className} aria-hidden="true" />;
    case 'very_poor':
      return <ShieldAlert className={className} aria-hidden="true" />;
    case 'severe':
      return <AlertOctagon className={className} aria-hidden="true" />;
  }
}

export function CategoryBadge({ categoryKey, label }: CategoryBadgeProps) {
  const style = CPCB_CATEGORY_STYLES[categoryKey];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${style.badgeBg} ${style.badgeText} ${style.badgeBorder}`}
    >
      <CategoryIcon categoryKey={categoryKey} className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </span>
  );
}
