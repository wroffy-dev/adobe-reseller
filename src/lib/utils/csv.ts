/**
 * RFC 4180 CSV serialisation.
 *
 * Cells beginning with =, +, -, @ or a control character are prefixed with an
 * apostrophe so a spreadsheet treats them as text rather than a formula.
 */
export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
}

/**
 * RFC 4180 CSV parsing — quoted cells, doubled quotes, CRLF or LF, a leading
 * byte-order mark. The apostrophe `toCsv` adds before a formula-looking cell
 * is removed again, so an exported file re-imports unchanged.
 */
export function parseCsv(text: string, maxRows = 10_000): string[][] {
  const input = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let wasQuoted = false;

  const pushCell = () => {
    const value = wasQuoted && /^'[=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell;
    row.push(value);
    cell = '';
    wasQuoted = false;
  };
  const pushRow = () => {
    pushCell();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === '') {
      quoted = true;
      wasQuoted = true;
    } else if (char === ',') {
      pushCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      pushRow();
      if (rows.length >= maxRows) return rows;
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) pushRow();
  return rows;
}
