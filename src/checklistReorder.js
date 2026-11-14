function normaliseStoredChecklistLines(notes) {
  return String(notes || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => /^\[(x|X| )\]\s*/.test(line) ? line.replace(/^\[X\]/, '[x]') : `[ ] ${line}`);
}

function checklistLineDetails(line, index) {
  const match = String(line || '').trim().match(/^\[(x|X| )\]\s*(.*)$/);
  return {
    index,
    done: match ? match[1].toLowerCase() === 'x' : false,
    text: match ? match[2] : String(line || '').trim()
  };
}

export function reorderChecklistLines(notes, completedPosition = 'bottom', displayIndex = -1, direction = 0) {
  const lines = normaliseStoredChecklistLines(notes);
  const displayRows = lines.map(checklistLineDetails).filter((row) => row.text);
  if (completedPosition === 'bottom') {
    displayRows.sort((a, b) => Number(a.done) - Number(b.done) || a.index - b.index);
  }
  const nextDisplayIndex = Math.max(0, Math.min(displayRows.length - 1, displayIndex + Math.sign(direction)));
  if (!direction || displayIndex < 0 || displayIndex >= displayRows.length || displayIndex === nextDisplayIndex) {
    return { changed: false, notes: lines.join('\n'), displayIndex };
  }
  const movingRow = displayRows[displayIndex];
  const targetRow = displayRows[nextDisplayIndex];
  if (completedPosition === 'bottom' && movingRow.done !== targetRow.done) {
    return { changed: false, notes: lines.join('\n'), displayIndex };
  }
  const [movingLine] = lines.splice(movingRow.index, 1);
  const targetAfterRemoval = targetRow.index - (movingRow.index < targetRow.index ? 1 : 0);
  const insertionIndex = direction > 0 ? targetAfterRemoval + 1 : targetAfterRemoval;
  lines.splice(Math.max(0, Math.min(lines.length, insertionIndex)), 0, movingLine);
  return { changed: true, notes: lines.join('\n'), displayIndex: nextDisplayIndex };
}
