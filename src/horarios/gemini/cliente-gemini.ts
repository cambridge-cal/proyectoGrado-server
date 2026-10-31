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

export const MODELO_POR_DEFECTO = 'gemini-3.1-pro-preview';

/**
 * Cliente real con el SDK oficial @google/genai (sección 6.6). La clave se lee de
 * GEMINI_API_KEY y nunca se escribe en el código ni en los registros (RNF-23).
 */
@Injectable()
export class GeminiApi implements ClienteGemini {
  readonly configurado: boolean;
  readonly modelo: string;
  private readonly ai: GoogleGenAI | null;

  constructor(config: ConfigService) {
    const clave = config.get<string>('GEMINI_API_KEY')?.trim();
    this.modelo =
      config.get<string>('GEMINI_MODEL')?.trim() || MODELO_POR_DEFECTO;
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
        abortSignal: AbortSignal.timeout(solicitud.timeoutMs),
      },
    });
    return respuesta.text ?? '';
  }
}
