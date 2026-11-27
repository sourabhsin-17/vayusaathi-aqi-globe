import { useState } from 'react';
import {
  Baby,
  CheckCircle2,
  Circle,
  Clock,
  HeartPulse,
  HardHat,
  Home,
  Leaf,
  ShieldCheck,
  Sprout,
  UserCheck,
} from 'lucide-react';
import { t } from '../lib/i18n';
import type { AdvisoryResult, FamilyGroupGuidance, HouseholdProfile } from '../types/vayu';
import { ExplanationFields } from './ExplanationDrawer';

interface DashboardSectionsProps {
  advisoryResult: AdvisoryResult | null;
  advisoryLoading: boolean;
  profile: HouseholdProfile;
}

function getGroupIcon(key: FamilyGroupGuidance['groupKey'], selected: boolean) {
  const colorClass = selected
    ? 'text-[#0C1322]'
    : key === 'sensitive_respiratory'
    ? 'text-rose-300'
    : 'text-[#38BDF8]';
  switch (key) {
    case 'children':
      return <Baby className={`h-4 w-4 ${colorClass}`} aria-hidden="true" />;
    case 'elderly':
      return <UserCheck className={`h-4 w-4 ${colorClass}`} aria-hidden="true" />;
    case 'outdoor_workers':
      return <HardHat className={`h-4 w-4 ${colorClass}`} aria-hidden="true" />;
    case 'sensitive_respiratory':
      return <HeartPulse className={`h-4 w-4 ${colorClass}`} aria-hidden="true" />;
  }
}

export function DashboardSections({
  advisoryResult,
  advisoryLoading,
  profile,
}: DashboardSectionsProps) {
  const lang = profile.language;
  const [selectedFamilyKey, setSelectedFamilyKey] =
    useState<FamilyGroupGuidance['groupKey']>('children');
  const [checkedHacks, setCheckedHacks] = useState<Record<number, boolean>>({});

  if (advisoryLoading && !advisoryResult) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-48 obsidian-surface rounded-3xl p-6" />
        <div className="h-64 obsidian-surface rounded-3xl p-6" />
      </div>
    );
  }

  if (!advisoryResult) return null;

  const { advisory, mode, fallbackReason } = advisoryResult;
  const activeFamily =
    advisory.familyProtection.find((f) => f.groupKey === selectedFamilyKey) ??
    advisory.familyProtection[0];

  const topActionThemes = [
    {
      container: 'border-[#38BDF8]/40 bg-[#182947] text-[#E6EDF7]',
      eyebrow: 'text-[#38BDF8]',
      title: 'text-white',
      variant: 'dark' as const,
    },
    {
      container: 'obsidian-surface text-[#E6EDF7]',
      eyebrow: 'text-[#5DCAA5]',
      title: 'text-[#E6EDF7]',
      variant: 'dark' as const,
    },
    {
      container: 'border-white/12 bg-[#142138] text-[#E6EDF7]',
      eyebrow: 'text-[#A78BFA]',
      title: 'text-[#E6EDF7]',
      variant: 'dark' as const,
    },
  ];

  // Restrained cosmic surface alternation for the 5 daily planner slots
  const plannerThemes = [
    { span: 'md:col-span-3', bg: 'border-white/12 bg-[#142138]', eyebrow: 'text-[#38BDF8]', variant: 'dark' as const },
    { span: 'md:col-span-3', bg: 'border-white/10 bg-[#101A2C]', eyebrow: 'text-[#5DCAA5]', variant: 'dark' as const },
    { span: 'md:col-span-2', bg: 'border-[#38BDF8]/30 bg-[#182947]', eyebrow: 'text-[#38BDF8]', variant: 'dark' as const },
    { span: 'md:col-span-2', bg: 'border-white/10 bg-[#0C1322]/90', eyebrow: 'text-[#A78BFA]', variant: 'dark' as const },
    { span: 'md:col-span-2', bg: 'border-[#38BDF8]/35 bg-[#182947] text-[#E6EDF7]', eyebrow: 'text-[#5DCAA5]', variant: 'dark' as const },
  ];

  const alternativeThemes = [
    { bg: 'border-white/12 bg-[#142138]', eyebrow: 'text-[#5DCAA5]', metricBg: 'border border-white/10 bg-[#0C1322]/85' },
    { bg: 'border-white/10 bg-[#101A2C]', eyebrow: 'text-[#38BDF8]', metricBg: 'border border-white/10 bg-[#0C1322]/85' },
    { bg: 'border-[#38BDF8]/30 bg-[#182947]', eyebrow: 'text-[#A78BFA]', metricBg: 'border border-white/10 bg-[#0C1322]/85' },
  ];

  const toggleHack = (index: number) => {
    setCheckedHacks((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const completedHacksCount = advisory.indoorGuidance.lowCostHacks.filter(
    (_, idx) => checkedHacks[idx]
  ).length;

  return (
    <div className="space-y-8">
      {/* Transparent Mode Banner */}
      <div
        role="status"
        aria-live="polite"
        className={`rounded-2xl border px-5 py-4 text-xs ${
          mode === 'fallback'
            ? 'border-amber-400/35 bg-amber-500/12 text-amber-100'
            : 'border-[#5DCAA5]/35 bg-[#1D9E75]/15 text-[#E6EDF7]'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-[#38BDF8]">
            {mode === 'fallback' ? t(lang, 'basicModeNotice') : t(lang, 'aiModeLabel')}
          </span>
          <span className="text-[#9FB0C7]">{advisory.medicalDisclaimer}</span>
        </div>
        {mode === 'fallback' && fallbackReason ? (
          <p className="mt-1 text-[11px] text-amber-200">Detail: {fallbackReason}</p>
        ) : null}
        <p className="mt-1.5 text-sm font-semibold text-[#E6EDF7]">{advisory.summaryBanner}</p>
      </div>

      {/* SECTION 04: PRIORITY ACTIONS BENTO */}
      <section id="top-actions" aria-label={t(lang, 'top3Title')} className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="font-mono-tabular text-[11px] font-semibold uppercase tracking-wider text-[#38BDF8]">
              04. {lang === 'hi' ? 'आज की प्राथमिकता' : 'Priority Actions'}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-[#E6EDF7] font-display">
              {t(lang, 'top3Title')}
            </h2>
          </div>
          <p className="text-xs text-[#9FB0C7]">{t(lang, 'generalGuidanceNote')}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {advisory.top3Actions.map((action, index) => {
            const theme = topActionThemes[index % topActionThemes.length];
            return (
              <article
                key={action.id}
                className={`flex flex-col justify-between rounded-3xl border p-6 ${theme.container}`}
              >
                <div>
                  <p className={`font-mono-tabular text-xs font-bold uppercase tracking-wider ${theme.eyebrow}`}>
                    0{index + 1}. {lang === 'hi' ? 'प्राथमिक कदम' : 'Priority Action'}
                  </p>
                  <h3 className={`mt-1.5 text-lg font-semibold leading-snug font-display ${theme.title}`}>
                    {action.title}
                  </h3>
                </div>

                <ExplanationFields
                  why={action.why}
                  when={action.when}
                  whoFor={action.whoFor}
                  effort={action.effort}
                  cost={action.cost}
                  expectedBenefit={action.expectedBenefit}
                  limitations={action.limitations}
                  formulaDetail={action.formulaSummary}
                  lang={lang}
                  variant={theme.variant}
                />
              </article>
            );
          })}
        </div>
      </section>

      {/* SECTION 05: ASYMMETRIC TIME-OF-DAY BENTO PLANNER */}
      <section id="planner" aria-label={t(lang, 'dailyPlannerTitle')} className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="font-mono-tabular text-[11px] font-semibold uppercase tracking-wider text-[#38BDF8]">
              05. {lang === 'hi' ? 'समय-सारिणी मार्गदर्शन' : 'Hourly Rhythm'}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-[#E6EDF7] font-display">
              {t(lang, 'dailyPlannerTitle')}
            </h2>
          </div>
          <span className="text-xs text-[#9FB0C7]">
            {lang === 'hi'
              ? 'सुबह, सफर, दोपहर, शाम और रात के लाइव पूर्वानुमान पर आधारित'
              : 'Aligned to hourly Open-Meteo forecast windows & your commute times'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          {advisory.dailyPlanner.map((slot, idx) => {
            const theme = plannerThemes[idx % plannerThemes.length];
            return (
              <article
                key={slot.period}
                className={`flex flex-col justify-between rounded-3xl border p-5 sm:p-6 ${theme.span} ${theme.bg}`}
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${theme.eyebrow}`}>
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      <span>{slot.period}</span>
                    </div>
                    <span className="font-mono-tabular text-xs font-semibold text-[#9FB0C7]">
                      {slot.timeWindow}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold leading-snug font-display text-[#E6EDF7]">
                    {slot.headline}
                  </h3>
                </div>

                <ExplanationFields
                  why={slot.why}
                  when={slot.when}
                  whoFor={slot.whoFor}
                  effort={slot.effort}
                  cost={slot.cost}
                  expectedBenefit={slot.expectedBenefit}
                  limitations={slot.limitations}
                  lang={lang}
                  variant={theme.variant}
                />
              </article>
            );
          })}
        </div>
      </section>

      {/* SECTION 06: SUSTAINABLE COMMUTE & CO2 ALTERNATIVES */}
      <section
        id="alternatives"
        aria-label={t(lang, 'alternativesTitle')}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="font-mono-tabular text-[11px] font-semibold uppercase tracking-wider text-[#5DCAA5]">
              06. {lang === 'hi' ? 'कम उत्सर्जन व यात्रा' : 'Sustainable Choices'}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-[#E6EDF7] font-display">
              {t(lang, 'alternativesTitle')}
            </h2>
          </div>
          <span className="text-xs text-[#9FB0C7]">
            {lang === 'hi'
              ? 'अनुमानित संपर्क बदलाव + प्रति ट्रिप CO2 बचत'
              : 'Includes estimated personal exposure change & CO2 saved per trip'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {advisory.sustainableAlternatives.map((alt, idx) => {
            const theme = alternativeThemes[idx % alternativeThemes.length];
            return (
              <article
                key={alt.id}
                className={`flex flex-col justify-between rounded-3xl border p-6 ${theme.bg}`}
              >
                <div>
                  <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${theme.eyebrow}`}>
                    <Leaf className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{alt.formulaTitle}</span>
                  </div>
                  <h3 className="mt-1.5 text-lg font-semibold text-[#E6EDF7] font-display">{alt.title}</h3>
                  <p className="mt-1 text-sm text-[#9FB0C7]">{alt.actionSummary}</p>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className={`rounded-xl p-2.5 ${theme.metricBg}`}>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#9FB0C7]">
                        {lang === 'hi' ? 'संपर्क में बदलाव' : 'Exposure change'}
                      </span>
                      <strong className="mt-0.5 block font-mono-tabular text-sm text-[#5DCAA5]">
                        {alt.exposureChangeText}
                      </strong>
                    </div>
                    <div className={`rounded-xl p-2.5 ${theme.metricBg}`}>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#9FB0C7]">
                        {lang === 'hi' ? 'CO2 बचत (अनुमान)' : 'CO2 saved (est.)'}
                      </span>
                      <strong className="mt-0.5 block font-mono-tabular text-sm text-[#38BDF8]">
                        {alt.co2SavedText}
                      </strong>
                    </div>
                  </div>
                </div>

                <ExplanationFields
                  why={alt.why}
                  when={alt.when}
                  whoFor={alt.whoFor}
                  effort={alt.effort}
                  cost={alt.cost}
                  expectedBenefit={alt.expectedBenefit}
                  limitations={alt.limitations}
                  formulaDetail={alt.formulaDetail}
                  lang={lang}
                />
              </article>
            );
          })}
        </div>
      </section>

      {/* SECTION 07 & 08: SIDE-BY-SIDE INDOOR & FAMILY BENTO DUO */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        {/* Indoor Air Care (6 cols) */}
        <section
          id="indoor"
          aria-label={t(lang, 'indoorTitle')}
          className="obsidian-surface flex flex-col justify-between rounded-3xl p-6 space-y-5 lg:col-span-6"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-mono-tabular text-[11px] font-semibold uppercase tracking-wider text-[#38BDF8]">
                  07. {lang === 'hi' ? 'घर के अंदर सुरक्षा' : 'Indoor Air Care'}
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-[#E6EDF7] font-display">
                  {t(lang, 'indoorTitle')}
                </h2>
              </div>
              <span className="font-mono-tabular text-[11px] font-semibold text-[#5DCAA5]">
                {completedHacksCount}/{advisory.indoorGuidance.lowCostHacks.length}{' '}
                {lang === 'hi' ? 'कदम पूरे' : 'steps checked'}
              </span>
            </div>

            <div className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-[#0C1322]/80 px-4 py-3 text-xs text-[#9FB0C7]">
              <Home className="mt-0.5 h-4 w-4 shrink-0 text-[#38BDF8]" aria-hidden="true" />
              <span>{t(lang, 'indoorNoSensorNote')}</span>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-semibold text-[#E6EDF7] font-display">
                {advisory.indoorGuidance.ventilationHeadline}
              </h3>
              <p className="text-sm text-[#9FB0C7] leading-relaxed">
                {advisory.indoorGuidance.ventilationTiming}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#0C1322]/80 p-4 space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#38BDF8]">
                  {lang === 'hi' ? 'HEPA CADR मार्गदर्शन' : 'Purifier & CADR Guide'}
                </h4>
                <p className="text-xs text-[#9FB0C7] leading-relaxed">
                  {advisory.indoorGuidance.purifierCadrGuidance}
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-2xl border border-[#5DCAA5]/25 bg-[#142138] p-4 text-xs text-[#E6EDF7]">
                <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-[#5DCAA5]" aria-hidden="true" />
                <p className="leading-relaxed text-[#9FB0C7]">{advisory.indoorGuidance.plantsHonestNote}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0C1322]/80 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#5DCAA5]">
                  {lang === 'hi' ? 'कम लागत वाले प्रभावी घरेलू उपाय (टिक करें)' : 'Interactive Low-Cost Indoor Checklist'}
                </h4>
              </div>
              <div className="space-y-1.5">
                {advisory.indoorGuidance.lowCostHacks.map((hack, i) => {
                  const done = Boolean(checkedHacks[i]);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleHack(i)}
                      aria-pressed={done}
                      className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                        done
                          ? 'border-[#38BDF8] bg-[#182947] text-[#E6EDF7]'
                          : 'border-white/10 bg-[#101A2C] text-[#E6EDF7] hover:border-[#38BDF8]/50 hover:bg-[#142138]'
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#5DCAA5]" aria-hidden="true" />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#9FB0C7]" aria-hidden="true" />
                      )}
                      <span className={`leading-relaxed ${done ? 'line-through opacity-75' : ''}`}>
                        {hack}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <ExplanationFields
            why={advisory.indoorGuidance.why}
            when={advisory.indoorGuidance.when}
            whoFor={advisory.indoorGuidance.whoFor}
            effort={advisory.indoorGuidance.effort}
            cost={advisory.indoorGuidance.cost}
            expectedBenefit={advisory.indoorGuidance.expectedBenefit}
            limitations={advisory.indoorGuidance.limitations}
            formulaDetail={advisory.indoorGuidance.formulaDetail}
            lang={lang}
          />
        </section>

        {/* Family Protection & Mask Guard (6 cols) */}
        <section
          id="family"
          aria-label={t(lang, 'familyTitle')}
          className="obsidian-surface flex flex-col justify-between rounded-3xl p-6 space-y-5 lg:col-span-6"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-mono-tabular text-[11px] font-semibold uppercase tracking-wider text-[#A78BFA]">
                  08. {lang === 'hi' ? 'परिवार सुरक्षा' : 'Family Protection'}
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-[#E6EDF7] font-display">
                  {t(lang, 'familyTitle')}
                </h2>
              </div>
              <span className="text-[11px] text-[#9FB0C7]">{t(lang, 'generalGuidanceNote')}</span>
            </div>

            {/* Interactive group selector tabs */}
            <div
              role="tablist"
              aria-label="Family protection groups"
              className="flex flex-wrap gap-2"
            >
              {advisory.familyProtection.map((group) => {
                const selected = group.groupKey === activeFamily?.groupKey;
                return (
                  <button
                    key={group.groupKey}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setSelectedFamilyKey(group.groupKey)}
                    className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      selected
                        ? 'border-[#38BDF8] bg-[#38BDF8] text-[#0C1322]'
                        : 'border-white/12 bg-[#0C1322]/80 text-[#E6EDF7] hover:border-[#38BDF8]/60 hover:bg-[#182947]'
                    }`}
                  >
                    {getGroupIcon(group.groupKey, selected)}
                    <span>{group.groupTitle}</span>
                  </button>
                );
              })}
            </div>

            {activeFamily ? (
              <div role="tabpanel" className="rounded-2xl border border-white/10 bg-[#0C1322]/80 p-5 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-[#38BDF8]">{activeFamily.priorityLevel}</span>
                  <span aria-hidden="true" className="text-[#9FB0C7]">·</span>
                  <span className="text-[#9FB0C7]">{activeFamily.groupTitle}</span>
                </div>
                <p className="text-sm font-semibold text-[#E6EDF7] leading-relaxed">
                  {activeFamily.guidance}
                </p>

                <ExplanationFields
                  why={activeFamily.whoFor}
                  when={activeFamily.when}
                  whoFor={activeFamily.whoFor}
                  effort={activeFamily.effort}
                  cost={activeFamily.cost}
                  expectedBenefit={activeFamily.expectedBenefit}
                  limitations={activeFamily.limitations}
                  lang={lang}
                />
              </div>
            ) : null}
          </div>

          {/* Honest Mask Guidance in Deep Indigo Shield Banner */}
          <div className="rounded-2xl border border-[#38BDF8]/30 bg-[#182947] p-5 text-[#E6EDF7] space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-[#5DCAA5]">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{advisory.maskGuidance.recommendedType}</span>
            </div>
            <p className="text-xs text-[#E6EDF7]/90 leading-relaxed">{advisory.maskGuidance.fitGuidance}</p>
            <p className="text-[11px] font-medium text-amber-200">
              {advisory.maskGuidance.clothAndSurgicalLimit}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

