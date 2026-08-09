import { APP_VERSION, deleteRow, selectRows, updateRow } from './_db.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function clean(value, max = 900) { return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }

function eventId(type, occurredAt, suffix = '') {
  return `${clean(type, 80)}:${String(occurredAt || '')}:${clean(suffix, 120)}`;
}

export function makeEmergencyFlowEvent(type, title, message = '', occurredAt = new Date().toISOString(), metadata = {}) {
  return {
    id: eventId(type, occurredAt, metadata?.id || metadata?.requestId || ''),
    type: clean(type, 80),
    title: clean(title, 180),
    message: clean(message, 900),
    occurredAt,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    version: APP_VERSION
  };
}

function normaliseStoredEvents(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map((row) => ({
    id: clean(row?.id, 260) || eventId(row?.type, row?.occurredAt || row?.occurred_at, ''),
    type: clean(row?.type, 80),
    title: clean(row?.title, 180),
    message: clean(row?.message, 900),
    occurredAt: row?.occurredAt || row?.occurred_at || '',
    metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    version: clean(row?.version, 80) || APP_VERSION
  })).filter((row) => row.type && row.occurredAt);
}

export async function recordEmergencyFlowEvent(invitationId, event) {
  if (!invitationId || !event?.type) return [];
  const rows = await selectRows('emergency_access_invitations', `select=id,metadata&id=${eq(invitationId)}&limit=1`).catch(() => []);
  const invitation = rows?.[0];
  if (!invitation?.id) return [];
  const metadata = invitation.metadata && typeof invitation.metadata === 'object' ? invitation.metadata : {};
  const current = normaliseStoredEvents(metadata.flow_events);
  const nextEvent = makeEmergencyFlowEvent(event.type, event.title, event.message, event.occurredAt || new Date().toISOString(), event.metadata || {});
  const deduped = [nextEvent, ...current.filter((row) => row.id !== nextEvent.id)].slice(0, 120);
  await updateRow('emergency_access_invitations', `id=${eq(invitationId)}`, {
    metadata: { ...metadata, flow_events: deduped, flow_events_updated_at: new Date().toISOString(), version: APP_VERSION },
    updated_at: new Date().toISOString()
  });
  return deduped;
}

export function buildEmergencyFlowEvents(invitation, requests = []) {
  if (!invitation) return [];
  const events = normaliseStoredEvents(invitation.metadata?.flow_events);
  const add = (type, title, message, occurredAt, metadata = {}) => {
    if (!occurredAt) return;
    const row = makeEmergencyFlowEvent(type, title, message, occurredAt, metadata);
    if (!events.some((event) => event.id === row.id || (event.type === row.type && event.occurredAt === row.occurredAt))) events.push(row);
  };
  add('invitation_created', 'Trusted person invitation created', 'The trusted person flow was started.', invitation.created_at, { invitationId: invitation.id });
  add('invitation_sent', 'Invitation sent', 'The trusted person was emailed the nomination link.', invitation.sent_at, { invitationId: invitation.id });
  add('invitation_accepted', 'Invitation accepted', 'The trusted person accepted the nomination.', invitation.accepted_at, { invitationId: invitation.id });
  add('invitation_declined', 'Invitation declined', 'The trusted person declined the nomination.', invitation.declined_at, { invitationId: invitation.id });
  add('invitation_cancelled', 'Invitation cancelled', 'The account owner cancelled the invitation.', invitation.cancelled_at, { invitationId: invitation.id });
  for (const request of requests || []) {
    add('access_requested', 'Emergency access requested', 'The trusted person requested emergency access and the waiting period started.', request.requested_at, { requestId: request.id });
    add('owner_notified', 'Account owner notified', 'The account owner was notified of the emergency access request.', request.owner_notified_at, { requestId: request.id });
    add('request_cancelled', 'Emergency request cancelled', 'The emergency access request was cancelled before release.', request.cancelled_at, { requestId: request.id });
    add('release_ready', 'Emergency package ready', 'The waiting period completed and the prepared emergency package became available.', request.released_at || (request.status === 'release_ready' ? request.updated_at : ''), { requestId: request.id });
  }
  return events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 120);
}

export async function loadEmergencyFlow(invitationId) {
  if (!invitationId) return { invitation: null, requests: [], events: [] };
  const invitationRows = await selectRows('emergency_access_invitations', `select=*&id=${eq(invitationId)}&limit=1`).catch(() => []);
  const invitation = invitationRows?.[0] || null;
  if (!invitation) return { invitation: null, requests: [], events: [] };
  const requests = await selectRows('emergency_access_requests', `select=*&invitation_id=${eq(invitationId)}&order=requested_at.desc&limit=100`).catch(() => []);
  return { invitation, requests, events: buildEmergencyFlowEvents(invitation, requests) };
}

export async function resetEmergencyFlowToZero({ tenantId, userId }) {
  if (!tenantId || !userId) return { invitationsDeleted: 0 };
  const invitations = await selectRows('emergency_access_invitations', `select=id&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&limit=500`).catch(() => []);
  // Requests are ON DELETE CASCADE from invitations. Delete legacy rows as well so testing truly starts at zero.
  await deleteRow('emergency_access_invitations', `tenant_id=${eq(tenantId)}&user_id=${eq(userId)}`).catch(() => null);
  await deleteRow('emergency_requests', `tenant_id=${eq(tenantId)}&owner_user_id=${eq(userId)}`).catch(() => null);
  await deleteRow('emergency_users', `tenant_id=${eq(tenantId)}&owner_user_id=${eq(userId)}`).catch(() => null);
  return { invitationsDeleted: invitations.length };
}
