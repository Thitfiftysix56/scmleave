export const MANAGER_ROLES = ['ADMIN', 'SUPER_CS'];
export const STAFF_ROLES = ['SUPER_CS', 'CS', 'STORE'];
export const isManager = (role) => MANAGER_ROLES.includes(role);
export const isStaff = (role) => STAFF_ROLES.includes(role);
