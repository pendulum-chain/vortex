// Accessible dialog: bottom sheet on phones, centred sheet from 640 px. Focus moves into the sheet
// and is trapped there, Escape and the backdrop close it (unless closeDisabled), focus returns to
// the opener, and the page behind does not scroll. A new `stepKey` (a flow step) scrolls the sheet
// back to the top and keeps focus inside it, since the button that led there is gone.
import { useEffect, useId, useRef } from "react";
import { X } from "./icons.js";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";

export function Modal({ title, description, onClose, children, wide = false, closeDisabled = false, headerExtra = null, stepKey = null, closeLabel = "Fechar", lang }) {
  const sheetRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const live = useRef({ onClose, closeDisabled });
  live.current = { onClose, closeDisabled };

  useEffect(() => {
    const previous = document.activeElement;
    const sheet = sheetRef.current;
    sheet?.focus({ preventScroll: true });
    document.body.classList.add("no-scroll");
    const onKey = (event) => {
      if (event.key === "Escape" && !live.current.closeDisabled) {
        event.preventDefault();
        live.current.onClose();
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const items = [...sheet.querySelectorAll(FOCUSABLE)].filter((item) => item.offsetParent !== null || item === document.activeElement);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
      if (previous && typeof previous.focus === "function" && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  const shownStep = useRef(stepKey);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || shownStep.current === stepKey) return;
    shownStep.current = stepKey;
    sheet.scrollTop = 0;
    if (!sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });
  }, [stepKey]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}>
      <section ref={sheetRef} lang={lang} className={`sheet${wide ? " sheet--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}>
        <div className="sheet__head">
          <div>
            <h2 className="sheet__title" id={titleId}>{title}</h2>
            {description && <p className="sheet__desc" id={descriptionId}>{description}</p>}
          </div>
          {!closeDisabled && <button className="icon-button sheet__close" type="button" onClick={onClose} aria-label={closeLabel}><X size={22} /></button>}
        </div>
        {headerExtra}
        <div className="sheet__body">{children}</div>
      </section>
    </div>
  );
}
