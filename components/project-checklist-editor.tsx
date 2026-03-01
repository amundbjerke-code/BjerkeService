"use client";

import { ChecklistItemAnswer } from "@prisma/client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { checklistAnswerOptions, getChecklistAnswerLabel } from "@/lib/checklist-meta";

type ItemAttachment = {
  id: string;
  filUrl: string;
  filType: string;
  createdAt: string;
};

type ChecklistItem = {
  id: string;
  tekst: string;
  rekkefolge: number;
  svar: ChecklistItemAnswer | null;
  kommentar: string | null;
  attachments: ItemAttachment[];
};

type SaveState = "idle" | "saving" | "saved" | "error";

type Props = {
  checklistId: string;
  items: ChecklistItem[];
};

type DraftValue = {
  svar: ChecklistItemAnswer | null;
  kommentar: string | null;
};

function buttonClass(active: boolean): string {
  if (active) {
    return "rounded-xl border border-brand-red bg-brand-red px-3 py-2 text-sm font-semibold text-white";
  }
  return "rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-brand-ink";
}

export function ProjectChecklistEditor({ checklistId, items }: Props) {
  const [itemState, setItemState] = useState<ChecklistItem[]>(items);
  const [saveStateByItem, setSaveStateByItem] = useState<Record<string, SaveState>>({});
  const [uploadingByItem, setUploadingByItem] = useState<Record<string, boolean>>({});
  const [globalMessage, setGlobalMessage] = useState<string>("");

  const debounceMapRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const draftKey = useMemo(() => `project-checklist-draft-${checklistId}`, [checklistId]);

  useEffect(() => {
    const raw = window.localStorage.getItem(draftKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, DraftValue>;
      setItemState((current) =>
        current.map((item) => {
          const draft = parsed[item.id];
          if (!draft) {
            return item;
          }
          return {
            ...item,
            svar: draft.svar ?? null,
            kommentar: draft.kommentar ?? null
          };
        })
      );
      setGlobalMessage("Lokalt utkast lastet.");
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const payload: Record<string, DraftValue> = {};
      for (const item of itemState) {
        payload[item.id] = {
          svar: item.svar,
          kommentar: item.kommentar ?? null
        };
      }
      window.localStorage.setItem(draftKey, JSON.stringify(payload));
    }, 300);

    return () => clearTimeout(timeout);
  }, [draftKey, itemState]);

  const patchItem = useCallback(
    async (itemId: string, svar: ChecklistItemAnswer | null, kommentar: string | null) => {
      setSaveStateByItem((current) => ({ ...current, [itemId]: "saving" }));

      const response = await fetch(`/api/project-checklists/${checklistId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ svar, kommentar })
      });

      if (!response.ok) {
        setSaveStateByItem((current) => ({ ...current, [itemId]: "error" }));
        setGlobalMessage("Noen endringer ble ikke lagret. Prover igjen ved neste endring.");
        return;
      }

      const payload = (await response.json()) as { data?: ChecklistItem };
      if (payload.data) {
        setItemState((current) => current.map((item) => (item.id === itemId ? { ...item, ...payload.data } : item)));
      }
      setSaveStateByItem((current) => ({ ...current, [itemId]: "saved" }));
      setGlobalMessage("Endringer lagret automatisk.");
    },
    [checklistId]
  );

  const scheduleAutosave = useCallback(
    (itemId: string, svar: ChecklistItemAnswer | null, kommentar: string | null) => {
      const existing = debounceMapRef.current[itemId];
      if (existing) {
        clearTimeout(existing);
      }
      debounceMapRef.current[itemId] = setTimeout(() => {
        patchItem(itemId, svar, kommentar).catch(() => {
          setSaveStateByItem((current) => ({ ...current, [itemId]: "error" }));
          setGlobalMessage("Lagring feilet.");
        });
      }, 700);
    },
    [patchItem]
  );

  const updateItem = useCallback(
    (itemId: string, next: Partial<ChecklistItem>) => {
      setItemState((current) => {
        const updated = current.map((item) => (item.id === itemId ? { ...item, ...next } : item));
        const changed = updated.find((item) => item.id === itemId);
        if (changed) {
          scheduleAutosave(changed.id, changed.svar, changed.kommentar ?? null);
        }
        return updated;
      });
    },
    [scheduleAutosave]
  );

  const uploadAttachments = useCallback(async (itemId: string, files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    setUploadingByItem((current) => ({ ...current, [itemId]: true }));
    const formData = new FormData();
    for (const file of Array.from(files)) {
      formData.append("files", file);
    }

    try {
      const response = await fetch(`/api/project-checklists/items/${itemId}/attachments`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        setGlobalMessage("Kunne ikke laste opp bilde.");
        return;
      }

      const payload = (await response.json()) as { data?: ItemAttachment[] };
      const newAttachments = payload.data ?? [];

      setItemState((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                attachments: [...newAttachments, ...item.attachments]
              }
            : item
        )
      );
      setGlobalMessage("Bilde lastet opp.");
    } finally {
      setUploadingByItem((current) => ({ ...current, [itemId]: false }));
    }
  }, []);

  const answeredCount = itemState.filter((item) => item.svar !== null).length;

  return (
    <div className="space-y-4">
      <div className="brand-card p-4 text-sm">
        <p>
          Besvart: {answeredCount}/{itemState.length}
        </p>
        <p className="mt-1 text-brand-ink/75">
          Autosave er aktiv. Endringer lagres lokalt sa du ikke mister data ved refresh.
        </p>
        {globalMessage ? <p className="mt-2 text-xs text-brand-ink/75">{globalMessage}</p> : null}
      </div>

      <div className="space-y-3">
        {itemState.map((item) => {
          const saveState = saveStateByItem[item.id] ?? "idle";
          const isUploading = uploadingByItem[item.id] ?? false;
          return (
            <article key={item.id} className="brand-card p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-brand-ink">
                  {item.rekkefolge}. {item.tekst}
                </h3>
                <span className="rounded-full bg-brand-canvas px-2 py-1 text-xs">{getChecklistAnswerLabel(item.svar)}</span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {checklistAnswerOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateItem(item.id, { svar: option.value })}
                    className={buttonClass(item.svar === option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <label className="mt-3 block text-sm font-medium">
                Kommentar
                <textarea
                  value={item.kommentar ?? ""}
                  onChange={(event) => updateItem(item.id, { kommentar: event.target.value })}
                  className="brand-input mt-1 min-h-20 resize-y"
                  maxLength={4000}
                />
              </label>

              <div className="mt-3 space-y-2">
                <label className="block text-sm font-medium">
                  Bilder
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={(event) => {
                      uploadAttachments(item.id, event.target.files).catch(() => {
                        setGlobalMessage("Kunne ikke laste opp bilde.");
                      });
                      event.currentTarget.value = "";
                    }}
                    className="mt-1 block w-full text-sm"
                  />
                </label>

                {isUploading ? <p className="text-xs text-brand-ink/75">Laster opp...</p> : null}

                {item.attachments.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {item.attachments.map((attachment) => (
                      <a key={attachment.id} href={attachment.filUrl} target="_blank" rel="noreferrer" className="block rounded-lg border border-black/10 p-1">
                        <Image
                          src={attachment.filUrl}
                          alt="Vedlegg"
                          width={180}
                          height={120}
                          className="h-24 w-full rounded object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>

              <p className="mt-3 text-xs text-brand-ink/70">
                {saveState === "saving" && "Lagrer..."}
                {saveState === "saved" && "Lagret"}
                {saveState === "error" && "Lagring feilet"}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
