# Password-Encrypt Ver-1.031.2

## Checklist background saving and actions

Ver-1.031.2 removes the checklist Save button and makes background saving the only normal save path. It also makes saving visible without interrupting the checklist and expands the three-dot action menu.

## Background-only saving

- Checklist edits, additions, ticks, unticks, deletions, renames, option changes and reorders are saved automatically after 1.8 seconds without another edit.
- The old `Save & close` button is completely removed.
- A small spinner appears in the header immediately to the left of the three-dot menu while a background save is running.
- Several quick changes are still batched into one background write.
- Revision tracking still protects edits made while an earlier save is running.
- A failed revision remains blocked from automatic repeat attempts, preventing an unlimited save loop.
- Closing the list still flushes any outstanding change. If that write fails, the list stays open and shows the existing error message.

## Updated time and completed items

- The checklist footer now shows the last successfully updated date and time.
- The footer time changes only after a successful persisted save.
- When completed items are set to move to the bottom, a light `Completed` divider appears between the open and completed groups.
- The divider is not shown when only one group exists or when completed items are configured to stay in place.

## Expanded three-dot menu

- Added `Untick all` to clear every completed tick in the in-memory draft with one action.
- `Untick all` is disabled when nothing is ticked.
- The menu now opens as a wider right-side panel and reaches the right and bottom edges of the checklist popup.
- Clicking the shaded area closes the menu without closing the checklist.
- `Close list` remains the final action.

## Version alignment

- App: Password-Encrypt Ver-1.031.2
- package.json/package-lock.json: 1.31.2
- Service worker cache: my-passwords-v1.031.2
- Server APP_VERSION: Password-Encrypt Ver-1.031.2

## Deployment notes

- No Supabase SQL migration is required.
- No Netlify environment-variable change is required.
- Close and reopen the installed app once after deployment so the new service-worker cache takes over.

## Automated verification

- Production build passed.
- 389 automated checks passed.
- The Ver-1.031.2 feature suite contains 74 checks, including dedicated coverage for removal of the Save button, background-save spinner placement and animation, successful-save timestamps, completed-group separation, Untick all behaviour, the expanded right-side menu, bounded failed saves, mobile movement and scrolling regressions.
