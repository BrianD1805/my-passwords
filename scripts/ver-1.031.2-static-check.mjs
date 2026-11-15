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

function functionSource(name) {
  const start = main.indexOf(`function ${name}`);
  if (start < 0) return '';
  const end = main.indexOf('\n  function ', start + 12);
  return main.slice(start, end < 0 ? main.length : end);
}

const saveChecklist = functionSource('persistChecklistDraft');
const changedDraft = functionSource('markChecklistDraftChanged');
const quickAdd = functionSource('addChecklistLineFromView');
const draftToggle = functionSource('toggleChecklistDraftRow');
const draftDelete = functionSource('deleteChecklistDraftRow');
const draftUpdate = functionSource('updateChecklistDraftRow');
const untickAll = functionSource('untickAllChecklistRows');
const dragStart = functionSource('beginChecklistViewLongPress');
const dragMove = functionSource('moveChecklistViewReorder');
const dragFinish = functionSource('finishChecklistViewDrag');
const checklistViewStart = main.indexOf('<div ref={checklistViewSurfaceRef}');
const checklistView = main.slice(checklistViewStart, main.indexOf(")) : viewedItem.payload?.notes", checklistViewStart));
const checklistHeaderStart = main.indexOf('className={`item-popup-header view-item-popup-header');
const checklistHeader = main.slice(checklistHeaderStart, main.indexOf('className="item-popup-body view-item-popup-body"', checklistHeaderStart));
const tourLocatorStart = main.indexOf('const preferredTargetTop = window.innerWidth <= 860 ? 70 : 88');
const tourLocator = main.slice(tourLocatorStart - 500, tourLocatorStart + 900);

const reorderStart = '[ ] A\n[ ] B\n[ ] C\n[ ] D';
const reorderOneDown = reorderChecklistLines(reorderStart, 'stay', 0, 1);
const reorderTwoDown = reorderChecklistLines(reorderOneDown.notes, 'stay', reorderOneDown.displayIndex, 1);
const reorderOneUp = reorderChecklistLines(reorderTwoDown.notes, 'stay', reorderTwoDown.displayIndex, -1);
const reorderGroupBoundary = reorderChecklistLines('[ ] Open\n[x] Done', 'bottom', 0, 1);
const draftOperations = [quickAdd, draftToggle, draftDelete, draftUpdate, dragMove, dragFinish].join('\n');

const checks = [
  ['version aligned', pkg.version === '1.31.2' && main.includes('Password-Encrypt Ver-1.031.2') && db.includes('Password-Encrypt Ver-1.031.2') && sw.includes('my-passwords-v1.031.2') && offline.includes('Password-Encrypt Ver-1.031.2')],
  ['brand logo remains a complete PNG', brandLogo.length === 25728 && brandLogo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && brandLogo.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]))],
  ['checklist editor example syntax remains removed', main.includes("notes: 'Use one line per checklist item.'") && !main.includes('Use one line per checklist item. Example:')],
  ['new checklists default to staying in place with strike-through enabled', main.includes("checklistCompletedPosition: 'stay', checklistStrikeThrough: true")],
  ['stored checklist markers stay compatible', main.includes('function parseChecklistEditorRows(notes)') && main.includes('function serialiseChecklistEditorRows(rows)') && main.includes("`${row.done ? '[x]' : '[ ]'} ${row.text}`")],

  ['opening a checklist creates an isolated in-memory draft', main.includes("if (effectiveVaultItemType(item) === 'Checklists') setChecklistDraft(createChecklistViewDraft(item))") && main.includes('function createChecklistViewDraft(item)')],
  ['draft contains title rows options favourite and dirty state', main.includes("const [checklistDraft, setChecklistDraft] = useState({ itemId: '', title: '', rows: [], completedPosition: 'stay', strikeThrough: true, favourite: false, dirty: false")],
  ['all everyday checklist mutations are draft-only', !draftOperations.includes('saveItems(') && !draftOperations.includes('showMessage(')],
  ['draft changes use a monotonically increasing revision', changedDraft.includes('revision: current.revision + 1') && changedDraft.includes('dirty: true')],
  ['quick add appends to the draft instead of immediately saving', quickAdd.includes('markChecklistDraftChanged((current) =>') && !quickAdd.includes('saveItems(')],
  ['inline text edits update only the draft row', draftUpdate.includes('current.rows.map') && draftUpdate.includes('markChecklistDraftChanged')],
  ['circle toggle updates only the chosen row', draftToggle.includes('row.id === rowId') && draftToggle.includes('done: !row.done') && draftToggle.includes('markChecklistDraftChanged')],
  ['item deletion filters only the chosen draft row', draftDelete.includes('current.rows.filter((row) => row.id !== rowId)') && draftDelete.includes('markChecklistDraftChanged')],
  ['background saving uses one shared persisted checklist write', (saveChecklist.match(/saveItems\(/g) || []).length === 1 && saveChecklist.includes('if (draft.saving) return;')],
  ['unchanged checklists close without a write', saveChecklist.includes('if (!draft.dirty)') && saveChecklist.includes('closeViewItem();')],
  ['failed final save keeps the checklist open for retry', saveChecklist.includes('saving: false, dirty: true') && saveChecklist.includes('The checklist could not be saved. Please try again.')],
  ['background save is debounced to batch several quick edits', main.includes('window.setTimeout(() => persistChecklistDraft({ background: true }), 1800)')],
  ['background save failures do not retry forever', main.includes('blockedRevision === checklistDraft.revision') && saveChecklist.includes('blockedRevision = savingRevision')],
  ['background save suppresses offline interruption', main.includes('suppressOfflineNotice: options.suppressOfflineNotice === true') || (main.includes('const suppressOfflineNotice = options.suppressOfflineNotice === true') && saveChecklist.includes('suppressOfflineNotice: background'))],
  ['checklist Save button is completely removed', !main.includes('Save & close') && !main.includes('saveChecklistAndClose') && !styles.includes('.checklist-save-close-button')],
  ['background-save spinner sits immediately before the three-dot menu', /checklist-background-save-indicator[\s\S]*?checklistDraft\.saving[\s\S]*?<RefreshCw[\s\S]*?checklist-menu-button/.test(checklistHeader) && /\.checklist-background-save-indicator\s*\{[\s\S]*?width:\s*38px;[\s\S]*?height:\s*38px;/.test(styles) && styles.includes('@keyframes checklist-background-spin')],
  ['spinner is visible and animated only while saving', styles.includes('.checklist-background-save-indicator.is-saving') && styles.includes('.checklist-background-save-indicator.is-saving svg') && checklistHeader.includes("checklistDraft.saving ? 'is-saving' : ''")],
  ['successful saves record one timestamp for the item and footer', saveChecklist.includes('const savedAt = new Date().toISOString()') && saveChecklist.includes('updatedAt: savedAt') && saveChecklist.includes('lastSavedAt: savedAt') && main.includes('checklistDraft.lastSavedAt || viewedItem.updatedAt')],
  ['header close backdrop and hardware back share save-on-exit', (main.match(/onClick=\{requestCloseViewItem\}/g) || []).length >= 2 && main.includes('requestCloseViewItem(); return true;')],
  ['checklist no longer opens the old edit popup', functionSource('editViewedItem').includes("if (effectiveVaultItemType(item) === 'Checklists') return;")],
  ['checklist footer contains only the updated date and time', main.includes('className="checklist-updated-footer"') && !main.includes('checklist-save-close-button') && styles.includes('.checklist-updated-footer')],

  ['every checklist item is an individually rounded card', /\.checklist-draft-display \.checklist-line\s*\{[\s\S]*?border:\s*1px solid #d7e1e8;[\s\S]*?border-radius:\s*18px;[\s\S]*?background:\s*#fff;/.test(styles)],
  ['checklist item text uses normal weight', /\.checklist-line-text\s*\{[\s\S]*?font-weight:\s*400 !important;/.test(styles)],
  ['single click changes item text to an inline editor', checklistView.includes('onClick={() => { if (!importedItem) editChecklistDraftRow(row.id); }}') && checklistView.includes('className="checklist-line-inline-input"') && checklistView.includes('data-checklist-inline-input={row.id}')],
  ['opening an item for delete does not automatically open the keyboard', !functionSource('editChecklistDraftRow').includes('.focus()') && !checklistView.includes('autoFocus')],
  ['long inline text wraps instead of disappearing off the left edge', checklistView.includes('<textarea data-checklist-inline-input={row.id}') && /\.checklist-line-inline-input\s*\{[\s\S]*?white-space:\s*pre-wrap;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?overflow-x:\s*hidden;/.test(styles)],
  ['inline editor offers a distinct one-item delete control', checklistView.includes('className="checklist-line-delete"') && checklistView.includes('deleteChecklistDraftRow(row.id)') && checklistView.includes('Delete this checklist item')],
  ['item delete stays usable when the text input would otherwise blur', checklistView.includes('event.preventDefault(); event.stopPropagation();')],
  ['only the circular check control toggles completion', checklistView.includes('className="checklist-line-check"') && checklistView.includes('toggleChecklistDraftRow(row.id)') && checklistView.includes('onPointerDown={(event) => event.stopPropagation()}') && !checklistView.includes('checklist-line-toggle')],
  ['strike-through applies to item text rather than the whole pill', styles.includes('.checklist-line.done .checklist-line-text') && !styles.includes('.checklist-draft-display .checklist-line.done {\n  text-decoration')],
  ['rounded quick-add control matches checklist pills', checklistView.includes('className="checklist-quick-add"') && /\.view-item-popup-card \.checklist-quick-add\s*\{[\s\S]*?border-radius:\s*18px;/.test(styles) && /\.view-item-popup-card \.checklist-quick-add input\s*\{[\s\S]*?border:\s*0 !important;/.test(styles)],
  ['progress stays in the fixed header with count and percentage', checklistHeader.includes('className="checklist-header-progress"') && checklistHeader.includes('{completed} of {headerRows.length} · {percentage}%') && checklistHeader.includes('role="progressbar"')],
  ['view header pills retain compact vertical padding', /\.view-item-meta \.category-pill\s*\{[\s\S]*?padding-top:\s*3px !important;[\s\S]*?padding-bottom:\s*3px !important;/.test(styles)],
  ['completed group has a labelled separator only between both groups', main.includes("const firstCompletedIndex = checklistSettings.completedPosition === 'bottom'") && checklistView.includes('firstCompletedIndex > 0 && displayIndex === firstCompletedIndex') && checklistView.includes('className="checklist-completed-divider"') && styles.includes('.checklist-completed-divider::before')],

  ['three-dot menu is present in the checklist header', checklistHeader.includes('className="icon-button checklist-menu-button"') && checklistHeader.includes('aria-label="Checklist menu"') && checklistHeader.includes('className="checklist-overflow-menu"')],
  ['menu contains rename favourite completion and strike-through options', ['Rename checklist', 'Add to favourites', 'Keep completed items in place', 'Move completed items to bottom', 'Remove completed strike-through', 'Strike through completed items'].every((label) => checklistHeader.includes(label))],
  ['menu owns the whole-checklist delete action', checklistHeader.includes('Delete whole checklist') && checklistHeader.includes('requestDeleteItem(viewedItem)')],
  ['menu includes a draft-only Untick all action', checklistHeader.includes('Untick all') && untickAll.includes('current.rows.map((row) => ({ ...row, done: false }))') && untickAll.includes('markChecklistDraftChanged') && !untickAll.includes('saveItems(')],
  ['Untick all is disabled when no item is completed', checklistHeader.includes('disabled={!checklistDraft.rows.some((row) => row.done)}')],
  ['menu expands as a right-side sheet to the popup bottom', checklistHeader.includes('className="checklist-menu-layer"') && /\.checklist-menu-layer\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*0;[\s\S]*?bottom:\s*0;[\s\S]*?left:\s*0;/.test(styles) && /\.checklist-overflow-menu\s*\{[\s\S]*?height:\s*100%;/.test(styles)],
  ['Close list is the final three-dot menu action', /Delete whole checklist[\s\S]*?className="close-list"[\s\S]*?Close list/.test(checklistHeader)],
  ['whole-checklist confirmation clearly differs from item deletion', main.includes('Delete whole checklist?') && main.includes('This deletes the checklist and every item inside it. This is different from deleting one checklist item')],

  ['long press enters dragging while the same contact is still held', dragStart.includes("state.phase = 'dragging'") && dragStart.includes('state.active = true') && dragStart.includes("state.inputMode === 'pointer'")],
  ['mobile has a dedicated native touch-start path', main.includes("surface.addEventListener('touchstart', handleTouchStart, { passive: true })") && main.includes("inputMode: 'touch'") && main.includes('touch.identifier')],
  ['touch reordering is not cancelled by the parallel pointer-cancel event', functionSource('finishChecklistViewPointerDrag').includes("inputMode !== 'pointer'") && checklistView.includes('onPointerCancel={finishChecklistViewPointerDrag}')],
  ['old lift-and-press-again drag phase is gone', !main.includes("phase = 'selected'") && !main.includes('Item selected. Lift your finger') && !main.includes('alreadySelected')],
  ['scoped non-passive touch fallback exists only on checklist surface', main.includes("surface.addEventListener('touchmove', handleTouchMove, { passive: false })") && main.includes("surface.removeEventListener('touchmove', handleTouchMove)") && !main.includes("document.addEventListener('touchmove', moveChecklist")],
  ['dragging can move several measured row steps in one gesture', dragMove.includes('while (pendingSteps)') && dragMove.includes('state.appliedSteps += direction') && dragMove.includes('checklistDragStepCount(state.startY, currentY + scrollTravel, state.stepSize)')],
  ['dragging auto-scrolls the one popup body near its edges', dragMove.includes("closest?.('.view-item-popup-body')") && dragMove.includes('scrollBody.scrollTop +=') && dragMove.includes('scrollBody.scrollTop -=')],
  ['move-to-bottom mode blocks crossing open and completed groups', dragMove.includes('checklistDraftRef.current.completedPosition')],
  ['drag completion does not save or show a per-move message', !dragFinish.includes('saveItems(') && !dragFinish.includes('showMessage(')],
  ['view remains uncluttered without drag handles or arrows', !checklistView.includes('<GripVertical') && !checklistView.includes('<ArrowUp') && !checklistView.includes('<ArrowDown')],
  ['popup body remains the single native scrolling surface', /\.view-item-popup-card \.view-item-popup-body\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?touch-action:\s*pan-y;/.test(styles) && !checklistView.includes('checklist-lines-scroll')],
  ['mobile rows retain normal native scrolling outside an active drag', /\.checklist-draft-display,[\s\S]*?touch-action:\s*auto !important;/.test(styles) && main.includes("if (!state.active || state.phase !== 'dragging') return;")],

  ['one downward step changes exactly one position', reorderOneDown.changed && reorderOneDown.notes === '[ ] B\n[ ] A\n[ ] C\n[ ] D' && reorderOneDown.displayIndex === 1],
  ['a second downward step moves one more position', reorderTwoDown.changed && reorderTwoDown.notes === '[ ] B\n[ ] C\n[ ] A\n[ ] D' && reorderTwoDown.displayIndex === 2],
  ['upward movement remains symmetrical', reorderOneUp.changed && reorderOneUp.notes === '[ ] B\n[ ] A\n[ ] C\n[ ] D' && reorderOneUp.displayIndex === 1],
  ['helper blocks crossing the open-completed boundary', !reorderGroupBoundary.changed && reorderGroupBoundary.notes === '[ ] Open\n[x] Done'],
  ['one row-height requests one move', checklistDragStepCount(100, 144, 44) === 1],
  ['three row-heights bundled into one phone event request three moves', checklistDragStepCount(100, 232, 44) === 3],
  ['bundled upward travel remains symmetrical', checklistDragStepCount(232, 100, 44) === -3],

  ['Settings introduction retains the English-only wording', main.includes('This tour clearly explains every Settings section.') && !main.includes('This tour explains every Settings section in everyday language.')],
  ['guided-tour spotlight remains even and toned down', /\.guided-tour-spotlight\s*\{[\s\S]*?border:\s*2px solid rgba\(255,255,255,0\.94\)/.test(styles) && /0 0 0 6px rgba\(49,93,126,0\.58\)/.test(styles)],
  ['tour target remains positioned near the top', main.includes('const preferredTargetTop = window.innerWidth <= 860 ? 70 : 88') && !tourLocator.includes("block: 'center'")],
  ['Settings tour remains complete', main.includes('const SETTINGS_GUIDED_TOUR_STEPS = [') && (main.slice(main.indexOf('const SETTINGS_GUIDED_TOUR_STEPS'), main.indexOf('function guidedTourSteps')).match(/chapter:/g) || []).length === 35],
  ['finite backup retry policy remains present', retryPolicy.includes('30 * 1000') && retryPolicy.includes('2 * 60 * 1000') && retryPolicy.includes('10 * 60 * 1000') && retryPolicy.includes('return null')],
  ['backup failure diagnostic remains deduplicated', main.includes('recordBackupFailureOnce') && (main.match(/recordSyncEvent\('backup_failed'/g) || []).length === 1],
  ['server throttles remain present', syncFunction.includes("scope: 'vault_sync_backup'") && syncFunction.includes("scope: 'vault_sync_record_event'") && clientErrorFunction.includes("scope: 'client_error_report'")],
  ['onboarding flow structure remains present', main.includes('ONBOARDING_TOTAL_STEPS = 14') && main.includes('setLandingOnboardingStep(8)') && main.includes('setFinalOnboardingStep(13)') && main.includes('step === 14')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} Ver-1.031.2 checks passed.`);
if (failed) process.exit(1);

