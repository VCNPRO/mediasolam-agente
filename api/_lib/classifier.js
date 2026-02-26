import { VertexAI } from "@google-cloud/vertexai";

const SYSTEM_PROMPT = `Eres un experto clasificador de licitaciones públicas B2B para VCNpro AI. Clasifica este contrato en una de estas apps: SCRIPTORIUMIA, VERBADOCSALUD, ANNALYSISMEDIA, VERBADOCPRO, VIDEOCONVERSION, o DESCARTADO.

Devuelve SOLO un JSON válido con estas claves:
- Aplicacion_Mediasolam: una de las 6 opciones anteriores
- Nivel_de_Encaje: exactamente uno de ALTO, MEDIO o BAJO
- Presupuesto_Estimado: string con importe estimado (ej: "150.000 EUR") o "No especificado"
- Resumen_Ejecutivo: resumen de 1-2 frases
- Angulo_de_Venta: estrategia de venta en 1-2 frases`;

let vertexClient = null;

export function getVertexClient() {
  if (vertexClient) return vertexClient;

  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!credentialsJson) {
    throw new Error("GOOGLE_CREDENTIALS_JSON no está configurada");
  }

  const credentials = JSON.parse(credentialsJson);

  vertexClient = new VertexAI({
    project: process.env.GOOGLE_PROJECT_ID,
    location: "europe-west4",
    googleAuthOptions: { credentials },
  });

  return vertexClient;
}

export function buildPrompt(item) {
  return `${SYSTEM_PROMPT}\n\nTítulo: ${item.title}\nDescripción: ${item.summary}`;
}

export async function classifyItem(item, model) {
  const prompt = buildPrompt(item);
  const result = await model.generateContent(prompt);
  const response = result.response;
  const text =
    response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  return JSON.parse(text);
}
