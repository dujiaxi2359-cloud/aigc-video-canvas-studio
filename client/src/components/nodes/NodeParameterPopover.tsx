import { useEffect, useMemo, type RefObject } from "react";
import { createPortal } from "react-dom";
import { autoUpdate, flip, offset, shift, size, useFloating } from "@floating-ui/react";
import { Check, X } from "lucide-react";

type Option = string | number;
type Section = {
  label: string;
  value?: Option;
  options: Option[];
  format?: (value: Option) => string;
  onChange: (value: Option) => void;
};

export function NodeParameterPopover({ open, title = "生成参数", sections, onClose, anchorRef }: { open: boolean; title?: string; sections: Section[]; onClose: () => void; anchorRef?: RefObject<HTMLElement | null> }) {
  const visibleSections = useMemo(() => sections.filter((section) => section.options.length > 0), [sections]);
  const hiddenCount = sections.length - visibleSections.length;
  const { refs, floatingStyles } = useFloating({
    open,
    placement: "top",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      flip({ padding: 12, fallbackPlacements: ["bottom", "top-start", "bottom-start"] }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${Math.min(360, Math.max(220, availableHeight))}px`,
            width: `${Math.min(328, Math.max(280, window.innerWidth - 24))}px`
          });
        }
      })
    ]
  });

  useEffect(() => {
    if (!open) return;
    refs.setReference(anchorRef?.current ?? null);
  }, [anchorRef, open, refs]);

  if (!open) return null;

  return createPortal(
    <div ref={refs.setFloating} className="node-parameter-popover node-parameter-popover-floating nodrag nopan nowheel" style={floatingStyles} onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="node-parameter-title">{title}</div>
        <button type="button" aria-label="关闭参数" title="关闭参数" className="drawer-icon" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="mt-3 space-y-3">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <div className="node-parameter-label">{section.label}</div>
            <div className="node-parameter-segment">
              {section.options.map((option) => {
                const active = String(section.value) === String(option);
                return (
                  <button key={String(option)} type="button" className={active ? "is-active" : ""} onClick={() => section.onChange(option)}>
                    {active && <Check size={11} />}{section.format ? section.format(option) : String(option)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {hiddenCount > 0 && <div className="node-parameter-hint">选择模型后显示对应比例、清晰度和时长。</div>}
      </div>
    </div>,
    document.body
  );
}
