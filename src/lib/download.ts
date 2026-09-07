export function downloadJson(filename: string, value: unknown) {
  downloadText(filename, JSON.stringify(value, null, 2));
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
