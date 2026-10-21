// Resources are declared with implementation, never created by a browser form.
// Module Master will reconcile these stable keys without overwriting eligibility.
const actions=Object.freeze([
 'read','create','edit','archive','restore','softDelete','restoreDeleted','reassignOwner','export','history',
 'search','filter','settings','dashboard'
]);
export const businessLineResource = Object.freeze({
 key: 'BUSINESS_LINES', name: 'Business Lines', type: 'module',
 section: 'Administration', subsection: 'Core Masters', route: '#business-lines',
 implementationStatus: 'Available', registration: 'automatic',
 systemLocked: true, superAdminOnly: true, actions,
 supportsImport: true, supportsDelete: false
});

/**
 * Current server policy is deliberately restricted to approved, verified Super
 * Admins. Only database field names are accepted. A future Role Matrix may narrow
 * these grants centrally; request JSON and browser state never provide grants.
 *
 * settings permits personal workspace presentation preferences, not organization
 * administration. dashboard permits the module's existing authorized counts.
 */
export function businessLinePermissions(user){
 const eligible=user?.system_role==='super_admin'&&user.email_verified===true&&user.status==='approved';
 return Object.freeze(Object.fromEntries([
  ...actions.map(action=>[action,eligible]),
  ['import',eligible],['delete',false]
 ]));
}
export const resources = Object.freeze([businessLineResource]);
