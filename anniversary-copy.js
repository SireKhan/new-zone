/* anniversary-copy.js — all anniversary line pools live here as DATA, never in logic.
 *
 * Structure:  COPY[kind].milestone[years] = [ "line", ... ]     (plain strings)
 *             COPY[kind].numberEgg[years] = [ "line", ... ]     (plain strings)
 *             COPY[kind].generic          = [ {t:tone, s:"line"}, ... ]
 *
 *   kind   : "visit" | "demolition"
 *   tone   : "warm" | "wry" | "absurd" | "plain"  (weights generic selection by year)
 *
 * Placeholders (resolved by Anniversary.format): {location} {years} {date} {user} {building_age}
 * Unknown placeholders are left intact rather than printing "undefined".
 *
 * Milestone years: 1, 5, 10, 15, 20, 25, and every 25 thereafter (50, 75, 100, …).
 * Milestones must NEVER be overridden by a numberEgg or generic line.
 *
 * These are STUB pools (2–3 entries each) so the engine runs — real lines get pasted in later.
 */
(function(){
  const COPY = {
    visit: {
      milestone: {
        1:   ["One year since your first time inside {location}.",
              "A year ago today you first set foot in {location}."],
        5:   ["Five years exploring {location}.",
              "Half a decade since {location} first let you in."],
        10:  ["Ten years. {location} has been yours for a decade.",
              "A decade since you first walked into {location}."],
        15:  ["Fifteen years on from your first visit to {location}.",
              "{location}: fifteen years in your logbook."],
        20:  ["Twenty years since {location}.",
              "Two decades since you first stood in {location}."],
        25:  ["Twenty-five years at {location}. A quarter century.",
              "{location} — 25 years since the first visit."],
        50:  ["Fifty years since you first walked into {location}.",
              "Half a century. {location}, and you, still standing."],
        75:  ["Seventy-five years since {location} first let you in.",
              "Three-quarters of a century on from {location}."],
        100: ["One hundred years since your first visit to {location}.",
              "A century at {location}."]
      },
      numberEgg: {
        7:   ["Seven years lucky at {location}."],
        13:  ["Thirteen years haunting {location}. Unlucky for some."],
        42:  ["Forty-two years at {location}. The answer, apparently."],
        64:  ["Sixty-four years. {location} would like to know if you still need it."],
        67:  ["Sixty-seven years on at {location}."],
        86:  ["Eighty-six years at {location} — old diner slang for 'gone', but here you still are."]
      },
      generic: [
        {t:"warm",   s:"{years} years since you first found {location}."},
        {t:"warm",   s:"{years} years on, and {location} still pulls you back."},
        {t:"plain",  s:"{years} years since your first visit to {location}."},
        {t:"plain",  s:"{location}: {years} years in the record."},
        {t:"wry",    s:"{years} years of trespassing responsibly at {location}."},
        {t:"wry",    s:"{years} years and {location} still hasn't kicked you out."},
        {t:"absurd", s:"{years} years. {location} has started leaving the light on for you."},
        {t:"absurd", s:"Year {years} of your one-sided relationship with {location}."}
      ]
    },
    demolition: {
      milestone: {
        1:   ["One year since {location} came down.",
              "A year ago, {location} stopped standing."],
        5:   ["Five years since {location} was demolished.",
              "Half a decade without {location}."],
        10:  ["Ten years gone. {location} is a decade in the ground.",
              "A decade since {location} was lost."],
        15:  ["Fifteen years since {location} came down."],
        20:  ["Twenty years since {location} was demolished."],
        25:  ["Twenty-five years since {location} was lost."],
        50:  ["Fifty years since {location} came down. Almost no one left remembers it standing.",
              "Half a century gone. You may be the last who walked {location}."],
        75:  ["Seventy-five years since {location} was demolished."],
        100: ["A hundred years since {location} was lost."]
      },
      numberEgg: {
        13:  ["Thirteen years since {location} came down. Unlucky building."],
        42:  ["Forty-two years since {location} was demolished."],
        86:  ["Eighty-six years since {location} was, fittingly, eighty-sixed."]
      },
      generic: [
        {t:"plain",  s:"{years} years since {location} was demolished."},
        {t:"plain",  s:"{years} years since {location} was lost."},
        {t:"warm",   s:"{years} years gone, but you were there for {location}."},
        {t:"wry",    s:"{years} years since {location} met the excavator."},
        {t:"absurd", s:"{years} years since {location} was demolished. It has not gotten better."}
      ]
    }
  };
  if (typeof window !== "undefined") window.ANNIVERSARY_COPY = COPY;
  if (typeof module !== "undefined" && module.exports) module.exports = COPY;
})();
