import {
  validateBook,
  newPage,
  resizeBook,
  PAGE_COUNTS,
  COLORS,
  CAPACITY,
  slots,
  effectiveDpi,
} from "./model.js";
import { pageSize } from "./format.js";

const SINGLE = ["editorial", "full", "gallery"];
const WARM = {
  en: [
    "Little moments, held close.",
    "There is happiness in the everyday.",
    "A little warmth to keep.",
    "The things that make us smile.",
  ],
  ru: [
    "Маленькие моменты большого счастья.",
    "Тепло простых мгновений.",
    "То, что хочется сохранить.",
    "Улыбки, которые всегда с нами.",
  ],
  ka: [
    "პატარა მომენტები, დიდი ბედნიერება.",
    "მოგონებები, რომლებიც გულში რჩება.",
    "სითბო, რომელსაც ვინახავთ.",
    "ჩვენი ამბის პატარა ნაწილი.",
  ],
};
function caption(value, language) {
  if (typeof value !== "string") return "";
  const clean = value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  if (language === "ka" && !/[\u10a0-\u10ff\u1c90-\u1cbf]/u.test(clean))
    return "";
  if (language === "ru" && !/[А-Яа-яЁё]/u.test(clean)) return "";
  if (
    /^(?:a |the )?(?:person|man|woman|child|people)\b.*\b(?:works?|working|sits?|sitting|stands?|standing|holds?|holding|wears?)\b/i.test(
      clean,
    ) ||
    /^(?:человек|мужчина|женщина|девушка|парень|реб[её]нок|люди)(?:\s|$).*(?:работает|сидит|стоит|лежит|держит|одет)/iu.test(
      clean,
    ) ||
    /^(?:ადამიანი|კაცი|ქალი|ბავშვი).*(?:მუშაობს|ზის|დგას|წევს)/u.test(clean)
  )
    return "";
  return clean;
}
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));

function cropFor(photo, slot, analysis) {
  const center = analysis?.subjectCenter;
  if (
    !Array.isArray(center) ||
    center.length !== 2 ||
    !center.every(Number.isFinite)
  )
    return { x: 50, y: 50, zoom: 1 };
  const scale = Math.max(slot.w / photo.width, slot.h / photo.height);
  const w = photo.width * scale,
    h = photo.height * scale;
  const focus = (dimension, frame, c) =>
    dimension - frame < 0.0001
      ? 50
      : clamp(
          ((dimension * clamp(c, 0, 1) - frame / 2) / (dimension - frame)) *
            100,
          0,
          100,
        );
  return {
    x: focus(w, slot.w, center[0]),
    y: focus(h, slot.h, center[1]),
    zoom: 1,
  };
}

function groupsFromPlan(photos, plan, analyses) {
  const known = new Set(photos.map((p) => p.id)),
    used = new Set(),
    groups = [];
  for (const page of Array.isArray(plan?.pages) ? plan.pages : []) {
    if (!page || typeof page !== "object") continue;
    const ids = [];
    for (const id of Array.isArray(page.photoIds) ? page.photoIds : []) {
      if (!known.has(id) || used.has(id)) continue;
      used.add(id);
      ids.push(id);
    }
    for (let i = 0; i < ids.length; i += 4)
      groups.push({ ...page, photoIds: ids.slice(i, i + 4) });
  }
  const missing = photos.filter((p) => !used.has(p.id));
  // The model order leads. Missing photos remain in stable thematic groups.
  missing.sort((a, b) =>
    String(
      analyses.get(a.id)?.group || analyses.get(a.id)?.scene || "",
    ).localeCompare(
      String(analyses.get(b.id)?.group || analyses.get(b.id)?.scene || ""),
    ),
  );
  for (const photo of missing) groups.push({ photoIds: [photo.id] });
  return groups;
}

function rebalance(groups, pageCount, photoCount) {
  if (
    groups.length <= pageCount &&
    (photoCount < pageCount || groups.length === pageCount)
  )
    return groups;
  const order = groups.flatMap((g) => g.photoIds),
    pageTotal = Math.min(pageCount, photoCount);
  const counts = Array(pageTotal).fill(1);
  let remaining = photoCount - pageTotal;
  // Reserve some single-photo pages; make pairs first and then four-photo grids.
  const regular = Array.from({ length: pageTotal }, (_, i) => i).filter(
    (i) => i % 5 !== 0,
  );
  const heroes = Array.from({ length: pageTotal }, (_, i) => i).filter(
    (i) => i % 5 === 0,
  );
  for (const index of regular) {
    if (!remaining) break;
    counts[index]++;
    remaining--;
  }
  for (const index of regular) {
    if (remaining < 2) break;
    counts[index] += 2;
    remaining -= 2;
  }
  for (const index of heroes) {
    if (!remaining) break;
    counts[index]++;
    remaining--;
  }
  for (const index of heroes) {
    if (remaining < 2) break;
    counts[index] += 2;
    remaining -= 2;
  }
  // At near-maximum density one partially filled collage can be unavoidable.
  for (const index of [...regular, ...heroes]) {
    if (!remaining) break;
    const add = Math.min(4 - counts[index], remaining);
    counts[index] += add;
    remaining -= add;
  }
  const partial = counts.indexOf(3);
  if (partial !== -1) {
    const pair = counts.indexOf(2),
      single = counts.indexOf(1);
    if (pair !== -1) {
      counts[partial] = 4;
      counts[pair] = 1;
    } else if (single !== -1) {
      counts[partial] = 2;
      counts[single] = 2;
    }
  }
  let at = 0;
  const byFirst = new Map(groups.map((g) => [g.photoIds[0], g]));
  return counts.map((count) => {
    const ids = order.slice(at, at + count);
    at += count;
    return { ...byFirst.get(ids[0]), photoIds: ids };
  });
}

function layoutFor(group, photos, analyses, size, index, lastLayout) {
  const count = photos.length;
  if (count >= 3) return "grid";
  if (count === 2) {
    const loss = (layout) =>
      slots(layout, size).reduce((score, slot, i) => {
        const ratio = photos[i].width / photos[i].height,
          target = slot.w / slot.h;
        return score + Math.min(ratio / target, target / ratio);
      }, 0);
    return loss("diptych") > loss("pair") ? "diptych" : "pair";
  }
  let layout = SINGLE.includes(group.layout)
    ? group.layout
    : SINGLE[index % SINGLE.length];
  if (layout === lastLayout && index % 3 === 1)
    layout = SINGLE[(SINGLE.indexOf(layout) + 1) % SINGLE.length];
  const photo = photos[0],
    person =
      (analyses.get(photo.id)?.peopleCount ||
        analyses.get(photo.id)?.visible_people_count ||
        0) > 0;
  if (person && photo.height > photo.width * 1.25) layout = "full";
  const dpi = effectiveDpi(photo, slots(layout, size)[0], {
    x: 50,
    y: 50,
    zoom: 1,
  });
  if (dpi < 150 && !person && index % 3 === 2) layout = "gallery";
  return layout;
}

/** Build a normal editable book. Provider output can never add/drop original pixels. */
export function assembleBook(original, analysis = [], plan = {}) {
  let book = validateBook(original, { allowCloud: true });
  if (!book.photos.length) throw new Error("ai_no_photos");
  const needed = Math.ceil(book.photos.length / 4);
  const count = PAGE_COUNTS.find((n) => n >= Math.max(book.pageCount, needed));
  if (!count) throw new Error("ai_too_many_photos");
  if (count !== book.pageCount) book = resizeBook(book, count);
  const photos = new Map(book.photos.map((p) => [p.id, p]));
  const analyses = new Map();
  for (const item of Array.isArray(analysis) ? analysis : []) {
    if (item && photos.has(item.id) && !analyses.has(item.id))
      analyses.set(item.id, item);
  }
  let groups = rebalance(
    groupsFromPlan(book.photos, plan, analyses),
    count,
    photos.size,
  );
  // A grid with three photos is a deliberate airy collage when no other page is free.
  if (groups.length < count) {
    groups = groups.flatMap((group) => {
      if (group.photoIds.length !== 3 || groups.length >= count) return [group];
      return [
        { ...group, photoIds: group.photoIds.slice(0, 2) },
        { photoIds: group.photoIds.slice(2) },
      ];
    });
    if (groups.length > count) groups = rebalance(groups, count, photos.size);
  }
  const pages = book.pages.map((p) => ({ ...p }));
  let previous = "";
  const captionCount = Math.round(groups.length * 0.3);
  const captioned = new Set(
    Array.from({ length: captionCount }, (_, i) =>
      Math.floor((i * groups.length) / captionCount),
    ),
  );
  const normalise = (text) =>
    String(text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");
  for (let i = 0; i < count; i++) {
    const group = groups[i];
    if (!group) {
      pages[i + 1] = { ...newPage(), id: pages[i + 1].id, color: COLORS[0] };
      continue;
    }
    const images = group.photoIds.map((id) => photos.get(id));
    const size = pageSize(book, pages[i + 1]);
    let layout = layoutFor(group, images, analyses, size, i, previous);
    if (captioned.has(i) && layout === "full") layout = "editorial";
    previous = layout;
    const frames = slots(layout, size);
    const photoIds = Array(CAPACITY[layout]).fill(null);
    const crops = frames.map((slot, at) =>
      images[at]
        ? cropFor(images[at], slot, analyses.get(images[at].id))
        : { x: 50, y: 50, zoom: 1 },
    );
    images.forEach((p, at) => {
      photoIds[at] = p.id;
    });
    let words = "";
    if (captioned.has(i)) {
      const descriptions = new Set(
        images.map((image) => normalise(analyses.get(image.id)?.description)),
      );
      // Vision descriptions and cached analysis captions are not printed text.
      const candidates = [group.caption]
        .map((value) => caption(value, book.language))
        .filter((value) => value && !descriptions.has(normalise(value)));
      words =
        candidates[0] ||
        (WARM[book.language] || WARM.en)[Math.floor(i / 3) % 4];
    }
    pages[i + 1] = {
      ...newPage(),
      id: pages[i + 1].id,
      layout,
      photos: photoIds,
      crops,
      color: COLORS.includes(group.color) ? group.color : COLORS[0],
      caption: words,
      font: words && i % 3 === 0 ? "cormorantgaramond" : "montserrat",
      georgianFont: i % 3 === 0 ? "bpg-serif" : "bpg-ingiri",
      fontSize: layout === "full" ? 17 : 14,
    };
  }
  const first = pages[0],
    back = pages.at(-1);
  if (!first.photos.some(Boolean)) {
    const hero =
      photos.get(plan?.coverPhotoId) ||
      [...book.photos].sort(
        (a, b) =>
          (Number(analyses.get(b.id)?.importance) || 0) -
          (Number(analyses.get(a.id)?.importance) || 0),
      )[0];
    const coverFrames = slots(first.layout, pageSize(book, first));
    if (coverFrames.length) {
      const ids = [...first.photos];
      ids[0] = hero.id;
      const crops = [...first.crops];
      crops[0] = cropFor(hero, coverFrames[0], analyses.get(hero.id));
      pages[0] = { ...first, photos: ids, crops };
    }
  }
  const backWords = caption(plan?.backCaption, book.language);
  if (!back.caption && backWords)
    pages[pages.length - 1] = { ...back, caption: backWords };
  const result = validateBook({ ...book, pages }, { allowCloud: true });
  const used = result.pages
    .slice(1, -1)
    .flatMap((p) => p.photos)
    .filter(Boolean);
  if (
    used.length !== photos.size ||
    new Set(used).size !== photos.size ||
    used.some((id) => !photos.has(id))
  )
    throw new Error("ai_invalid_result");
  return result;
}
