// Resources are declared with implementation, never created by a browser form.
// Module Master will reconcile these stable keys without overwriting eligibility.
export const businessLineResource = Object.freeze({
 key: 'BUSINESS_LINES', name: 'Business Lines', type: 'module',
 section: 'Administration', subsection: 'Core Masters', route: '#business-lines',
 implementationStatus: 'Available', registration: 'automatic',
 systemLocked: true, superAdminOnly: true,
 actions: ['read', 'create', 'edit', 'archive', 'restore', 'export', 'history'],
 supportsImport: false, supportsDelete: false
});
export const resources = Object.freeze([businessLineResource]);
