// Speech-to-text for voice notes via OpenAI Whisper. Used by the get_voice_notes
// chatbot tool so Lina can read back what a recorded note actually says.

export async function transcribeAudio(bytes: Uint8Array, filename: string): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("Transcription is not configured (no OPENAI_API_KEY).");
  const form = new FormData();
  form.append("file", new Blob([bytes]), filename);
  form.append("model", "whisper-1");
  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Whisper ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  return String(data.text ?? "").trim();
}
