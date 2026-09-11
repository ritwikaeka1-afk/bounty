"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="dialog-title" onCancel={onClose}>
    <button className="close" type="button" onClick={onClose} aria-label="Close dialog">×</button>
    <h2 id="dialog-title">{title}</h2>{children}
  </dialog>;
}
