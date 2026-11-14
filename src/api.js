// Single place for HTTP access to the server. Every call checks res.ok and throws a readable error.
async function request(path, options) {
  const res = await fetch(`/api/v1${path}`, options);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // The body was not JSON; keep the generic message.
    }
    throw new Error(message);
  }
  return res.json();
}

const jsonBody = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  getSong: () => request('/song'),
  saveSong: (song) => request('/song', jsonBody('PUT', song)),
  newSong: (starter) => request('/song/new', jsonBody('POST', { starter })),
  getAiSettings: () => request('/settings/ai'),
  saveAiKey: (apiKey) => request('/settings/ai', jsonBody('PUT', { apiKey })),
  removeAiKey: () => request('/settings/ai', { method: 'DELETE' }),
  getTaste: () => request('/taste'),
  compose: (choices) => request('/machina/compose', jsonBody('POST', choices)),
};
