import { COMPACT_SETUPS } from '../types/trading';

interface SetupFilterBarProps {
  selectedSetup: string;
  onSelectSetup: (setup: string) => void;
  availableCustomSetups: string[];
  label?: string;
}

export function SetupFilterBar({
  selectedSetup,
  onSelectSetup,
  label,
}: SetupFilterBarProps) {
  const allOptions = Array.from(new Set(['ALL', ...COMPACT_SETUPS]));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {label ? (
        <span className="mr-1 text-xs font-medium text-slate-400 whitespace-nowrap">
          {label}:
        </span>
      ) : null}
      <div
        role="group"
        aria-label="Schematic / Setup Filter"
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#1E2634] bg-[#0B0E14] p-1"
      >
        {allOptions.map((setup) => {
          const isActive = selectedSetup === setup;
          return (
            <button
              key={setup}
              type="button"
              onClick={() => onSelectSetup(setup)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-[#171E2B] hover:text-white'
              }`}
            >
              {setup}
            </button>
          );
        })}
      </div>
    </div>
  );
}
