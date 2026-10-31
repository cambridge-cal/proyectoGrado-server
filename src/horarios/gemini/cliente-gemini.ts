import { GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Token de inyección: en las pruebas se reemplaza por un cliente simulado. */
export const CLIENTE_GEMINI = Symbol('CLIENTE_GEMINI');

export interface SolicitudGemini {
  instrucciones: string;
  mensaje: string;
  esquema: object;
  timeoutMs: number;
}

/** Lo único que el servidor necesita de la API: enviar un mensaje y recibir el texto JSON. */
export interface ClienteGemini {
  /** false si falta GEMINI_API_KEY: el horario se guarda sin validar (RNF-18). */
  readonly configurado: boolean;
  readonly modelo: string;
  generar(solicitud: SolicitudGemini): Promise<string>;
}

/**
 * Gemini 2.5 Flash: disponible en el plan gratuito de la API. Gemini 3.1 Pro tiene cuota 0
 * en ese plan; se puede usar con GEMINI_MODEL si la cuenta tiene facturación (RNF-30).
 */
export const MODELO_POR_DEFECTO = 'gemini-2.5-flash';

/** Tokens de razonamiento por defecto en los modelos 2.5: sin límite, Flash puede pasar de 60 s. */
export const PRESUPUESTO_RAZONAMIENTO_25 = 1024;

/**
 * Presupuesto de razonamiento ("thinking") para la petición. GEMINI_THINKING_BUDGET lo fija
 * (0 lo desactiva, -1 lo deja automático); si no está, se limita en los modelos 2.5 y los
 * demás usan el valor del modelo.
 */
export function presupuestoRazonamiento(
  modelo: string,
  valor: string | undefined,
): number | undefined {
  const numero = Number(valor);
  if (valor?.trim() && Number.isInteger(numero) && numero >= -1) return numero;
  return modelo.startsWith('gemini-2.5')
    ? PRESUPUESTO_RAZONAMIENTO_25
    : undefined;
}

/**
 * Cliente real con el SDK oficial @google/genai (sección 6.6). La clave se lee de
 * GEMINI_API_KEY y nunca se escribe en el código ni en los registros (RNF-23).
 */
@Injectable()
export class GeminiApi implements ClienteGemini {
  readonly configurado: boolean;
  readonly modelo: string;
  private readonly ai: GoogleGenAI | null;
  private readonly presupuesto: number | undefined;

  constructor(config: ConfigService) {
    const clave = config.get<string>('GEMINI_API_KEY')?.trim();
    this.modelo =
      config.get<string>('GEMINI_MODEL')?.trim() || MODELO_POR_DEFECTO;
    this.presupuesto = presupuestoRazonamiento(
      this.modelo,
      config.get<string>('GEMINI_THINKING_BUDGET'),
    );
    this.configurado = Boolean(clave);
    this.ai = clave ? new GoogleGenAI({ apiKey: clave }) : null;
  }

  async generar(solicitud: SolicitudGemini): Promise<string> {
    if (!this.ai) throw new Error('GEMINI_API_KEY no está configurada.');
    const respuesta = await this.ai.models.generateContent({
      model: this.modelo,
      contents: solicitud.mensaje,
      config: {
        systemInstruction: solicitud.instrucciones,
        responseMimeType: 'application/json',
        responseJsonSchema: solicitud.esquema,
        temperature: 0.2,
        ...(this.presupuesto === undefined
          ? {}
          : { thinkingConfig: { thinkingBudget: this.presupuesto } }),
        abortSignal: AbortSignal.timeout(solicitud.timeoutMs),
      },
    });
    return respuesta.text ?? '';
  }
}
