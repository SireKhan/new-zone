/* anniversary.js — the pure anniversary engine.
 *
 * No DOM, no side effects, no dependency on app globals. Given (user, todayString)
 * it returns a list of anniversary events. Deterministic: same inputs → same output,
 * so a card shows the same copy line every time it reopens. Callable with an injected
 * date for testing: Anniversary.computeEvents(user, "2025-06-15", {copy, userName, baseName}).
 *
 * Dates are plain "YYYY-MM-DD" strings throughout; comparisons are on the string parts,
 * never Date objects, so an 11pm photo never lands on the wrong day.
 */
(function(){
  "use strict";

  function pd(ph){ return (ph && typeof ph === "object") ? (ph.date || null) : null; }

  // Parse "YYYY-MM-DD" (or a bare "YYYY") into {y,m,d}. Returns null on garbage.
  function parts(s){
    if (!s || typeof s !== "string") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return { y:+m[1], m:+m[2], d:+m[3] };
    var y = /^(\d{4})$/.exec(s);
    return y ? { y:+y[1], m:null, d:null } : null;
  }
  function isLeap(y){ return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  // Does an anchor's month/day match today? Feb-29 anchors surface on Mar 1 in non-leap years.
  function firesToday(anchor, today){
    var a = parts(anchor), t = parts(today);
    if (!a || !t || a.m == null || t.m == null) return false;
    if (a.m === t.m && a.d === t.d) return true;
    if (a.m === 2 && a.d === 29 && t.m === 3 && t.d === 1 && !isLeap(t.y)) return true;
    return false;
  }
  function yearsBetween(anchor, today){
    var a = parts(anchor), t = parts(today);
    if (!a || !t) return 0;
    return t.y - a.y;
  }

  // FNV-1a 32-bit — deterministic seed for line selection (never Math.random).
  function hash(str){
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  function isMilestone(years){
    return years === 1 || years === 5 || years === 10 || years === 15 || years === 20 || (years > 0 && years % 25 === 0);
  }
  // Pool for exactly `years`, else the nearest lower milestone that has lines (125 → 100 pool).
  function milestonePool(pool, years){
    if (!pool) return null;
    if (pool[years] && pool[years].length) return pool[years];
    var best = null;
    Object.keys(pool).map(Number).filter(function(k){ return k <= years; }).sort(function(a,b){ return a-b; })
      .forEach(function(k){ if (pool[k] && pool[k].length) best = pool[k]; });
    return best;
  }
  function pickFrom(arr, seed){ return arr[hash(seed) % arr.length]; }

  // Tone weights: years 1–3 skew warm; later years can skew absurd.
  function toneWeight(tone, years){
    var w;
    if (years <= 3)      w = { warm:6, plain:3, wry:1, absurd:0.2 };
    else if (years <= 20) w = { warm:3, plain:3, wry:3, absurd:2 };
    else                  w = { warm:1, plain:2, wry:3, absurd:4 };
    return (tone in w) ? w[tone] : 1;
  }
  function selectGeneric(arr, siteId, years){
    if (!arr || !arr.length) return "{years} years on.";
    var weighted = arr.map(function(e){
      return { s: (typeof e === "string") ? e : e.s, w: toneWeight((typeof e === "object" && e.t) || "plain", years) };
    });
    var total = weighted.reduce(function(a,b){ return a + b.w; }, 0) || 1;
    var r = (hash(siteId + "|" + years + "|g") % 100000) / 100000 * total;
    for (var i = 0; i < weighted.length; i++){ r -= weighted[i].w; if (r < 0) return weighted[i].s; }
    return weighted[weighted.length - 1].s;
  }

  // Copy precedence: milestone > numberEgg > generic. Milestones are never overridden.
  function tierAndLine(kind, years, siteId, copy){
    var pools = (copy && copy[kind]) || {};
    if (isMilestone(years)){
      var ms = milestonePool(pools.milestone, years);
      if (ms && ms.length) return { tier:"milestone", line: pickFrom(ms, siteId + "|" + years + "|m") };
    }
    if (pools.numberEgg && pools.numberEgg[years] && pools.numberEgg[years].length){
      return { tier:"numberEgg", line: pickFrom(pools.numberEgg[years], siteId + "|" + years + "|e") };
    }
    return { tier:"generic", line: selectGeneric(pools.generic, siteId, years) };
  }

  // Fill {placeholders}; leave unknown/undefined ones intact rather than printing "undefined".
  function format(line, ctx){
    return String(line).replace(/\{(\w+)\}/g, function(m, k){
      return (ctx && ctx[k] != null) ? String(ctx[k]) : m;
    });
  }
  // Up to 5 photos: earliest, latest, and three spread between — the arc, not one afternoon.
  function selectPhotos(photos){
    var list = (photos || []).slice();
    var dated = list.filter(function(p){ return pd(p); });
    dated.sort(function(a,b){ return pd(a) < pd(b) ? -1 : pd(a) > pd(b) ? 1 : 0; });
    var undated = list.filter(function(p){ return !pd(p); });
    var sorted = dated.concat(undated);
    if (sorted.length <= 5) return sorted;
    var idx = {}; idx[0] = 1; idx[sorted.length - 1] = 1;
    for (var k = 1; k <= 3; k++) idx[Math.round(k * (sorted.length - 1) / 4)] = 1;
    return Object.keys(idx).map(Number).sort(function(a,b){ return a-b; }).map(function(i){ return sorted[i]; });
  }

  function builtYear(built){ var p = parts(built); return p ? p.y : null; }

  // --- upcoming (future) anniversaries: for the card footer and date checks ---
  function pad2(n){ return (n < 10 ? "0" : "") + n; }
  function ymdStr(y, m, d){ return y + "-" + pad2(m) + "-" + pad2(d); }
  function dayNum(s){ var p = parts(s); return p ? Date.UTC(p.y, p.m - 1, p.d) / 86400000 : NaN; }
  // The date this anchor's day lands on in a given year (Feb 29 -> Mar 1 in non-leap years).
  function occurrenceInYear(anchor, year){
    var a = parts(anchor);
    if (a.m === 2 && a.d === 29) return isLeap(year) ? ymdStr(year, 2, 29) : ymdStr(year, 3, 1);
    return ymdStr(year, a.m, a.d);
  }
  // The next time this anchor occurs strictly AFTER fromStr.
  function nextOccurrence(anchor, fromStr){
    var a = parts(anchor), f = parts(fromStr);
    if (!a || !f || a.m == null) return null;
    var year = f.y, occ = occurrenceInYear(anchor, year);
    if (dayNum(occ) <= dayNum(fromStr)){ year++; occ = occurrenceInYear(anchor, year); }
    return { date: occ, years: year - a.y };
  }
  function upcomingEvents(user, fromStr, opts){
    opts = opts || {};
    var copy = opts.copy || (typeof window !== "undefined" && window.ANNIVERSARY_COPY) || {};
    var list = [];
    if (!user) return list;
    sitesOf(user, opts.baseName).forEach(function(entry){
      [["visit","firstVisit"], ["demolition","demolishedDate"]].forEach(function(pair){
        var anchor = entry.site[pair[1]];
        if (!anchor) return;
        var no = nextOccurrence(anchor, fromStr);
        if (!no || no.years < 1) return;
        var by = builtYear(entry.site.built);
        var ctx = { location: entry.name, years: no.years, date: anchor, user: "You",
          building_age: (by != null) ? (parts(no.date).y - by) : null };
        var tl = tierAndLine(pair[0], no.years, entry.id, copy);
        list.push({ siteId: entry.id, siteName: entry.name, kind: pair[0], years: no.years,
          anchorDate: anchor, date: no.date, daysOut: dayNum(no.date) - dayNum(fromStr),
          tier: tl.tier, line: format(tl.line, ctx), photos: selectPhotos(entry.site.photos) });
      });
    });
    list.sort(function(a,b){ return a.daysOut - b.daysOut || (a.kind < b.kind ? -1 : 1); });
    return list;
  }
  // Every past anniversary occurrence (one per year since the anchor), on/before todayStr.
  // Reverse chronological. Missed anniversaries never expire — they all appear here.
  function pastEvents(user, todayStr, opts){
    opts = opts || {};
    var copy = opts.copy || (typeof window !== "undefined" && window.ANNIVERSARY_COPY) || {};
    var t = parts(todayStr), list = [];
    if (!user || !t) return list;
    sitesOf(user, opts.baseName).forEach(function(entry){
      [["visit","firstVisit"], ["demolition","demolishedDate"]].forEach(function(pair){
        var anchor = entry.site[pair[1]]; if (!anchor) return;
        var a = parts(anchor); if (!a || a.m == null) return;
        var by = builtYear(entry.site.built);
        for (var y = a.y + 1; y <= t.y; y++){
          var occ = occurrenceInYear(anchor, y);
          if (dayNum(occ) > dayNum(todayStr)) continue;   // this year's occurrence hasn't happened yet
          var years = y - a.y;
          var ctx = { location: entry.name, years: years, date: anchor, user: "You",
            building_age: (by != null) ? (y - by) : null };
          var tl = tierAndLine(pair[0], years, entry.id, copy);
          list.push({ siteId: entry.id, siteName: entry.name, kind: pair[0], years: years,
            anchorDate: anchor, date: occ, tier: tl.tier, line: format(tl.line, ctx), photos: selectPhotos(entry.site.photos) });
        }
      });
    });
    list.sort(function(a,b){ return dayNum(b.date) - dayNum(a.date) || (a.kind < b.kind ? -1 : 1); });
    return list;
  }

  function sitesOf(user, baseName){
    var out = [];
    (user.pins || []).forEach(function(p){ out.push({ id:p.id, name:p.n, site:p }); });
    Object.keys(user.extras || {}).forEach(function(id){
      out.push({ id:id, name: baseName ? baseName(id) : id, site: user.extras[id] });
    });
    return out;
  }

  function computeEvents(user, todayStr, opts){
    opts = opts || {};
    var copy = opts.copy || (typeof window !== "undefined" && window.ANNIVERSARY_COPY) || {};
    var t = parts(todayStr), todayYear = t ? t.y : null;
    var events = [];
    if (!user) return events;
    sitesOf(user, opts.baseName).forEach(function(entry){
      [["visit","firstVisit"], ["demolition","demolishedDate"]].forEach(function(pair){
        var kind = pair[0], anchor = entry.site[pair[1]];
        if (!anchor || !firesToday(anchor, todayStr)) return;
        var years = yearsBetween(anchor, todayStr);
        if (years < 1) return;
        var by = builtYear(entry.site.built);
        var ctx = {
          location: entry.name, years: years, date: anchor, user: "You",
          building_age: (by != null && todayYear != null) ? (todayYear - by) : null
        };
        var tl = tierAndLine(kind, years, entry.id, copy);
        events.push({
          siteId: entry.id, siteName: entry.name, kind: kind, years: years,
          anchorDate: anchor, tier: tl.tier, line: format(tl.line, ctx), photos: selectPhotos(entry.site.photos)
        });
      });
    });
    // On a colliding day, demolition sorts ahead of visit (it's the one the card features).
    events.sort(function(a,b){
      if (a.kind !== b.kind) return a.kind === "demolition" ? -1 : 1;
      return a.siteName < b.siteName ? -1 : a.siteName > b.siteName ? 1 : 0;
    });
    return events;
  }

  var API = {
    computeEvents: computeEvents, upcomingEvents: upcomingEvents, pastEvents: pastEvents,
    nextOccurrence: nextOccurrence, format: format, firesToday: firesToday, yearsBetween: yearsBetween,
    isMilestone: isMilestone, hash: hash, dayNum: dayNum, selectPhotos: selectPhotos, tierAndLine: tierAndLine
  };
  if (typeof window !== "undefined") window.Anniversary = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
