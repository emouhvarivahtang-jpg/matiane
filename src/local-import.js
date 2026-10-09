import { CloudWriter, api, ApiError } from "./api";
import {
  localListBooks,
  localLoadBook,
  localSaveBook,
  localDeleteBook,
} from "./model";

// Keep the guest original until both the server copy and its local link are saved.
// A stable request key lets this resume safely after a disconnect or browser restart.
export async function importGuestBooks(
  owner,
  { onProgress = () => {}, onSaved = () => {} } = {},
) {
  if (!owner || owner === "guest") throw new Error("An account is required");
  const guests = await localListBooks("guest");
  const saved = new Map(),
    errors = [];
  let done = 0;
  onProgress({ done, total: guests.length });
  for (const guest of guests) {
    try {
      const source = await localLoadBook(guest.id, "guest");
      if (!source) continue;
      const account = await localLoadBook(guest.id, owner);
      let snapshot = source.book;
      let info = account?.cloud?.id
        ? { id: account.cloud.id, revision: account.cloud.revision }
        : null;
      if (info && account.updatedAt >= source.updatedAt) {
        snapshot = account.book;
        // An older guest draft may remain from an earlier manual save. Preserve the account's latest book.
        if (!account.cloud.pending) {
          const remote = await api("/books/" + info.id);
          info = { id: remote.id, revision: remote.revision };
        } else info = await new CloudWriter(info).save(snapshot);
      } else info = await new CloudWriter(info).save(snapshot);
      await localSaveBook(snapshot, owner, { ...info, pending: false });
      if (!(await localDeleteBook(guest.id, "guest", source.updatedAt)))
        throw new ApiError("version_conflict", 409);
      saved.set(guest.id, info);
      onSaved(snapshot, info);
      done++;
    } catch (error) {
      errors.push({ id: guest.id, error });
    }
    onProgress({ done, total: guests.length });
  }
  return { saved, errors, total: guests.length };
}
