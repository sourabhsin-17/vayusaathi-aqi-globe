import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { t } from '../lib/i18n';
import type { Language } from '../types/vayu';

interface ExplanationFieldsProps {
  why: string;
  when: string;
  whoFor: string;
  effort: string;
  cost: string;
  expectedBenefit: string;
  limitations: string;
  formulaDetail?: string;
  lang: Language;
  variant?: 'light' | 'dark';
}

export function ExplanationFields({
  why,
  when,
  whoFor,
  effort,
  cost,
  expectedBenefit,
  limitations,
  formulaDetail,
  lang,
  variant = 'dark',
}: ExplanationFieldsProps) {
  const [open, setOpen] = useState(false);
  const isLight = variant === 'light';

  return (
    <div
      className={`mt-4 space-y-3 border-t pt-3.5 text-xs ${
        isLight ? 'border-[#14163F]/15' : 'border-white/10'
      }`}
    >
      {/* Highlight Summary Row */}
      <div className="grid grid-cols-2 gap-2">
        <div
          className={`rounded-xl border p-2.5 ${
            isLight
              ? 'border-[#14163F]/15 bg-[#F4F0E6] text-[#14163F]'
              : 'border-white/10 bg-[#0B0A16]/75 text-[#E6EDF7]'
          }`}
        >
          <span
            className={`block text-[10px] font-semibold uppercase tracking-wider ${
              isLight ? 'text-[#14163F]/75' : 'text-[#67E8F9]'
            }`}
          >
            {t(lang, 'whenLabel')}
          </span>
          <span className="mt-0.5 block font-medium leading-snug">{when}</span>
        </div>

        <div
          className={`rounded-xl border p-2.5 ${
            isLight
              ? 'border-[#14163F]/15 bg-[#F4F0E6] text-[#14163F]'
              : 'border-white/10 bg-[#0B0A16]/75 text-[#E6EDF7]'
          }`}
        >
          <span
            className={`block text-[10px] font-semibold uppercase tracking-wider ${
              isLight ? 'text-[#1D9E75]' : 'text-[#5DCAA5]'
            }`}
          >
            {t(lang, 'benefitLabel')}
          </span>
          <span className="mt-0.5 block font-semibold leading-snug">{expectedBenefit}</span>
        </div>
      </div>

      {/* Concise Why, Who, Effort/Cost, Limitations */}
      <dl className="space-y-2 leading-relaxed">
        <div>
          <dt className={`inline font-semibold ${isLight ? 'text-[#14163F]' : 'text-[#67E8F9]'}`}>
            {t(lang, 'whyLabel')}:{' '}
          </dt>
          <dd className={`inline ${isLight ? 'text-[#14163F]/85' : 'text-[#E6EDF7]/90'}`}>{why}</dd>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            <strong className={isLight ? 'text-[#14163F]/75' : 'text-[#A7A3C7]'}>
              {t(lang, 'whoLabel')}:
            </strong>{' '}
            <span className={isLight ? 'text-[#14163F]' : 'text-[#E6EDF7]'}>{whoFor}</span>
          </span>
          <span aria-hidden="true" className={isLight ? 'text-[#14163F]/35' : 'text-white/30'}>
            ·
          </span>
          <span>
            <strong className={isLight ? 'text-[#14163F]/75' : 'text-[#A7A3C7]'}>
              {t(lang, 'effortLabel')}:
            </strong>{' '}
            <span className={`font-semibold ${isLight ? 'text-[#14163F]' : 'text-[#E6EDF7]'}`}>
              {effort}
            </span>
          </span>
          <span aria-hidden="true" className={isLight ? 'text-[#14163F]/35' : 'text-white/30'}>
            ·
          </span>
          <span>
            <strong className={isLight ? 'text-[#14163F]/75' : 'text-[#A7A3C7]'}>
              {t(lang, 'costLabel')}:
            </strong>{' '}
            <span className={`font-semibold ${isLight ? 'text-[#14163F]' : 'text-[#E6EDF7]'}`}>
              {cost}
            </span>
          </span>
        </div>

        <div>
          <dt className={`inline font-semibold ${isLight ? 'text-[#14163F]/75' : 'text-[#A7A3C7]'}`}>
            {t(lang, 'limitsLabel')}:{' '}
          </dt>
          <dd className={`inline ${isLight ? 'text-[#14163F]/80' : 'text-[#A7A3C7]'}`}>
            {limitations}
          </dd>
        </div>
      </dl>

      {formulaDetail ? (
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
              isLight
                ? 'border-[#14163F]/20 bg-[#F4F0E6] text-[#14163F] hover:bg-[#EAE3D5]'
                : 'border-white/15 bg-white/[0.06] text-[#67E8F9] hover:bg-white/[0.12]'
            }`}
          >
            <span>{t(lang, 'howCalculated')}</span>
            {open ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
          {open ? (
            <div
              className={`mt-2 rounded-xl border p-3 text-xs font-mono-tabular leading-relaxed ${
                isLight
                  ? 'border-[#14163F]/15 bg-[#F4F0E6] text-[#14163F]'
                  : 'border-white/10 bg-[#0B0A16] text-[#E6EDF7]/90'
              }`}
            >
              {formulaDetail}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
