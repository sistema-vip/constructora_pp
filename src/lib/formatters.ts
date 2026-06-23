/**
 * Utilidades para el formato de moneda estándar venezolano/europeo (1.500,00)
 */

/**
 * Convierte un número o string numérico al formato visual 1.555.701,01
 */
export function formatCurrency(value: number | string): string {
  if (value === '' || value === null || value === undefined) return '';
  const num = parseCurrency(value);
  if (isNaN(num)) return '';
  
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

/**
 * Limpia un string y lo convierte a número puro (ej: 1.500,50 -> 1500.50, o 10.50 -> 10.50)
 */
export function parseCurrency(value: string | number): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;

  let str = String(value).replace(/[^\d.,-]/g, '').trim();
  
  const commas = (str.match(/,/g) || []).length;
  const dots = (str.match(/\./g) || []).length;

  if (commas === 0 && dots === 1) {
    // Si solo hay un punto, y tiene 1 o 2 dígitos al final (ej: "10.00"), es decimal
    if (/\.\d{1,2}$/.test(str)) {
      return parseFloat(str) || 0;
    } else {
      // Si no, es un punto de miles (ej: "1.500")
      return parseFloat(str.replace(/\./g, '')) || 0;
    }
  }

  // Formato con comas (es-VE)
  let cleanStr = str.replace(/\./g, '');
  const lastComma = cleanStr.lastIndexOf(',');
  if (lastComma !== -1) {
    cleanStr = cleanStr.substring(0, lastComma) + '.' + cleanStr.substring(lastComma + 1);
  }
  cleanStr = cleanStr.replace(/,/g, '');

  return parseFloat(cleanStr) || 0;
}

/**
 * Filtra la entrada del usuario para permitir solo números, puntos y comas.
 * No formatea en vivo para permitir al usuario escribir libremente (ej: 10.00).
 */
export function handleMoneyInput(value: string): string {
  return value.replace(/[^\d.,]/g, '');
}

/**
 * Función para el evento onBlur: asegura que siempre haya decimales al salir (ej: 25.000,00)
 */
export function formatOnBlur(value: string): string {
  if (!value) return '';
  
  // Limpiar y convertir a número
  const num = parseCurrency(value);
  
  // Devolver formateado con 2 decimales obligatorios
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}
