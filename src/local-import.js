import { CloudWriter, api, ApiError } from "./api";
import {
  legacyBooks,
  legacyId,
  localLoadBook,
  localDeleteBook,
  removeLegacyProject,
} from "./model";

// One-way migration. A lost response or failed upload leaves the original intact.
export async function importGuestBooks(
  owner,
  { onProgress = () => {}, onSaved = () => {} } = {},
) {
  if (!owner || owner === "guest") throw new Error("An account is required");
  const records = await legacyBooks(owner);
  const saved = new Map(),
    errors = [];
  let done = 0;
  onProgress({ done, total: records.length });
  for (const record of records) {
    try {
      const source =
        record.owner === "legacy"
          ? record
          : await localLoadBook(record.id, record.owner);
      if (!source) {
        done++;
        continue;
      }
      let snapshot = source.book;
      let info =
        source.owner === owner && source.cloud?.id
          ? { id: source.cloud.id, revision: source.cloud.revision }
          : null;
      if (info && !source.cloud.pending) {
        try {
          const remote = await api("/books/" + info.id);
          info = { id: remote.id, revision: remote.revision };
        } catch (error) {
          if (error.status !== 404) throw error;
          // Saved mirrors must not resurrect deliberately deleted cloud books.
          info = null;
        }
      } else {
        const newerAccount = records.find(
          (item) =>
            item.owner === owner &&
            item.id === source.id &&
            item.updatedAt >= source.updatedAt,
        );
        if (source.owner === "guest" && newerAccount && saved.has(source.id))
          info = saved.get(source.id);
        else {
          try {
            info = await new CloudWriter(info).save(snapshot);
          } catch (error) {
            if (error.code !== "version_conflict") throw error;
            snapshot = {
              ...snapshot,
              id: legacyId(
                source.owner + ":" + source.id + ":" + source.updatedAt,
              ),
              title: (
                snapshot.title +
                " · " +
                ({ ru: "Восстановлено", ka: "აღდგენილი", en: "Recovered" }[
                  snapshot.language
                ] || "Recovered")
              ).slice(0, 100),
            };
            info = await new CloudWriter().save(snapshot);
          }
        }
      }
      if (source.owner === "legacy") await removeLegacyProject(source.raw);
      else if (
        !(await localDeleteBook(source.id, source.owner, source.updatedAt))
      )
        throw new ApiError("version_conflict", 409);
      if (info) {
        saved.set(source.id, info);
        onSaved(snapshot, info);
      }
      done++;
    } catch (error) {
      errors.push({ id: record.id, error });
    }
    onProgress({ done, total: records.length });
  }
  if (!errors.length && records.legacyBackup)
    await removeLegacyProject(records.legacyBackup);
  return { saved, errors, total: records.length };
}
