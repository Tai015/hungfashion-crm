export const CHAT_STAFF_ROLES = Object.freeze(['ADMIN', 'QL_KHACH_HANG']);
export const CHAT_ROLES = Object.freeze([...CHAT_STAFF_ROLES, 'KHACH_HANG']);

export const isChatStaff = role => CHAT_STAFF_ROLES.includes(role);
export const canUseChat = role => CHAT_ROLES.includes(role);
