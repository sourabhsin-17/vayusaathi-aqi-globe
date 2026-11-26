import { useState, type FormEvent } from 'react';
import { MessageSquare, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { formatObservationTimestamp } from '../lib/airQualityService';
import { t } from '../lib/i18n';
import { askAssistantQuestion } from '../lib/recommendationService';
import type { AirQualitySnapshot, ChatMessage, HouseholdProfile } from '../types/vayu';

interface AskAssistantProps {
  snapshot: AirQualitySnapshot;
  profile: HouseholdProfile;
}

export function AskAssistant({ snapshot, profile }: AskAssistantProps) {
  const lang = profile.language;
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  const quickQuestions =
    lang === 'hi'
      ? [
          'क्या मेरा बच्चा आज शाम बाहर खेल सकता है?',
          'सुबह के सफर के लिए सबसे सुरक्षित समय क्या है?',
          'क्या मुझे अभी घर की खिड़कियां खोलनी चाहिए?',
        ]
      : [
          'Can my child play outside this evening?',
          'What is the safest hour for my commute today?',
          'Should I open windows right now or wait?',
        ];

  const submitQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAtIso: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const reply = await askAssistantQuestion(trimmed, snapshot, profile);
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: reply.answer,
        replyMeta: reply,
        createdAtIso: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitQuestion(input);
  };

  return (
    <section id="assistant" aria-label={t(lang, 'assistantTitle')} className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono-tabular text-[11px] font-semibold uppercase tracking-wider text-[#67E8F9]">
            10. {lang === 'hi' ? 'प्रत्यक्ष प्रश्नोत्तर' : 'Verified Q&A'}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-[#E6EDF7] font-display">
            {t(lang, 'assistantTitle')}
          </h2>
        </div>
        <span className="text-xs text-[#A7A3C7]">
          {lang === 'hi'
            ? 'हर उत्तर लाइव डेटा स्रोत, समय और AQI मान का हवाला देता है'
            : 'Every reply cites live source, observation timestamp, and AQI value'}
        </span>
      </div>

      <div className="obsidian-surface rounded-3xl p-6 space-y-5">
        {/* Grounding Context Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/12 bg-[#0B0A16]/85 px-4 py-2.5 text-xs text-[#A7A3C7]">
          <div className="flex items-center gap-2 font-medium text-[#E6EDF7]">
            <Sparkles className="h-3.5 w-3.5 text-[#67E8F9]" aria-hidden="true" />
            <span>
              {lang === 'hi' ? 'लाइव संदर्भ सक्रिय:' : 'Grounded in live telemetry:'}{' '}
              <strong className="font-semibold text-[#67E8F9]">{snapshot.location.name}</strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono-tabular text-[11px] text-[#A7A3C7]">
            <span>US AQI {snapshot.current.usAqi}</span>
            <span>PM2.5 {snapshot.current.pm25} µg/m³</span>
            <span className="text-[#5DCAA5]">
              {lang === 'hi' ? 'सबसे स्वच्छ:' : 'Best:'} {snapshot.cleanestWindow.startLabel}–{snapshot.cleanestWindow.endLabel}
            </span>
          </div>
        </div>

        {/* Clean Suggestion Prompt Cards */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {quickQuestions.map((q, idx) => (
            <button
              key={q}
              type="button"
              disabled={sending}
              onClick={() => void submitQuestion(q)}
              className="min-h-[44px] rounded-2xl border border-white/12 bg-[#0B0A16]/85 px-4 py-2.5 text-left text-xs font-semibold text-[#E6EDF7] transition-colors hover:border-[#67E8F9] hover:bg-[#14163F] disabled:opacity-60"
            >
              <span className="block font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#67E8F9] mb-0.5">
                0{idx + 1}. {lang === 'hi' ? 'त्वरित प्रश्न' : 'Ask prompt'}
              </span>
              {q}
            </button>
          ))}
        </div>

        {/* Conversation Feed */}
        <div
          aria-live="polite"
          className="space-y-4 max-h-[420px] overflow-y-auto pr-1"
        >
          {messages.length === 0 ? (
            <div className="flex items-start gap-3 rounded-2xl border border-[#67E8F9]/25 bg-[#14163F] p-4 text-sm text-[#E6EDF7]">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#67E8F9]" aria-hidden="true" />
              <p className="text-[#E6EDF7]/90">
                {lang === 'hi'
                  ? `${snapshot.location.name} (US AQI ${snapshot.current.usAqi}) और आपकी प्रोफ़ाइल के अनुसार कोई भी सवाल पूछें।`
                  : `Ask a question tailored to ${snapshot.location.name} (live US AQI ${snapshot.current.usAqi}) and your household profile.`}
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-2xl border p-4 ${
                  msg.role === 'user'
                    ? 'ml-auto max-w-2xl border-[#67E8F9]/35 bg-[#14163F] text-[#E6EDF7]'
                    : 'mr-auto max-w-3xl border-white/12 bg-[#0B0A16]/90 text-[#E6EDF7]'
                }`}
              >
                <p className={`text-xs font-semibold ${msg.role === 'user' ? 'text-[#67E8F9]' : 'text-[#5DCAA5]'}`}>
                  {msg.role === 'user'
                    ? lang === 'hi'
                      ? 'आप'
                      : 'You'
                    : 'VayuSaathi'}
                </p>
                <p className="mt-1 text-sm text-[#E6EDF7] leading-relaxed whitespace-pre-line">
                  {msg.text}
                </p>

                {msg.replyMeta ? (
                  <div className="mt-3 space-y-1.5 border-t border-white/10 pt-2.5 text-[11px] text-[#A7A3C7]">
                    {msg.replyMeta.promptGuardTriggered ? (
                      <p className="flex items-center gap-1.5 font-semibold text-amber-300">
                        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Prompt safety guard active</span>
                      </p>
                    ) : null}
                    <p className="font-mono-tabular">
                      <strong className="text-[#E6EDF7]">Source:</strong> {msg.replyMeta.citedSource} ·{' '}
                      <strong className="text-[#E6EDF7]">Observed:</strong> {formatObservationTimestamp(msg.replyMeta.citedTimestamp)} ·{' '}
                      <strong className="text-[#E6EDF7]">US AQI:</strong> {msg.replyMeta.citedUsAqi} ({msg.replyMeta.citedCpcbCategory})
                    </p>
                    <p>
                      <strong className="text-[#E6EDF7]">{t(lang, 'limitsLabel')}:</strong> {msg.replyMeta.limitations}
                    </p>
                    <p className="text-[#A7A3C7]/85">
                      {msg.replyMeta.generalGuidanceNote} ({msg.replyMeta.mode === 'ai' ? 'AI' : 'Basic rule-based mode'})
                    </p>
                  </div>
                ) : null}
              </div>
            ))
          )}

          {sending ? (
            <p className="text-xs text-[#67E8F9]">
              {lang === 'hi' ? 'लाइव डेटा की जांच कर रहा है...' : 'Checking live readings and your profile...'}
            </p>
          ) : null}
        </div>

        {/* Question Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="assistant-question-input" className="sr-only">
            {t(lang, 'assistantTitle')}
          </label>
          <input
            id="assistant-question-input"
            type="text"
            maxLength={400}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t(lang, 'assistantPlaceholder')}
            className="flex-1 min-h-[44px] rounded-xl border border-white/12 bg-[#0B0A16] px-4 text-sm text-[#E6EDF7] placeholder:text-[#A7A3C7]/70 focus:border-[#67E8F9] focus:bg-[#14122E] focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || input.trim().length < 2}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#67E8F9] px-5 py-2 text-sm font-bold text-[#0B0A16] hover:bg-[#A5F3FC] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Send className="h-4 w-4 text-[#0B0A16]" aria-hidden="true" />
            <span>{t(lang, 'sendQuestion')}</span>
          </button>
        </form>
      </div>
    </section>
  );
}

