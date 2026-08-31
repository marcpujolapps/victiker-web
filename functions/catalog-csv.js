import * as XLSX from 'xlsx'

export function readCatalogRows(buffer) {
  // Keep CSV cells as text. With raw:false, SheetJS coerces a quoted value
  // such as "16,1100006103516" into 161100006103516 before we can parse it.
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true, codepage: 65001 })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  if (!rows.length) throw new Error('El archivo no contiene filas.')
  return rows
}

export function parseCatalogNumber(value) {
  if (typeof value === 'number') return value

  const text = String(value ?? '').trim().replace(/\s/g, '').replace(/[^0-9,.-]/g, '')
  if (!text) return NaN

  const commaIndex = text.lastIndexOf(',')
  const dotIndex = text.lastIndexOf('.')
  let normalized = text

  if (commaIndex >= 0 && dotIndex >= 0) {
    // The last separator is the decimal separator when both are present.
    const decimalSeparator = commaIndex > dotIndex ? ',' : '.'
    const groupingSeparator = decimalSeparator === ',' ? '.' : ','
    normalized = text.replaceAll(groupingSeparator, '').replace(decimalSeparator, '.')
  } else if (commaIndex >= 0) {
    normalized = (text.match(/,/g) || []).length > 1 ? text.replaceAll(',', '') : text.replace(',', '.')
  } else if ((text.match(/\./g) || []).length > 1) {
    // Multiple dots are grouping separators in values such as 1.234.567.
    normalized = text.replaceAll('.', '')
  }

  return Number(normalized)
}
