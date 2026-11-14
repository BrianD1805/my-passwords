import fs from 'node:fs';
import path from 'node:path';
import { checklistDragStepCount, reorderChecklistLines } from '../src/checklistReorder.js';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
const styles = read('src/styles.css');
const retryPolicy = read('src/syncRetryPolicy.js');
const syncFunction = read('netlify/functions/sync-vault.js');
const clientErrorFunction = read('netlify/functions/client-error-report.js');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const pkg = JSON.parse(read('package.json'));
const brandLogo = fs.readFileSync(path.join(root, 'public/images/password-encrypt-brand.png'));
const tourLocatorStart = main.indexOf('const preferredTargetTop = window.innerWidth <= 860 ? 70 : 88');
const tourLocator = main.slice(tourLocatorStart - 500, tourLocatorStart + 900);
const checklistToggleStart = main.indexOf('async function toggleChecklistLine');
const checklistToggle = main.slice(checklistToggleStart, main.indexOf('if (isTrustedPersonReminderRoute)', checklistToggleStart));
const checklistViewStart = main.indexOf('<div className={`checklist-display');
const checklistView = main.slice(checklistViewStart, main.indexOf(")) : viewedItem.payload?.notes", checklistViewStart));
const reorderStart = '[ ] A\n[ ] B\n[ ] C\n[ ] D';
const reorderOneDown = reorderChecklistLines(reorderStart, 'stay', 0, 1);
const reorderTwoDown = reorderChecklistLines(reorderOneDown.notes, 'stay', reorderOneDown.displayIndex, 1);
const reorderOneUp = reorderChecklistLines(reorderTwoDown.notes, 'stay', reorderTwoDown.displayIndex, -1);
const reorderGroupBoundary = reorderChecklistLines('[ ] Open\n[x] Done', 'bottom', 0, 1);

const checks = [
  ['version aligned', pkg.version === '1.30.6' && main.includes('Password-Encrypt Ver-1.030.06') && db.includes('Password-Encrypt Ver-1.030.06') && sw.includes('my-passwords-v1.030.06') && offline.includes('Password-Encrypt Ver-1.030.06')],
  ['brand logo is a complete PNG rather than a truncated partial image', brandLogo.length === 25728 && brandLogo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && brandLogo.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]))],
  ['checklist editor example syntax is removed', main.includes("notes: 'Use one line per checklist item.'") && !main.includes('Use one line per checklist item. Example:')],
  ['new checklists default to staying in place with strikeout enabled', main.includes("checklistCompletedPosition: 'stay', checklistStrikeThrough: true")],
  ['checklist completion position is saved inside the encrypted item payload', main.includes("checklistCompletedPosition: form.checklistCompletedPosition === 'bottom' ? 'bottom' : 'stay'")],
  ['existing checklists retain their historical move-to-bottom behaviour', main.includes("checklistCompletedPosition: item.payload?.checklistCompletedPosition === 'stay' ? 'stay' : 'bottom'")],
  ['toggling completion preserves original stored order', checklistToggle.includes("const updatedNotes = normaliseChecklistNotes(lines.join('\\n'))") && !checklistToggle.includes('.sort(')],
  ['editor offers stay-or-bottom and strike-through controls', main.includes('Completed checklist item position') && main.includes('Keep it in place') && main.includes('Move it to the bottom') && main.includes('Strike through completed items')],
  ['checklist view includes completed count and accessible progress bar', main.includes('{checklistCompletedCount} of {checklistRows.length}') && main.includes('role="progressbar"') && main.includes('aria-valuenow={checklistCompletedCount}')],
  ['checklist display has flat circular checks and optional no-strikethrough styling', styles.includes('.checklist-progress-track') && styles.includes('border-radius: 50%') && styles.includes('.checklist-display.no-strikethrough .checklist-line.done .checklist-line-toggle > span:last-child')],
  ['Settings introduction has no language claim', main.includes('This tour clearly explains every Settings section.') && !main.includes('This tour explains every Settings section in everyday language.')],
  ['duplicate target outline is not activated', !main.includes("target.classList.add('guided-tour-target')")],
  ['spotlight outline is even and softer', /\.guided-tour-spotlight\s*\{[\s\S]*?border:\s*2px solid rgba\(255,255,255,0\.94\)/.test(styles) && /0 0 0 6px rgba\(49,93,126,0\.58\)/.test(styles) && /0 0 0 9999px rgba\(11,24,38,0\.5\)/.test(styles)],
  ['tour target is positioned near the top', main.includes('const preferredTargetTop = window.innerWidth <= 860 ? 70 : 88') && main.includes("window.scrollBy({ top: rect.top - preferredTargetTop, left: 0, behavior: 'smooth' })") && !tourLocator.includes("block: 'center'")],
  ['card is anchored below the measured highlight', main.includes('targetRect.top + targetRect.height + cardGap') && main.includes("'--guided-tour-card-top': `${cardTop}px`") && /\.guided-tour-target-layout \.guided-tour-card\s*\{[\s\S]*?top: var\(--guided-tour-card-top\)/.test(styles)],
  ['desktop and mobile use an intentional gap', main.includes('window.innerWidth <= 860 ? 18 : 24') && /max-height: calc\(100dvh - var\(--guided-tour-card-top\) - 18px\)/.test(styles) && /max-height: calc\(100dvh - var\(--guided-tour-card-top\) - 12px\)/.test(styles)],
  ['temporary tour scroll room is scoped and removable', main.includes("document.body.classList.add('guided-tour-active')") && main.includes("document.body.classList.remove('guided-tour-active')") && styles.includes('body.guided-tour-active #root')],
  ['separate Settings tour remains present', main.includes('const SETTINGS_GUIDED_TOUR_STEPS = [') && main.includes("kind: 'settings'") && main.includes('function startSettingsGuidedTour()')],
  ['Settings tour retains complete guided content', (main.slice(main.indexOf('const SETTINGS_GUIDED_TOUR_STEPS'), main.indexOf('function guidedTourSteps')).match(/chapter:/g) || []).length === 35],
  ['all Settings routes remain covered', ['overview', 'account', 'user-settings', 'subscription', 'safety', 'notifications', 'install', 'backup-codes', 'emergency-nominate', 'emergency-receive', 'faq'].every((section) => main.includes(`section: '${section}'`))],
  ['Settings disclosures still open automatically', main.includes("document.querySelectorAll('[data-settings-tour-disclosure]')") && main.includes('node.dataset.settingsTourDisclosure === step.disclosure')],
  ['both guided tours remain independently available', main.includes('<strong>Take the Settings tour</strong>') && main.includes('<strong>Take the guided tour</strong>')],
  ['stale Saving state remains normalised', retryPolicy.includes('normalisePersistedSyncSafetyState') && retryPolicy.includes("staleBackingUp ? 'backup-pending'")],
  ['Vault Status spinner remains live-only', !main.includes("syncing || syncSafety.state === 'backing-up'") && !main.includes("state: 'backing-up'")],
  ['finite retry policy remains present', retryPolicy.includes('30 * 1000') && retryPolicy.includes('2 * 60 * 1000') && retryPolicy.includes('10 * 60 * 1000') && retryPolicy.includes('return null')],
  ['backup failure diagnostic remains deduplicated', main.includes('recordBackupFailureOnce') && (main.match(/recordSyncEvent\('backup_failed'/g) || []).length === 1],
  ['server throttles remain present', syncFunction.includes("scope: 'vault_sync_backup'") && syncFunction.includes("scope: 'vault_sync_record_event'") && clientErrorFunction.includes("scope: 'client_error_report'")],
  ['onboarding flow structure remains present', main.includes('ONBOARDING_TOTAL_STEPS = 14') && main.includes('setLandingOnboardingStep(8)') && main.includes('setFinalOnboardingStep(13)') && main.includes('step === 14')],
  ['checklist edit mode uses normal row inputs instead of a raw marker textarea', main.includes('data-checklist-input-id={row.id}') && main.includes("form.category === 'Checklists' ? (") && !main.includes('placeholder="[ ]')],
  ['stored checklist markers are parsed out of editable text', main.includes('function parseChecklistEditorRows(notes)') && main.includes('const text = match ? match[2] : trimmed')],
  ['edited rows serialise back to the existing compatible checklist format', main.includes('function serialiseChecklistEditorRows(rows)') && main.includes("`${row.done ? '[x]' : '[ ]'} ${row.text}`") && main.includes('serialiseChecklistEditorRows(form.checklistItems)')],
  ['editor provides add, check and delete controls', main.includes('Add checklist item') && main.includes('Mark item as completed') && main.includes('Remove checklist item')],
  ['desktop removes the dotted drag handle and keeps arrow reordering', /\.checklist-editor-grip\s*\{[\s\S]*?display:\s*none;/.test(styles) && main.includes('aria-label="Move item up"') && main.includes('aria-label="Move item down"')],
  ['mobile grip uses a deliberate long press before reordering', main.includes('window.setTimeout(() => {') && main.includes('}, 420)') && main.includes('onPointerDown={(event) => startChecklistLongPress(event, row.id)}') && main.includes('onPointerMove={moveChecklistLongPress}')],
  ['editor pointer capture stays on the stationary list while rows move', main.includes("const dragSurface = event.currentTarget.closest?.('.checklist-editor-list')") && main.includes('<div className="checklist-editor-list" onPointerMove={moveChecklistLongPress} onPointerUp={resetChecklistPointerDrag} onPointerCancel={resetChecklistPointerDrag} onLostPointerCapture={resetChecklistPointerDrag}>') && !/<button[\s\S]{0,500}className="checklist-editor-grip"[\s\S]{0,700}onPointerMove=\{moveChecklistLongPress\}/.test(main)],
  ['editor reordering uses total finger distance instead of relying on repeated phone events', main.includes('function moveChecklistEditorRowBy(rowId, direction)') && main.includes('const requestedSteps = Math.max(') && main.includes('for (let step = 0; step < Math.abs(pendingSteps); step += 1)') && !main.includes("elementFromPoint(event.clientX, event.clientY)")],
  ['arrow controls and touch-safe drag styling provide reorder fallbacks', main.includes('aria-label="Move item up"') && main.includes('aria-label="Move item down"') && styles.includes('.checklist-editor-grip') && styles.includes('touch-action: none') && styles.includes('.checklist-editor-row.is-dragging')],
  ['mobile reordering avoids conflicting browser-native drag', main.includes('draggable={false}') && !main.includes('startChecklistNativeDrag') && !main.includes('moveChecklistNativeDrag')],
  ['mobile long press tolerates hand movement and resets pointer capture', main.includes('> 24') && main.includes('releasePointerCapture(state.pointerId)') && main.includes('onLostPointerCapture={resetChecklistPointerDrag}')],
  ['mobile view rows support direct press-and-hold reordering', checklistView.includes('startChecklistViewLongPress(event, viewedItem, displayIndex)') && checklistView.includes('onPointerMove={moveChecklistViewLongPress}') && checklistView.includes('onPointerUp={finishChecklistViewDrag}')],
  ['view pointer capture stays on the stationary checklist while rows move', main.includes("const dragSurface = event.currentTarget.closest?.('.checklist-display')") && checklistView.includes('onPointerMove={moveChecklistViewLongPress}') && checklistView.includes('onPointerCancel={finishChecklistViewDrag}') && !/data-checklist-view-row=\{displayIndex\}[\s\S]{0,600}onPointerMove=\{moveChecklistViewLongPress\}/.test(checklistView)],
  ['checklist rows live inside their own dedicated data-panel scroll area', checklistView.includes('className="checklist-lines-scroll"') && checklistView.includes('data-checklist-scroll-area="true"') && /\.checklist-lines-scroll\s*\{[\s\S]*?max-height:[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior-y:\s*contain;/.test(styles)],
  ['a swipe inside a checklist row scrolls the checklist data panel before long press activates', main.includes("const scrollElement = event.currentTarget.closest?.('.checklist-lines-scroll')") && !main.includes("const scrollElement = event.currentTarget.closest?.('.item-popup-card')") && main.includes('state.scrolling = true') && main.includes('state.scrollElement.scrollTop = state.startScrollTop - verticalMovement') && main.indexOf('if (state.scrolling)') < main.indexOf('if (!state.active) return;', main.indexOf('function moveChecklistViewLongPress'))],
  ['progress summary remains outside the independently scrolling rows', checklistView.indexOf('className="checklist-progress-summary"') < checklistView.indexOf('className="checklist-lines-scroll"') && !/checklist-lines-scroll[\s\S]{0,400}checklist-progress-summary/.test(checklistView)],
  ['popup card is restored as the bounded vertical scroll container', /\.item-popup-card,\s*\n\.item-form\.item-popup-card\s*\{[\s\S]*?overflow-y:\s*auto !important;[\s\S]*?overscroll-behavior:\s*contain;/.test(styles)],
  ['mobile view reordering also uses one measured row step', main.includes('function reorderChecklistViewItem(sourceItems, itemId, displayIndex, direction)') && main.includes('reorderChecklistLines(sourceItem.payload?.notes, settings.completedPosition, displayIndex, direction)') && main.includes('stepSize: Math.max(34, rowHeight * 0.72)') && main.includes('state.displayIndex = result.displayIndex')],
  ['view screen stays uncluttered without reorder handles or arrows', !checklistView.includes('<GripVertical') && !checklistView.includes('<ArrowUp') && !checklistView.includes('<ArrowDown')],
  ['selected mobile view row alone reveals a simple delete control', checklistView.includes('className="checklist-line-delete"') && checklistView.includes('deleteChecklistLine(viewedItem, row.index)') && styles.includes('.checklist-line.is-selected .checklist-line-delete')],
  ['view reorder saves the final order only when the gesture finishes', main.includes('checklistViewWorkingItemsRef.current = workingItems') && main.includes('const shouldSave = state.active && state.moved') && main.includes("showMessage('Checklist order updated.')")],
  ['one downward gesture moves exactly one position, not to the bottom', reorderOneDown.changed && reorderOneDown.notes === '[ ] B\n[ ] A\n[ ] C\n[ ] D' && reorderOneDown.displayIndex === 1],
  ['a second deliberate gesture moves one more position', reorderTwoDown.changed && reorderTwoDown.notes === '[ ] B\n[ ] C\n[ ] A\n[ ] D' && reorderTwoDown.displayIndex === 2],
  ['one upward gesture reverses exactly one position', reorderOneUp.changed && reorderOneUp.notes === '[ ] B\n[ ] A\n[ ] C\n[ ] D' && reorderOneUp.displayIndex === 1],
  ['move-to-bottom display does not cross the open/completed boundary', !reorderGroupBoundary.changed && reorderGroupBoundary.notes === '[ ] Open\n[x] Done'],
  ['one row-height of downward travel requests one move', checklistDragStepCount(100, 144, 44) === 1],
  ['three row-heights bundled into one phone event request three moves', checklistDragStepCount(100, 232, 44) === 3],
  ['bundled upward travel remains symmetrical', checklistDragStepCount(232, 100, 44) === -3]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} Ver-1.030.06 checks passed.`);
if (failed) process.exit(1);
