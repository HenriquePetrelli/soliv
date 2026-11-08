/** PIX end-to-end id: 32 chars, starts with E (shown on every PIX receipt). */
export const isValidPixE2eId = (value: string): boolean => /^E[0-9A-Z]{31}$/.test(value.trim().toUpperCase());
