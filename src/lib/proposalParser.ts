export interface ParsedProposalForm {
  title: string;
  clientName: string;
  date: string;
  area: string;
  objective: string;
  phases: string;
  workItems: { id: string; description: string; price: string }[];
  investmentModality: string;
  time: string;
  amount: string;
  payment: string;
  currency: string;
  paymentMethods: string;
}

export const DEFAULT_TODO_COSTO = 'La presente propuesta técnica y económica ha sido estructurada bajo la modalidad "A Todo Costo". Esta condición establece que el monto total presupuestado contempla el suministro integral de todos los materiales e insumos requeridos para la ejecución, así como los costos de fletes, maquinarias, herramientas menores, consumibles y la disposición de mano de obra altamente calificada. Nuestro compromiso es entregar el proyecto 100% terminado, operativo y con los más altos estándares de calidad, relevando al cliente de cualquier gestión de compras, procura o gastos operativos adicionales.';
export const DEFAULT_MANO_OBRA = 'La presente propuesta técnica y económica ha sido estructurada bajo la modalidad de "Solo Mano de Obra". Bajo esta condición, P&P CONSTRUYE se encarga exclusivamente de la disposición de mano de obra altamente calificada y las herramientas necesarias para la ejecución del proyecto. El suministro integral de todos los materiales e insumos requeridos, así como los costos de fletes de los mismos, son responsabilidad directa del cliente.';
export const DEFAULT_MATERIALES = 'La presente propuesta técnica y económica ha sido estructurada bajo la modalidad de "Solo Materiales" (Suministro de Materiales). Bajo esta condición, P&P CONSTRUYE se encarga exclusivamente de la procura, suministro y entrega en obra de la totalidad de los materiales especificados en la propuesta técnica. La contratación, supervisión y pago de la mano de obra para la ejecución, así como las herramientas y equipos necesarios para la instalación de los mismos, son responsabilidad directa y exclusiva del cliente.';

export function detectModalityType(text?: string): 'todo-costo' | 'mano-obra' | 'materiales' | 'personalizado' {
  if (!text) return 'todo-costo';
  const lower = text.toLowerCase();
  if (lower.includes('todo costo') || lower.includes('a todo costo')) return 'todo-costo';
  if (lower.includes('mano de obra')) return 'mano-obra';
  if (lower.includes('solo materiales') || lower.includes('materiales')) return 'materiales';
  return 'personalizado';
}

export function parseDateToIsoYmd(dateStr?: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  
  // Format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  
  // Format DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Format ISO with T
  if (trimmed.includes('T')) {
    return trimmed.split('T')[0];
  }

  return '';
}

/**
 * Parsea de forma determinista y sin depender de IA el texto completo de una propuesta
 * preservando el 100% de la información original y formateándola para el modal de edición.
 */
export function parseProposalTextLocally(rawText?: string | null): ParsedProposalForm {
  const result: ParsedProposalForm = {
    title: '',
    clientName: '',
    date: '',
    area: '',
    objective: '',
    phases: '',
    workItems: [],
    investmentModality: DEFAULT_TODO_COSTO,
    time: '',
    amount: '',
    payment: '60% anticipo / 40% al finalizar',
    currency: 'Divisas',
    paymentMethods: 'Este presupuesto está expresado en divisas. Métodos de pago: Efectivo, Zelle y Binance.'
  };

  if (!rawText || typeof rawText !== 'string') {
    return result;
  }

  // Normalizar saltos de línea y quitar etiquetas innecesarias
  const text = rawText
    .replace(/\r\n/g, '\n')
    .replace(/^---\s*/g, '')
    .replace(/\s*---$/g, '')
    .trim();

  if (!text) return result;

  const getMatch = (regex: RegExp) => {
    const m = text.match(regex);
    return m && m[1] ? m[1].trim() : '';
  };

  // 1. Título
  const title = getMatch(/(?:^|\n)\s*(?:Proyecto|PROYECTO)\s*:\s*([^\n]+)/i);
  if (title) result.title = title;

  // 2. Fecha
  const dateStr = getMatch(/(?:^|\n)\s*(?:Fecha|FECHA)\s*:\s*([^\n]+)/i);
  if (dateStr) {
    const parsedYmd = parseDateToIsoYmd(dateStr);
    result.date = parsedYmd || dateStr;
  }

  // 3. Cliente
  const clientName = getMatch(/(?:^|\n)\s*(?:Para|PARA|Cliente|CLIENTE)\s*:\s*([^\n]+)/i);
  if (clientName) result.clientName = clientName;

  // 4. Área de ejecución
  const area = getMatch(/(?:^|\n)\s*(?:Área(?: de Ejecución| del Proyecto)?|AREA(?: DE EJECUCIÓN| DEL PROYECTO)?|Area(?: de Ejecucion| del Proyecto)?)\s*:\s*([^\n]+)/i);
  if (area) result.area = area;

  // 5. Objetivo del Proyecto
  const objMatch = text.match(/(?:Objetivo del Proyecto|OBJETIVO DEL PROYECTO|Objetivo|OBJETIVO)\s*\n+([\s\S]*?)(?=\n+\s*(?:Fases del Trabajo|FASES DEL TRABAJO|Alcance Técnico|ALCANCE TÉCNICO|Tiempo de Ejecución|TIEMPO DE EJECUCIÓN|Presupuesto de Inversión|PRESUPUESTO DE INVERSIÓN|INVERSIÓN TOTAL|INVERSION TOTAL|$))/i);
  if (objMatch && objMatch[1]) {
    result.objective = objMatch[1].trim();
  }

  // 6. Fases del Trabajo (Alcance Técnico)
  const phasesMatch = text.match(/(?:Fases del Trabajo|FASES DEL TRABAJO|Alcance Técnico|ALCANCE TÉCNICO)(?:\s*\([^\)]*\))?\s*\n+([\s\S]*?)(?=\n+\s*(?:Tiempo de Ejecución|TIEMPO DE EJECUCIÓN|Presupuesto de Inversión|PRESUPUESTO DE INVERSIÓN|INVERSIÓN TOTAL|INVERSION TOTAL|Condiciones y Métodos|CONDICIONES Y MÉTODOS|$))/i);
  if (phasesMatch && phasesMatch[1]) {
    let phasesText = phasesMatch[1].trim();

    // Extraer y separar Desglose de Inversión si fue adjuntado dentro de Fases
    const breakdownIndex = phasesText.search(/(?:Desglose de (?:Inversión|Partidas)|DESGLOSE DE (?:INVERSIÓN|PARTIDAS))/i);
    if (breakdownIndex !== -1) {
      const breakdownPart = phasesText.substring(breakdownIndex);
      phasesText = phasesText.substring(0, breakdownIndex).trim();

      const lines = breakdownPart.split('\n');
      for (const line of lines) {
        // Coincide con líneas como "1. Pintura .... $500" o "- Tuberías: $350"
        const itemM = line.match(/^\s*(?:\d+[\.\)]|\-|\*|•)?\s*(.*?)(?:\s*\.{2,}|\s*:|\s*—|\s*\.{1,})\s*\$?\s*([\d,.]+)\s*$/);
        if (itemM && itemM[1] && itemM[2]) {
          const desc = itemM[1].trim();
          if (desc && !desc.toLowerCase().startsWith('desglose') && !desc.toLowerCase().startsWith('total')) {
            result.workItems.push({
              id: Math.random().toString(36).substr(2, 9),
              description: desc,
              price: itemM[2].trim()
            });
          }
        }
      }
    }

    result.phases = phasesText;
  }

  // 7. Tiempo de Ejecución y Entrega
  const time = getMatch(/(?:Tiempo de Ejecución y Entrega|TIEMPO DE EJECUCIÓN Y ENTREGA|Tiempo de Ejecución|TIEMPO DE EJECUCIÓN|Tiempo de Entrega)\s*:\s*([^\n]+)/i);
  if (time) {
    result.time = time;
  } else {
    // Probar si el tiempo de ejecución está en la línea siguiente al encabezado
    const timeBlockMatch = text.match(/(?:Tiempo de Ejecución y Entrega|TIEMPO DE EJECUCIÓN Y ENTREGA|Tiempo de Ejecución|TIEMPO DE EJECUCIÓN)\s*\n+([^\n]+)/i);
    if (timeBlockMatch && timeBlockMatch[1]) {
      const line = timeBlockMatch[1].trim();
      if (!line.toLowerCase().startsWith('presupuesto') && !line.toLowerCase().startsWith('inversión')) {
        result.time = line;
      }
    }
  }

  // 8. Presupuesto de Inversión (Modalidad)
  const modalityMatch = text.match(/(?:Presupuesto de Inversión[^\n]*|PRESUPUESTO DE INVERSIÓN[^\n]*)\s*\n+([\s\S]*?)(?=\n+\s*(?:INVERSIÓN TOTAL|INVERSION TOTAL|Condiciones y Métodos|CONDICIONES Y MÉTODOS|$))/i);
  if (modalityMatch && modalityMatch[1]) {
    result.investmentModality = modalityMatch[1].trim();
  }

  // 9. Monto de Inversión Total
  const amountMatch = text.match(/(?:INVERSIÓN TOTAL|INVERSION TOTAL|Inversión Total|Inversion Total|MONTO TOTAL|Monto Total)\s*:\s*\$?([0-9.,]+)/i);
  if (amountMatch && amountMatch[1]) {
    result.amount = amountMatch[1].trim();
  }

  // 10. Condiciones y Métodos de Pago
  const payment = getMatch(/(?:Esquema de Pago|ESQUEMA DE PAGO|Condiciones de Pago|CONDICIONES DE PAGO)\s*:\s*([^\n]+)/i);
  if (payment) {
    result.payment = payment;
  } else {
    const condBlock = text.match(/(?:Condiciones y Métodos de Pago|CONDICIONES Y MÉTODOS DE PAGO)\s*\n+([\s\S]*?)(?=\n+\s*(?:Moneda de Pago|Tasa de Cambio|Formas de Pago|$))/i);
    if (condBlock && condBlock[1]) {
      result.payment = condBlock[1].trim();
    }
  }

  // 11. Moneda de Pago
  const currency = getMatch(/(?:Moneda de Pago|MONEDA DE PAGO|Tasa de Cambio|TASA DE CAMBIO)\s*:\s*([^\n]+)/i);
  if (currency) result.currency = currency;

  // 12. Formas de Pago
  const paymentMethods = getMatch(/(?:Formas de Pago|FORMAS DE PAGO|Métodos de pago|MÉTODOS DE PAGO)\s*:\s*([^\n]+)/i);
  if (paymentMethods) result.paymentMethods = paymentMethods;

  // 13. Respaldo por si no tiene encabezados estándar:
  // Si no se encontró objetivo ni fases pero sí hay texto largo en rawText, asignarlo
  // para que NUNCA se borre la información del usuario
  if (!result.objective && !result.phases && text.length > 0) {
    result.objective = text;
  }

  return result;
}
