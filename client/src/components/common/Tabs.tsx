export function Tabs<T extends string>({
  value,
  items,
  onChange
}: {
  value: T;
  items: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          disabled={item.disabled}
          onClick={() => onChange(item.value)}
          className={`nodrag nopan h-8 rounded-full border px-3 text-xs font-semibold transition ${
            value === item.value
              ? "border-blue-300/40 bg-blue-400/[0.18] text-sky-100"
              : "border-slate-400/15 bg-white/[0.04] text-slate-400 hover:border-blue-300/30 hover:text-slate-100 disabled:opacity-35"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
