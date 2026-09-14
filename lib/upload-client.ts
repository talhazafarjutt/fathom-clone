"use client";

export type UploadTarget =
  | { mode: "direct"; url: string; key: string }
  | { mode: "post"; url: string; key: string };

/** XHR (not fetch) because we want real upload progress for large media files. */
export function uploadBlob(
  target: UploadTarget,
  blob: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.mode === "direct" ? "PUT" : "POST", target.url);
    xhr.setRequestHeader("content-type", contentType);
    if (target.mode === "post") xhr.setRequestHeader("x-storage-key", target.key);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    xhr.send(blob);
  });
}

/** Create meeting -> upload bytes -> start processing. Returns the meeting id. */
export async function createAndUpload(opts: {
  file: Blob;
  filename: string;
  contentType: string;
  source: "UPLOAD" | "RECORDING";
  title?: string;
  onProgress?: (fraction: number) => void;
}): Promise<string> {
  const createRes = await fetch("/api/meetings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: opts.filename,
      contentType: opts.contentType,
      sizeBytes: opts.file.size,
      source: opts.source,
      title: opts.title,
    }),
  });
  if (!createRes.ok) throw new Error("Could not create the meeting");
  const { meetingId, upload } = (await createRes.json()) as {
    meetingId: string;
    upload: UploadTarget;
  };

  await uploadBlob(upload, opts.file, opts.contentType, opts.onProgress);

  const ingestRes = await fetch(`/api/meetings/${meetingId}/ingest`, { method: "POST" });
  if (!ingestRes.ok) throw new Error("Upload saved, but processing could not start");

  return meetingId;
}
