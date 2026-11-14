/** Hands a Blob to the browser as a file download. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the click has been processed; the download keeps its own reference.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}
