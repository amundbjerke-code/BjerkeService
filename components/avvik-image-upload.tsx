"use client";

import Image from "next/image";
import { useCallback, useState } from "react";

type Attachment = {
  id: string;
  filUrl: string;
  filType: string;
};

type Props = {
  avvikId: string;
  initialAttachments: Attachment[];
};

export function AvvikImageUpload({ avvikId, initialAttachments }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const uploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }

      setUploading(true);
      setMessage("");
      const formData = new FormData();
      for (const file of Array.from(files)) {
        formData.append("files", file);
      }

      try {
        const response = await fetch(`/api/avvik/${avvikId}/attachments`, {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          setMessage("Kunne ikke laste opp bilde.");
          return;
        }

        const payload = (await response.json()) as { data?: Attachment[] };
        const newAttachments = payload.data ?? [];
        setAttachments((current) => [...newAttachments, ...current]);
        setMessage("Bilde lastet opp.");
      } catch {
        setMessage("Feil ved opplasting.");
      } finally {
        setUploading(false);
      }
    },
    [avvikId]
  );

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Bilder
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(event) => {
            uploadFiles(event.target.files).catch(() => {
              setMessage("Feil ved opplasting.");
            });
            event.currentTarget.value = "";
          }}
          className="mt-1 block w-full text-sm"
        />
      </label>

      {uploading ? <p className="text-xs text-brand-ink/75">Laster opp...</p> : null}
      {message ? <p className="text-xs text-brand-ink/75">{message}</p> : null}

      {attachments.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.filUrl}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-black/10 p-1"
            >
              <Image
                src={attachment.filUrl}
                alt="Avviksvedlegg"
                width={180}
                height={120}
                className="h-24 w-full rounded object-cover"
              />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
