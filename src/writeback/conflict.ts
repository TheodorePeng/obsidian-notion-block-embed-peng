import { WritebackConflictPolicy } from "../core/settings";

interface ConflictInput {
  policy: WritebackConflictPolicy;
  localLastEditedTime?: string;
  remoteLastEditedTime?: string;
}

export function hasWriteConflict(input: ConflictInput): boolean {
  if (input.policy !== "fail_on_conflict") return false;
  if (!input.localLastEditedTime || !input.remoteLastEditedTime) return false;
  return input.localLastEditedTime !== input.remoteLastEditedTime;
}
