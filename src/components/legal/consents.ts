import { LegalDocumentId, LegalUserType, termsPageFor } from "@/lib/legal";

export type ConsentKey = "age_18" | "terms" | "health_data_consent";
export type ConsentState = Record<ConsentKey, boolean>;

export const EMPTY_CONSENTS: ConsentState = { age_18: false, terms: false, health_data_consent: false };

export const consentKeysFor = (userType: LegalUserType, documents?: LegalDocumentId[]): ConsentKey[] => {
  const keys: ConsentKey[] = [];
  const needs = (doc: LegalDocumentId) => !documents || documents.includes(doc);
  if (needs("age_18")) keys.push("age_18");
  if (needs(termsPageFor(userType).id) || needs("privacy_policy")) keys.push("terms");
  if (userType === "patient" && needs("health_data_consent")) keys.push("health_data_consent");
  return keys;
};

export const allConsentsGiven = (state: ConsentState, keys: ConsentKey[]) => keys.every((key) => state[key]);
