import { BadRequestException, Logger } from '@nestjs/common';

/**
 * Google Gemini (free tier of Google AI Studio) — the no-cost AI behind the
 * log-pile photo analysis and the in-app assistant.
 *
 * Needs GEMINI_API_KEY on the server (free key from aistudio.google.com, no
 * card). GEMINI_MODEL picks the model; if that name no longer exists (Google
 * retires model names over time), the first available "flash" model is used,
 * so the feature does not silently die when a model is renamed.
 */
const logger = new Logger('Gemini');
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
let resolvedModel: string | null = null;

export function geminiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

export interface GeminiTurn {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

async function pickModel(key: string): Promise<string> {
  if (resolvedModel) return resolvedModel;
  const wanted = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  try {
    const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
    if (res.ok) {
      const data: any = await res.json();
      const names: string[] = (data?.models ?? [])
        .filter((m: any) => (m?.supportedGenerationMethods ?? []).includes('generateContent'))
        .map((m: any) => String(m.name).replace(/^models\//, ''));
      if (names.includes(wanted)) resolvedModel = wanted;
      else {
        // Newest stable "flash" model: cheap, fast, accepts images, free tier.
        const flash = names.filter((n) => /flash/.test(n) && !/(lite|image|tts|live|preview|exp|thinking)/.test(n)).sort().reverse();
        resolvedModel = flash[0] ?? names.find((n) => /flash/.test(n)) ?? wanted;
        logger.warn(`Model ${wanted} not available; using ${resolvedModel}`);
      }
      return resolvedModel;
    }
  } catch (e: any) {
    logger.warn(`Could not list Gemini models: ${e?.message}`);
  }
  return wanted;
}

/** Calls Gemini and returns the text of the answer. */
export async function geminiGenerate(opts: {
  system: string;
  turns: GeminiTurn[];
  json?: boolean;
  timeoutMs?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new BadRequestException('A IA ainda não foi ativada no servidor (falta a chave gratuita do Google AI Studio).');
  const model = await pickModel(key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120000);
  let res: Response;
  try {
    res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: opts.turns,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: opts.maxOutputTokens ?? 8192,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new BadRequestException('A IA demorou demais para responder. Tente de novo.');
    throw new BadRequestException('Não foi possível falar com a IA. Tente de novo em instantes.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error(`Gemini ${res.status}: ${body.slice(0, 500)}`);
    if (res.status === 429) throw new BadRequestException('Limite gratuito da IA atingido por agora. Espere 1 minuto e tente de novo.');
    if (res.status === 400 && /API key/i.test(body)) throw new BadRequestException('A chave da IA no servidor é inválida.');
    if (res.status === 403) throw new BadRequestException('A chave da IA no servidor não tem permissão. Gere outra no Google AI Studio.');
    if (res.status === 404) resolvedModel = null; // model retired: re-pick next time
    throw new BadRequestException(`A IA respondeu com erro (${res.status}). Tente de novo.`);
  }

  const data: any = await res.json();
  const cand = data?.candidates?.[0];
  if (!cand) {
    const reason = data?.promptFeedback?.blockReason;
    throw new BadRequestException(reason ? 'A IA recusou esta imagem/pergunta. Tente outra.' : 'A IA não respondeu. Tente de novo.');
  }
  return (cand.content?.parts ?? []).map((p: any) => p?.text ?? '').join('');
}

/** "data:image/jpeg;base64,..." → Gemini inline image part. */
export function imagePart(dataUri: string): GeminiPart {
  const m = dataUri.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) throw new BadRequestException('Formato de imagem não suportado (use JPEG ou PNG).');
  return { inline_data: { mime_type: m[1], data: m[2] } };
}
