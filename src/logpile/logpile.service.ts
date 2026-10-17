import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface LogDetection {
  id: number;
  diameterCm: number;
  /** Radius as a fraction of image WIDTH (0-1) — used to draw the circle overlay. */
  radiusNorm: number;
  areaM2: number;
  volumeM3: number;
  centerX: number;
  centerY: number;
}

export interface LogPileResult {
  totalLogs: number;
  logs: LogDetection[];
  averageDiameterCm: number;
  totalVolumeM3: number;
  logLengthM: number;
  analysisNotes: string;
  /** 'referencia' = real scale from the reference object; 'estimado' = model guess. */
  calibration: 'referencia' | 'estimado';
  /** Real-world width of the whole image in cm, when calibration succeeded. */
  imageWidthCm: number | null;
  confidence: string;
}

export interface QuickScanLog {
  centerX: number;
  centerY: number;
  approxDiameterCm: number;
  radiusNorm: number;
}

export interface QuickScanResult {
  logCount: number;
  logs: QuickScanLog[];
  confidence: string;
}

@Injectable()
export class LogPileService {
  private readonly logger = new Logger(LogPileService.name);

  constructor(private config: ConfigService) {}

  /**
   * Analyze a base64 image of a log pile using LLM Vision API.
   * Returns detected logs with diameters and volume estimates.
   */
  /**
   * Ensure image base64 is in proper data URI format.
   * Strips any whitespace/newlines that React Native bridge might add.
   */
  private sanitizeBase64(raw: string): string {
    if (!raw || raw.length < 100) {
      this.logger.error(`Base64 too short: length=${raw?.length ?? 0}`);
      throw new BadRequestException('Imagem inválida ou vazia');
    }

    // Remove any whitespace/newlines that RN bridge might inject
    let cleaned = raw.replace(/\s/g, '');

    // If it already has a data URI prefix, validate and return
    if (cleaned.startsWith('data:image/')) {
      // Verify the base64 part exists after the comma
      const commaIdx = cleaned.indexOf(',');
      if (commaIdx === -1 || commaIdx >= cleaned.length - 10) {
        throw new BadRequestException('Formato de imagem inválido');
      }
      this.logger.log(`Base64 image: data URI format, total length=${cleaned.length}, base64 part length=${cleaned.length - commaIdx - 1}`);
      return cleaned;
    }

    // If it's raw base64 without prefix, add JPEG prefix
    // Validate it looks like base64
    if (/^[A-Za-z0-9+/=]+$/.test(cleaned.substring(0, 100))) {
      this.logger.log(`Base64 image: raw format, adding data URI prefix, length=${cleaned.length}`);
      return `data:image/jpeg;base64,${cleaned}`;
    }

    this.logger.error(`Base64 image: unrecognized format. First 100 chars: ${raw.substring(0, 100)}`);
    throw new BadRequestException('Formato de imagem não reconhecido');
  }

  /**
   * Extract a JSON object from LLM content that may be wrapped in
   * markdown fences (```json ... ```) or contain extra prose.
   */
  private extractJson(content: string): any {
    if (!content) throw new Error('Empty LLM content');
    let cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end > start) {
        return JSON.parse(cleaned.substring(start, end + 1));
      }
      throw new Error('No JSON object found in LLM content');
    }
  }

  /**
   * Vision call through the Claude API (official SDK).
   *
   * Replaces the Abacus-hosted chat endpoint, so the app no longer depends on
   * an Abacus key. Needs ANTHROPIC_API_KEY on the server; the model can be
   * changed with VISION_MODEL. Server-side fallbacks are on: if the model
   * declines a request, the API re-runs it on a fallback model in the same
   * call instead of failing the analysis.
   */
  private async callVisionApi(
    systemPrompt: string,
    dataUri: string,
    userText: string,
    timeoutMs = 120000,
  ): Promise<string> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new BadRequestException('Análise por IA não configurada no servidor (ANTHROPIC_API_KEY).');
    }
    const m = dataUri.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
    if (!m) throw new BadRequestException('Formato de imagem não suportado (use JPEG ou PNG).');
    const mediaType = m[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const client = new Anthropic({ timeout: timeoutMs, maxRetries: 1 });
    try {
      const response = await client.beta.messages.create({
        model: process.env.VISION_MODEL || 'claude-opus-5-5',
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: m[2] } },
              { type: 'text', text: userText },
            ],
          },
        ],
      } as any);

      if (response.stop_reason === 'refusal') {
        throw new BadRequestException('A IA não analisou esta imagem. Tente outra foto.');
      }
      return response.content
        .map((b: any) => (b.type === 'text' ? b.text : ''))
        .join('');
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      if (e instanceof Anthropic.APIConnectionTimeoutError) {
        throw new BadRequestException('A análise demorou demais. Tente com uma foto menor ou verifique sua conexão.');
      }
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new BadRequestException('Chave da API de IA inválida no servidor.');
      }
      if (e instanceof Anthropic.RateLimitError) {
        throw new BadRequestException('Muitas análises seguidas. Aguarde um minuto e tente de novo.');
      }
      if (e instanceof Anthropic.APIError) {
        this.logger.error(`Vision API failed: ${e.status} ${e.message}`);
        if (e.status === 413) {
          throw new BadRequestException('Imagem muito grande para análise. Tire a foto novamente.');
        }
        throw new BadRequestException(`Falha na análise da imagem (código ${e.status}). Tente novamente.`);
      }
      throw e;
    }
  }

  async analyzeLogPile(
    imageBase64: string,
    logLengthM: number,
    referenceScaleCm?: number,
  ): Promise<LogPileResult> {

    // Sanitize the base64
    const cleanBase64 = this.sanitizeBase64(imageBase64);

    // KEY ACCURACY CHANGE:
    // A vision model cannot know absolute centimetres from pixels — asking it
    // for "diameterCm" directly was guesswork, which is why the numbers looked
    // wrong. We now ask only for GEOMETRY it can actually see (normalized
    // positions and radii) and derive centimetres ourselves from a reference
    // object of known size. Without a reference we still return a value, but
    // flag it as an estimate.
    const scaleHint = referenceScaleCm
      ? `Há um objeto de referência na imagem cujo tamanho REAL é ${referenceScaleCm} cm ` +
        `(ex.: régua, trena, lata de spray, capacete). Meça a LARGURA desse objeto na imagem ` +
        `e informe em "referenceWidthNorm" como fração da largura total da imagem (0 a 1). ` +
        `Isso é OBRIGATÓRIO e é o dado mais importante da sua resposta.`
      : `Não há objeto de referência. Informe "referenceWidthNorm": null e estime ` +
        `"estimatedPileWidthCm" (largura real aproximada de TODA a imagem em cm), ` +
        `usando proporções típicas de pilhas florestais.`;

    const systemPrompt = `Você é um especialista em inventário florestal e cubagem de madeira.
Analise a foto de uma pilha de toras empilhadas (vista frontal dos topos circulares).

TAREFA — para CADA tora cujo topo circular esteja visível, informe:
- id: número sequencial começando em 1
- centerX: centro horizontal do círculo, normalizado 0.0 (borda esquerda) a 1.0 (borda direita)
- centerY: centro vertical do círculo, normalizado 0.0 (topo) a 1.0 (base)
- radiusNorm: RAIO do círculo como fração da LARGURA da imagem (ex.: 0.04 = 4% da largura)

REGRAS DE PRECISÃO (siga com rigor):
1. Varra a imagem sistematicamente: da esquerda para a direita, de cima para baixo, faixa por faixa.
2. Conte APENAS topos circulares nítidos. Não conte sombras, espaços vazios, cascas soltas nem toras cortadas pela borda em menos da metade.
3. NÃO conte a mesma tora duas vezes. Antes de adicionar, verifique se já existe uma tora com centro a menos de um raio de distância.
4. centerX/centerY devem cair DENTRO do círculo da tora, exatamente no seu centro geométrico.
5. radiusNorm deve corresponder ao raio REAL do círculo na imagem — não use um valor padrão para todas.
6. Se houver muitas toras, seja completo: é comum uma pilha ter de 20 a 200 toras.

${scaleHint}

Responda APENAS com JSON puro (sem markdown, sem texto fora do JSON):
{
  "logs": [{"id": 1, "centerX": 0.31, "centerY": 0.52, "radiusNorm": 0.045}],
  "referenceWidthNorm": 0.08,
  "estimatedPileWidthCm": 300,
  "confidence": "alta",
  "notes": "Observações sobre a análise"
}`;

    this.logger.log(`Analyzing log pile image... (payload ${(cleanBase64.length / (1024 * 1024)).toFixed(2)} MB base64)`);

    try {
      const content = await this.callVisionApi(
        systemPrompt,
        cleanBase64,
        'Analise esta pilha de toras. Identifique cada tora visível, estime o diâmetro e forneça a posição. Responda em JSON.',
      );

      let parsed: any;
      try {
        parsed = this.extractJson(content);
      } catch (e) {
        this.logger.error('Failed to parse LLM response:', content?.substring(0, 500));
        throw new BadRequestException('Resposta inválida da IA. Tente com outra foto.');
      }

      const rawLogs: any[] = parsed?.logs ?? [];
      this.logger.log(`Detected ${rawLogs.length} logs in image`);

      // ---- Derive the real-world scale ----
      // With a reference object we get true centimetres. Without one we fall
      // back to the model's rough estimate of the pile width and say so.
      let imageWidthCm: number | null = null;
      let calibration: 'referencia' | 'estimado' = 'estimado';

      const refWidthNorm = parseFloat(parsed?.referenceWidthNorm);
      if (referenceScaleCm && isFinite(refWidthNorm) && refWidthNorm > 0.001 && refWidthNorm < 1) {
        imageWidthCm = referenceScaleCm / refWidthNorm;
        calibration = 'referencia';
        this.logger.log(`Calibrated: reference ${referenceScaleCm}cm = ${refWidthNorm} of width -> image is ${imageWidthCm.toFixed(1)}cm wide`);
      } else {
        const est = parseFloat(parsed?.estimatedPileWidthCm);
        if (isFinite(est) && est > 10 && est < 5000) imageWidthCm = est;
      }

      // ---- Deduplicate: reject logs whose centres overlap heavily ----
      // The model occasionally reports the same log twice, which inflated the count.
      const accepted: any[] = [];
      for (const l of rawLogs) {
        const cx = parseFloat(l?.centerX ?? l?.center_x);
        const cy = parseFloat(l?.centerY ?? l?.center_y);
        if (!isFinite(cx) || !isFinite(cy) || cx < 0 || cx > 1 || cy < 0 || cy > 1) continue;
        const r = parseFloat(l?.radiusNorm ?? l?.radius_norm);
        const rad = isFinite(r) && r > 0.002 && r < 0.5 ? r : 0.03;

        const dup = accepted.some((a) => {
          const dx = a.cx - cx;
          const dy = a.cy - cy;
          return Math.sqrt(dx * dx + dy * dy) < Math.max(rad, a.rad) * 0.7;
        });
        if (dup) continue;
        accepted.push({ cx, cy, rad, raw: l });
      }
      if (accepted.length !== rawLogs.length) {
        this.logger.log(`Deduplicated ${rawLogs.length - accepted.length} overlapping detections`);
      }

      const logs: LogDetection[] = accepted.map((a, idx) => {
        // Diameter from geometry + scale; only fall back to the model's own
        // centimetre guess when we have no scale at all.
        let diam: number;
        if (imageWidthCm) {
          diam = a.rad * 2 * imageWidthCm;
        } else {
          diam = parseFloat(a.raw?.diameterCm ?? a.raw?.diameter_cm ?? 0) || 25;
        }
        // Clamp to physically plausible forestry values.
        diam = Math.min(200, Math.max(5, diam));

        const radiusM = diam / 200;
        const area = Math.PI * radiusM * radiusM;
        const vol = area * logLengthM;
        return {
          id: idx + 1,
          diameterCm: Math.round(diam * 10) / 10,
          radiusNorm: Math.round(a.rad * 10000) / 10000,
          areaM2: Math.round(area * 10000) / 10000,
          volumeM3: Math.round(vol * 10000) / 10000,
          centerX: Math.round(a.cx * 10000) / 10000,
          centerY: Math.round(a.cy * 10000) / 10000,
        };
      });

      const totalVolume = logs.reduce((s, l) => s + l.volumeM3, 0);
      const avgDiam = logs.length > 0
        ? logs.reduce((s, l) => s + l.diameterCm, 0) / logs.length
        : 0;

      const baseNotes = parsed?.notes ?? '';
      const calibNote = calibration === 'referencia'
        ? `Escala calibrada pelo objeto de referência de ${referenceScaleCm}cm.`
        : 'ATENÇÃO: sem objeto de referência na foto, os diâmetros são ESTIMADOS e podem ter erro alto. Coloque uma régua, trena ou objeto de tamanho conhecido encostado na pilha e informe a medida no campo "Ref. escala".';

      return {
        totalLogs: logs.length,
        logs,
        averageDiameterCm: Math.round(avgDiam * 10) / 10,
        totalVolumeM3: Math.round(totalVolume * 10000) / 10000,
        logLengthM,
        analysisNotes: `${baseNotes} ${calibNote}`.trim(),
        calibration,
        imageWidthCm: imageWidthCm ? Math.round(imageWidthCm * 10) / 10 : null,
        confidence: parsed?.confidence ?? 'media',
      };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error('Log pile analysis error:', err?.message);
      throw new BadRequestException('Erro ao analisar imagem: ' + (err?.message ?? 'desconhecido'));
    }
  }

  /**
   * Quick scan for real-time preview — fast count + rough positions.
   * Uses a shorter prompt for faster LLM response.
   */
  async quickScan(imageBase64: string): Promise<QuickScanResult> {

    // Sanitize
    let cleanBase64: string;
    try {
      cleanBase64 = this.sanitizeBase64(imageBase64);
    } catch (e) {
      this.logger.warn('Quick scan: invalid image, returning empty');
      return { logCount: 0, logs: [], confidence: 'baixa' };
    }

    const prompt = `Analise esta imagem de pilha de toras (vista dos topos circulares).
Localize cada topo circular NÍTIDO e informe o centro e o raio.

- centerX/centerY: centro do círculo, normalizados 0-1 (X: esquerda->direita, Y: topo->base).
  O centro deve cair DENTRO do círculo da tora.
- radiusNorm: raio do círculo como fração da LARGURA da imagem.

Não conte a mesma tora duas vezes e ignore sombras e vãos entre toras.

Responda APENAS em JSON:
{"logs": [{"centerX": 0.3, "centerY": 0.5, "radiusNorm": 0.04}], "confidence": "alta|media|baixa"}`;

    try {
      const content = await this.callVisionApi(
        'Você é um detector rápido de toras de madeira. Responda apenas em JSON.',
        cleanBase64,
        prompt,
        30000,
      );

      const parsed = this.extractJson(content);

      // Same dedup pass as the full analysis — the live counter was drifting
      // because duplicate detections were being counted.
      const acc: QuickScanLog[] = [];
      for (const l of (parsed?.logs ?? [])) {
        const cx = parseFloat(l?.centerX);
        const cy = parseFloat(l?.centerY);
        if (!isFinite(cx) || !isFinite(cy) || cx < 0 || cx > 1 || cy < 0 || cy > 1) continue;
        const r = parseFloat(l?.radiusNorm);
        const rad = isFinite(r) && r > 0.002 && r < 0.5 ? r : 0.035;
        if (acc.some((a) => Math.hypot(a.centerX - cx, a.centerY - cy) < Math.max(rad, a.radiusNorm) * 0.7)) continue;
        acc.push({
          centerX: cx,
          centerY: cy,
          radiusNorm: rad,
          approxDiameterCm: parseFloat(l?.approxDiameterCm ?? l?.diameterCm ?? 0) || 0,
        });
      }

      return {
        logCount: acc.length,
        logs: acc,
        confidence: parsed?.confidence ?? 'media',
      };
    } catch (err: any) {
      this.logger.error('Quick scan error:', err?.message);
      return { logCount: 0, logs: [], confidence: 'baixa' };
    }
  }
}
