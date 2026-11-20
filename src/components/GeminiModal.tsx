import { useState } from 'react';
import type { TranslationSet } from '../i18n/translations';

interface GeminiModalProps {
  isOpen: boolean;
  loading: boolean;
  serverSuccess: boolean;
  responseText: string;
  promptText: string;
  t: TranslationSet;
  onClose: () => void;
}

export function GeminiModal({
  isOpen,
  loading,
  serverSuccess,
  responseText,
  promptText,
  t,
  onClose,
}: GeminiModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gemini-modal-title"
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-lg border border-[#263042] bg-[#121721] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1E2634] px-6 py-4">
          <div>
            <h3 id="gemini-modal-title" className="text-base font-semibold text-slate-100">
              {t.gemini.title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">{t.gemini.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#263042] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-[#1B2230]"
          >
            {t.gemini.close}
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
          <div
            className={`rounded-md border p-4 leading-relaxed ${
              loading
                ? 'border-sky-500/30 bg-sky-500/10 text-slate-200'
                : serverSuccess
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100 whitespace-pre-wrap'
                  : 'border-amber-500/35 bg-amber-500/10 text-amber-100'
            }`}
          >
            {loading
              ? t.gemini.loading
              : serverSuccess
                ? responseText
                : t.gemini.noServerMessage}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">
                {t.gemini.summaryLabel}
              </span>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="rounded-md border border-[#263042] bg-[#0B0E14] px-3 py-1.5 text-xs font-medium text-sky-300 hover:border-sky-500/50"
              >
                {copied ? t.gemini.copied : t.gemini.copyPrompt}
              </button>
            </div>
            <pre className="max-h-72 overflow-auto rounded-md border border-[#1E2634] bg-[#0B0E14] p-4 font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap">
              {promptText}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
