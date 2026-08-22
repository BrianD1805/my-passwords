const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const APP_DATE_FORMATS = {
  DMY_NUMERIC: 'dmy-numeric',
  MDY_NUMERIC: 'mdy-numeric',
  DMY_TEXT: 'dmy-text'
};

export function normaliseAppDateFormat(value) {
  return Object.values(APP_DATE_FORMATS).includes(value) ? value : APP_DATE_FORMATS.DMY_TEXT;
}

export function formatAppDate(value, includeTime = false, fallback = '—', preferredFormat = APP_DATE_FORMATS.DMY_TEXT) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  const day = String(date.getDate()).padStart(2, '0');
  const monthNumber = String(date.getMonth() + 1).padStart(2, '0');
  const monthText = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const format = normaliseAppDateFormat(preferredFormat);
  const datePart = format === APP_DATE_FORMATS.MDY_NUMERIC
    ? `${monthNumber}/${day}/${year}`
    : format === APP_DATE_FORMATS.DMY_NUMERIC
      ? `${day}/${monthNumber}/${year}`
      : `${day}/${monthText}/${year}`;
  if (!includeTime) return datePart;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${datePart}, ${hours}:${minutes}`;
}
