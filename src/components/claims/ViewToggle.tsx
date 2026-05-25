import type { ViewMode } from '../../types';

interface Props {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ viewMode, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
      {(['sweep', 'cluster'] as ViewMode[]).map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
            viewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}
