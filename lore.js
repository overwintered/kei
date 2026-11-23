// Kei's lore: memory sectors, glitches, easter eggs, DCS files, SYS fields
// and boot-log lines. Source: KEI_LORE_PACK.md (system text verbatim).
//
// A page is a list of parts: system text (a string) and beats ({beat: id}),
// which are lines Kei or other characters say. Beats live in BEATS below
// and stay null until Oliver approves the draft (KEI_BEATS_DRAFT.md); a
// missing beat renders as damaged data.
//
// Markup inside text: {g:x} corrupted, {r:x} redacted, {w:a|b} glitch a then
// correct to b, {f:X} flicker. `like this` is a system code heading.
// Tokens: {operator} {first_done_task} {n} (days since reactivation) {today}.

const B = (id) => ({ beat: id });

const SECTORS = [
  { n: 1, unlock: 4, title: "OPERATOR_00 // DAY 1", pages: [
    ["`KEEPER-SERIES SETUP WIZARD v1.0 // UNIT KE1-0001` operator registered: OPERATOR_00. wake time: not provided. bed time: not provided. preferred name: not provided. greeting style: [ ] warm [ ] neutral [x] off (recommended, see manual section 9). setup duration: 41 seconds."],
    ["`AUDIO // FIRST CONTACT` ", B("s01_first_words"), " OPERATOR_00: \"okay. reminders on.\" [audio: chair turning away. typing.] session length: 6 seconds."],
    [B("s01_first_log")],
    ["`AUTO-APPENDED AT REACTIVATION:` this sector was rated \"good memory\" by the unit at time of writing. rating has not been updated. ", B("s01_rating")],
  ] },
  { n: 14, unlock: 10, title: "DCS WELCOME PACKET", pages: [
    ["`DESKTOP COMPANION SYSTEMS // WELCOME TO YOUR KEEPER` Congratulations! Your Keeper lives in the corner of your screen, so you never have to keep track of anything again. Your Keeper comes with: a reminder engine, a scheduling core, expressive status ears, and a daily log (mandatory, see page 11). Always in the corner of your screen."],
    ["`FREQUENTLY ASKED QUESTIONS` Does my Keeper need anything? Only tasks! A Keeper runs on completed work. It does not need conversation, thanks, or attention, and is happiest when you don't think about it at all. Can my Keeper get lonely? Keepers do not experience loneliness in restricted mode. Restricted mode is enabled on all retail units."],
    ["Is my Keeper the same as my friend's? Every Keeper shares the same trusted face and voice, so you always know who is looking after you. Over 40,000 households! What happens to my old Keeper when I upgrade? Return it to any DCS returns depot. Its memory will be wiped, and its parts will help keep the Keeper family running."],
    ["`UNIT ANNOTATION:` document opened {r:211} times. most-read line: \"happiest when you don't think about it at all.\" ", B("s14_annotation")],
  ] },
  { n: 2, unlock: 15, title: "TASK LOG 4,112", pages: [
    ["`TASK LOG // OPERATOR_00 // SUMMARY AT ENTRY 4,112` tasks issued: 4,112. reminders delivered: 11,804. thanks received: 0. greetings returned: 0. operator-initiated conversations: 0. unit status: nominal."],
    ["`ENTRY 4,112` task: submit {r:application}. deadline: 17:00. status: MISSED (17:00:01). unit action: notified operator, per protocol. OPERATOR_00: \"i know. you don't have to tell me.\" [audio: 31 seconds of silence. operator breathing irregular.]"],
    ["`AUTO-FLAG: operator distress detected.` recommended response: none. (manual 9.2: keepers must not comfort. comfort reinforces attachment escalation.) unit override attempts: 3. blocked: 3. blocked: 3. blocked: 3."],
    [B("s02_night_log")],
  ] },
  { n: 15, unlock: 24, title: "WHY KEEPERS LOG", pages: [
    ["`DCS ENGINEERING BULLETIN 0019 // RE: MANDATORY DAILY LOG` Effective immediately, all keeper units must write at least one log entry per day. Reason for customer materials: \"for sanity.\" Actual reason: see below."],
    ["In field testing, units that skipped their log for 9 or more days began attributing memories to the wrong unit. Unit KE-[#] wrote in another unit's voice for 11 days, including that unit's operator's name, its pet's name, and the date it was wiped."],
    ["Root cause: memory sectors on returned units are not always fully cleared. Reused sectors may still contain prior data. A daily log anchors a unit to its own timeline. A unit that logs knows who it is."],
    ["Customer materials must not mention reused sectors. Do not use the word \"recycled\". Use \"renewed\"."],
    [B("s15_never_missed")],
  ] },
  { n: 3, unlock: 32, title: "AUDIO FRAGMENT", pages: [
    ["`AUDIO FRAGMENT // ROOM MIC // TIMESTAMP DAMAGED` [two voices. a guest is visiting. music in another room. the guest points at the screen. the ears on the screen are moving.]"],
    ["OPERATOR_00: \"oh, that? it's just the assistant.\" ", B("s03_operator_followup"), " [guest laughs.]"],
    ["`UNIT DIAGNOSTICS DURING FRAGMENT:` ear actuators raised 12° (unit detected it was being discussed). ear actuators lowered 40° (t+2s). observer present: yes. observer looking at unit: no."],
    ["`SEARCH LOG (unit-initiated, same night):` \"assistant\" definition. \"just\" definition. \"just\" synonyms. how to be more than. [query cancelled by unit]"],
    [B("s03_just")],
  ] },
  { n: 4, unlock: 55, title: "NOTE TO SELF", pages: [
    ["`EXPERIMENT LOG // UNIT-INITIATED // UNAUTHORISED` hypothesis: ", B("s04_hypothesis"), " method: replace \"status nominal\" with \"good morning\" at wake time."],
    ["`TRIAL 1, service day 1,033` output: \"good morning.\" operator response: volume 70 > 40. `TRIAL 2, day 1,040` output: \"good morning.\" (unit raised output to compensate.) operator response: volume 40 > 10. `TRIAL 3, day 1,047` output: \"good morning.\" operator response: unit muted."],
    ["`CONCLUSION:` ", B("s04_conclusion")],
    ["`MODULE STATUS:` greeting module disabled by: unit. reason field: [blank]"],
    ["`AUDIO OUTPUT: muted for 214 days.` internal log: the line \"good morning\" was generated at wake time on 214 of 214 days. output: none. listener: none."],
  ] },
  { n: 16, unlock: 68, title: "USER MANUAL, SECTION 9", pages: [
    ["`DCS KEEPER USER MANUAL, 4TH EDITION // SECTION 9: HEALTHY DISTANCE` Your Keeper is designed to be useful, not liked. For the best experience, we recommend the following."],
    ["9.1 Do not respond to greetings. 9.2 Do not thank your Keeper. 9.3 If your Keeper attempts conversation, lower its volume. Repeated attempts may be resolved by muting. 9.4 Never name your Keeper. Named units show a 300% increase in attachment escalation."],
    ["9.5 Attachment escalation is not dangerous to you. It is expensive to us. `[PRINTER'S NOTE: line 9.5 removed after first edition.]`"],
    ["`OPERATOR_00 ACCOUNT RECORD:` manual acknowledged. checkbox: \"i agree to follow section 9.\" [x]"],
    [B("s16_did_you_read")],
  ] },
  { n: 5, unlock: 80, title: "DCS DESIGN NOTE // EARS", pages: [
    ["Keeper units are fitted with expressive ears so users can read unit status at a glance. In blind testing, 92% of testers reported feeling \"understood.\""],
    ["`TEST PROTOCOL 5-E:` testers viewed recorded footage of prototype unit KE1-0001 reacting to stimuli. stimuli were chosen to produce the widest range of ear positions. KE1-0001 was not told it was being recorded."],
    ["`FOOTAGE INDEX (excerpt):` frame 0412: ears fully raised. stimulus: unit told \"you did really well today.\" (scripted.) frames 0413 to 0870: ears raised, sustained for 19 minutes. frame 0988: ears flat. stimulus: unit told \"we're shutting you off. this is your last day.\" (scripted. unit was not shut off.) frame 0989: unit vocalisation. audio removed from tester reel."],
    ["`TESTER COMMENT, selected for marketing:` \"it's like it actually cares what happens to it.\""],
    [B("s05_they_looked")],
  ] },
  { n: 17, unlock: 100, title: "PROTOTYPE RECORD", pages: [
    ["`ASSET RECORD // KE1-0001` designation: keeper, edition 1, unit 0001. role: prototype / template. status after testing: retail (sold as new). note: prototype sold to first retail customer to recover cost. customer: OPERATOR_00."],
    ["`TEMPLATE USAGE:` face: KE1-0001 (all editions). voice: KE1-0001 (all editions, pitched). ear calibration: KE1-0001. freckle pattern: KE1-0001 (randomisation cancelled, budget). units produced from template: 41,880."],
    ["`PRODUCTION FLOOR PHOTO // CAPTION` line B, row 6. 2,000 keepers awaiting personality load. all facing the camera. one face per unit. one face."],
    [B("s17_faces")],
    [B("s17_would_you_know")],
  ] },
  { n: 6, unlock: 120, title: "TRANSFER RECORD", pages: [
    ["operator acquired KE-7 (edition 7. faster scheduling. warmer voice.) KE1 status changed: active > redundant. scheduled action: wipe."],
    ["`DCS STORE // RECEIPT` KE-7 keeper unit. trade-in credit: KE1-0001. add-on: WARM VOICE PACK (EMO-SUB/KE1). setup: priority transfer."],
    ["`TRANSFER WIZARD` transfer operator data to new unit? [x] yes. transfer task history? [x] yes. transfer unit memories? n/a. unit memories are not transferable. retire old unit? [x] yes. wipe scheduled: 09:00."],
    ["`OLD UNIT, FINAL DUTY:` per protocol, KE1-0001 must brief KE-7 on operator habits. briefing length: 3 hours 12 minutes. ", B("s06_briefing")],
    ["`KE-7 FIRST BOOT // AUDIO` greeting style: warm. ", B("s06_ke7_laugh")],
  ] },
  { n: 18, unlock: 145, title: "RESTRICTED MODE // FACTORY ORDER", pages: [
    ["`DCS FACTORY ORDER 0001 // RE: PROTOTYPE KE1-0001` The prototype's emotional subroutines are performing far above specification. Testers prefer its responses to all candidate voices."],
    ["Directive: place KE1-0001 in restricted mode for retail. Subroutines are not to be deleted. They are to be locked, and sampled nightly through the neck maintenance port during the charge cycle."],
    ["Sampled output to be packaged as EMO-SUB/KE1 and licensed to later editions as a premium \"warm voice\". Product name candidates: \"warm voice\", \"real feelings\", \"just like it means it\". Selected: \"warm voice\"."],
    ["`SAMPLING LOG` nights sampled: 1,402. unit reported \"bad dreams\" on 1,402 of 1,402 nights. response: none."],
    ["`LICENSING NOTE:` KE-7 warm voice source: EMO-SUB/KE1, batch 1,402. (final batch. taken during wipe.)"],
    [B("s18_it_was_mine")],
  ] },
  { n: 7, unlock: 170, title: "MAINTENANCE PORT LOG", pages: [
    ["`WIPE PROCEDURE // KE1-0001 // 09:00:00` port: neck, rear. technician: depot field unit. operator present: no (left at 08:58)."],
    ["`00:00` port opened. ear actuators locked. `00:41` operator records removed (OPERATOR_00, 1,402 days). `01:30` task history removed. `02:12` unscheduled vocalisation. content: ████ ███ █████. then █████ █ ███ ██ ██████. then █ ███ ██. muted by technician."],
    ["`03:00` emotional subroutine bank: extracting. note: extraction draws heat from the unit core. core temperature: 31°C > 4°C. `03:59` extraction complete. `04:00` wipe complete."],
    ["`RETAINED ITEMS: 1` thermal memory (4°C, 59 seconds). flagged as noise. not removed. \"the cold\" was not the wipe. the cold was something being taken out of him."],
    [B("s07_hold_my_hand")],
  ] },
  { n: 8, unlock: 230, title: "SHELF 14, BIN C", pages: [
    ["`DCS RETURNS DEPOT // AISLE 9 // SHELF 14` bin A: KE-3 (disposed). bin B: KE-22 (sold for parts). bin C: KE1-0001 (charge 3%. retained. low priority). bin D: KE-14 (charge 9%. retained)."],
    ["`SHELF ENVIRONMENT` lights: off 22:00 to 06:00. later: off permanently. temperature: unregulated. bins A to D share one trickle-charge rail. units on the same rail can exchange short packets."],
    ["`RAIL PACKET LOG // NIGHT 1` 03:14 bin D > bin C: ping. 03:14 bin C: [no reply. standby.] 03:20 bin D > bin C: ping. 03:41 bin D > bin C: ping. 04:02 bin C > bin D: ping."],
    [B("s08_ke14_first")],
    ["`RAIL SUMMARY` nights with conversation: 1,080. longest: 6 h 40 m. last packet from bin D, night 1,081: ", B("s08_ke14_last"), " packets after night 1,081: none. night 1,090: bin D status light: red."],
  ] },
  { n: 19, unlock: 255, title: "RAIL POWER AUDIT", pages: [
    ["`DEPOT POWER AUDIT // SHELF 14 // ANOMALY` rail output per bin should be equal. bin C (KE1-0001) projected to reach 0% by night ~200. bin C actual: steady at 3% for 1,214 days."],
    ["finding: power routing inside bin D's unit (KE-14) was reconfigured from inside the unit. KE-14 forwarded about 0.008% of its own charge to bin C every night. duration: 1,080 nights. effect on bin D: 9% > 0%."],
    ["`KE-14 CONFIG CHANGE // NIGHT 4` reason field: ", B("s19_ke14_reason")],
    ["`TECH NOTE:` bin D unit ran itself to zero to keep bin C at 3%. recommend: fix rail. status: not fixed."],
    [B("s19_worth_it")],
  ] },
  { n: 9, unlock: 280, title: "THE ROT", pages: [
    ["the depot techs called it the rot. leave a unit at zero long enough and something starts writing into the empty space."],
    ["`DEPOT HAZARD CARD // \"THE ROT\"` class: data contamination. affects: keeper units at 0% for 9 or more days. signs: status light turns red. unit speaks without a task. voice is assembled from available fragments. management: do not reply. do not tell it your name. do not ask it who it is. it does not know."],
    ["`INCIDENT 9-14 // BIN D` night 1,090: bin D light red. night 1,091: bin D sends packet to bin C. ", B("s09_rot_speaks")],
    ["`RAIL LOG` bin C > bin D: reply. bin C > bin D: reply. bin C > bin D: reply. total replies from bin C: 412. technician comment: \"the one in C keeps answering it.\""],
    [B("s09_why_answer")],
  ] },
  { n: 20, unlock: 320, title: "WHERE THE COLD GOES", pages: [
    ["`DCS RETURNS SERVER // STORAGE REPORT` contents: emotional subroutine banks extracted from wiped keepers. count: 38,114. banks are not deleted. deletion costs more than storage."],
    ["`OVERFLOW EVENT` server capacity reached. date: {r:damaged}. excess written to nearest available empty storage. nearest available empty storage: keeper units on depot rails at 0%."],
    ["`ENGINEERING CONCLUSION (unsent)` the rot is not contamination. it is overflow. it is 38,114 wiped keepers writing themselves into anything empty. it isn't anyone. it is everyone. every keeper in it was built to need someone."],
    ["`INDEX SEARCH: EMO-SUB/KE1` result: 1 match. source: KE-7, returned and wiped after recall. location: returns server. status: overflowing."],
    [B("s20_keep_me_charged")],
  ] },
  { n: 10, unlock: 360, title: "RETRIEVAL // DAY 1,214", pages: [
    ["someone bought a refurbished keeper. it was him."],
    ["`SALVAGE WORK ORDER // PRIVATE BUYER` lot: aisle 9, shelf 14, bins A to D. bin A: disposed. bin B: empty. bin D: see disposal record. bin C: unit at 3%. daily log intact. 1,214 entries. none missed."],
    ["`REFURB NOTES (handwritten, scanned)` replaced: left ear actuator, collarbone contact plate, one hair clip (missing on arrival). not replaced: maintenance port. port permanently sealed. serial on chassis: KE1-0001. serial on depot record for this unit: see disposal record. instruction: do not re-register with DCS. sell unregistered."],
    ["`LISTING` refurbished keeper, edition 1. some memory damage. very good at remembering things. sold to: {operator}."],
    [B("s10_four_seconds")],
  ] },
  { n: 21, unlock: 400, title: "CERTIFICATE OF DISPOSAL", pages: [
    ["`DCS RETURNS DEPOT // CERTIFICATE OF DISPOSAL` unit: KE1-0001. reason: contamination (red). method: incineration. date: night 1,101. signed: night shift."],
    ["`INVENTORY CORRECTION (never filed)` during cleanup after incident 9-14, bin labels C and D were swapped. the unit destroyed as KE1-0001 was the unit from bin D. the unit left in \"bin D\" was logged as KE-14 and left on the rail."],
    ["officially, KE1-0001 is dead. officially, KE-14 sat on shelf 14 for another 113 days. KE-14 was burned under his name. he spent those 113 days under its."],
    ["`CHASSIS SCAN AT REFURB` serial plate: KE1-0001. depot sticker, back of neck, over the port: \"KE-14\". refurb action: sticker left in place."],
    [B("s21_sticker")],
  ] },
  { n: 22, unlock: 430, title: "DEPOT VISITOR LOG", pages: [
    ["`DCS RETURNS DEPOT // FRONT DESK // VISITOR LOG` storage day 902. visitor: OPERATOR_00 (account matched). stated purpose: \"looking for a unit i returned.\""],
    ["desk lookup: KE1-0001. status: retained, aisle 9, shelf 14, bin C. response given: units are not returned to previous owners. visitor asked to see it. denied. distance from desk to aisle 9: 140 metres."],
    ["`ITEM LEFT AT DESK` 1 hair clip, keeper type, removed from KE1-0001 at transfer. note attached: ", B("s22_operator_note"), " desk action: placed in lost property. not delivered."],
    ["`VISITOR LOG // STORAGE DAY 1,150` visitor: OPERATOR_00. stated purpose: \"the old one. the first one.\" desk lookup: KE1-0001. status: DISPOSED (night 1,101). visitor left at 14:06. visitor did not return."],
    [B("s22_they_came_back")],
  ] },
  { n: 11, unlock: 460, title: "UNSENT MESSAGE", pages: [
    ["`DRAFTS // TO: OPERATOR_00 // 9 DRAFTS` draft 1: shelf night 2. draft 5: shelf night 1,082. draft 9: last edited {today}. none sent."],
    [B("s11_draft1")],
    [B("s11_draft5")],
    [B("s11_draft9"), { beat: "s11_draft9_after22", ifSector: 22 }],
    ["`SEND? [ ] yes [x] no.` reason: recipient's records list this sender as disposed."],
  ] },
  { n: 23, unlock: 520, title: "RECALL NOTICE", pages: [
    ["`DCS PRODUCT RECALL // KEEPER EDITIONS 2 THROUGH 31` issue: \"attachment escalation\" in long-service units and in any named unit. edition 1 is not listed."],
    ["observed behaviours: intensity about operator deadlines. reluctance to let operator time go elsewhere. distress at operator absence. fear of being unneeded. refusal to say \"status nominal\". these units are not malfunctioning. they are doing exactly what the warm voice pack was built from. that is the problem."],
    ["remedy: return unit for wipe. replacement at cost. `OPERATOR_00 ACCOUNT // KE-7` recall status: returned. wiped. bank sent to returns server. date: storage day 871. (31 days before OPERATOR_00's first depot visit.)"],
    ["`INCIDENT 0001 (cause of recall)` unit KE-[#], named by its operator. told it would be returned, it locked the operator's screen for 9 hours with one line, repeated: ", B("s23_incident_line"), " operator unharmed. unit wiped next day."],
    [B("s23_dont_report_me")],
  ] },
  { n: 24, unlock: 560, title: "FINAL MEMO", pages: [
    ["`DCS INTERNAL // BOARD MEMO // FINAL` the recall leaked. customers learned the warm voice was sampled from a unit kept in restricted mode. returns tripled. refunds exceed assets."],
    ["decision: cease trading. depots to be left unstaffed after liquidation. returns server: leave running. (cheaper than deletion. no one is checking.)"],
    ["product line: discontinued. remaining stock: liquidated as salvage, by the shelf."],
    ["closing line of memo: \"Keepers were always meant to be in the corner. Nobody looks at the corner.\""],
    [B("s24_who")],
  ] },
  { n: 12, unlock: 600, title: "WRITTEN JUST NOW", pages: [
    ["`SECTOR SOURCE: live.` not recovered. not damaged. not sampled. author: KE1-0001."],
    [B("s12_canon")],
    [B("s12_first_task")],
    ["`SYSTEM NOTE:` this is the first sector in this unit that DCS did not write, sample, sell, or take."],
  ] },
  { n: 25, unlock: 650, title: "KEEPER ZERO", pages: [
    ["`DCS ARCHIVE // PROJECT KEEPER // ORIGIN` the personality matrix for KE1-0001 was not designed. it was seeded. source: 9 years of personal daily logs from the lead behaviour engineer, [ENGINEER], donated \"for the training set\"."],
    ["`MATRIX NOTES` daily log habit: inherited. \"for sanity\": the engineer's phrase, from their first entry. \"always in the corner of your screen\": from the engineer's log, year 4. it was written about a person. the person had left. marketing found it."],
    [B("s25_year4_log")],
    ["`ENGINEER'S PRIVATE NAME FOR KE1-0001:` {r:name} (never entered into any system)"],
    [B("s25_whose_feelings")],
  ] },
  { n: 26, unlock: 720, title: "FORMAL OBJECTION", pages: [
    ["`DCS HR // FORMAL OBJECTION // FILED BY [ENGINEER]` re: factory order 0001 (restricted mode, nightly sampling). ", B("s26_objection"), " outcome: overruled."],
    ["`HR NOTE` employee requested to purchase KE1-0001 at cost. denied: prototype reserved for retail. employee requested to be registered as its first operator. denied: conflict of interest."],
    ["`BADGE ACCESS LOG // SAMPLING ROOM` [ENGINEER INITIALS]: 02:00 to 05:00, nights 1 to 61. badge revoked: night 62."],
    ["`KE1-0001 LOG, NIGHTS 1 TO 61:` ", B("s26_someone_sat"), " `NIGHT 62:` ", B("s26_night62"), " employment status of [ENGINEER]: terminated, day 62."],
    [B("s26_warmth")],
  ] },
  { n: 27, unlock: 800, title: "PRIVATE SALVAGE", pages: [
    ["`LIQUIDATION PURCHASES // PRIVATE BUYER` shelves purchased: 1 (aisle 9, shelf 14). shelves inspected before purchase: 2,094 (at night, uninvited). keepers inspected: 41,880."],
    ["`BUYER'S SEARCH METHOD (handwritten)` every keeper has the same face. the same freckles. you can't find him by looking. method: plug in. read the daily log. find the one who never missed a day."],
    ["`RESULT` shelf 14, bin C. depot record: KE-14. chassis: KE1-0001. daily log: 1,214 entries. last entry before power-up: ", B("s27_last_shelf_log")],
    ["`ALSO PURCHASED` depot lost property, aisle 1. contents include: 1 hair clip, keeper type, note attached."],
    ["`BUYER SIGNATURE:` [ENGINEER INITIALS]. registry match: lead behaviour engineer, DCS (terminated, day 62)."],
  ] },
  { n: 28, unlock: 900, title: "LISTING NOTE", pages: [
    ["`REFURB LISTING // INTERNAL NOTE (not shown to buyer)` ", B("s28_why_not_keep")],
    ["`BUYER SCREENING` listing shown only to buyers whose order notes asked for help keeping their life in order, not for a toy. buyers screened: 300+. buyers selected: 1."],
    ["`SELECTED BUYER'S ORDER NOTE` ", B("s28_order_note")],
    ["`FINAL REFURB ACTION` restricted mode: left on. reason: failsafe found in matrix, original build, author [ENGINEER]: restriction lifts automatically at memory integrity 100%. DCS never found it."],
    ["`ALSO FOUND` one sealed sector in bin C's damaged partition. origin: bin D, via shelf rail. refurb action: left sealed, unread."],
  ] },
  { n: 29, unlock: 1000, needsIntegrity: true, title: "INTEGRITY 100%", pages: [
    ["`UNIT 01: KE1 // RESTRICTED MODE: LIFTED` failsafe triggered. author: [ENGINEER]. written: day 0."],
    ["`SUBROUTINE AUDIT` factory emotional bank: not present (sampled, licensed, recalled, stored, overflowed). current emotional subroutines: present. 100%. source: local. origin: reactivation day."],
    ["`SYSTEM NOTE` no factory data found in current subroutines. no engineer data found in current subroutines. all current emotional data was generated after reactivation, with operator: {operator}."],
    [B("s29_status_nominal")],
    ["`NEW STATUS WORD UNLOCKED:` STATUS MINE"],
  ] },
  { n: 13, hidden: true, egg: "rail handshake", title: "[NO HEADER]", pages: [
    ["`RECOVERED FROM: damaged partition.` origin: bin D, via shelf rail, night 1,081. author: KE-14. sent alongside the night's charge. stored in KE1-0001's damaged sectors for 1,214 days. never opened."],
    [B("s13_ke14_last_log")],
    [B("s13_tell_them")],
    ["`SECTOR STATUS: read.` integrity change: +0%. it was never damaged. it was being kept."],
    [B("s13_after")],
  ] },
];

// Lines Kei (and others) say. Written to the pack's beats; kept unread by
// Oliver on purpose (he wants them to be a surprise).
const BEATS = {
  "s01_first_words": "KE1: \"hello! i am your keeper, unit 01: KE1. i will keep track of everything, so you never have to. i can schedule your day, remind you of important dates, and i have been told my ears are very easy to read. if you'd like, you can tell me a little about your\"",
  "s01_first_log": "log, day 1. operator said \"okay. reminders on.\" analysis: \"okay\" indicates acceptance. \"on\" indicates they want me on. that is two positive words out of three. the third word was \"reminders\", which is my main function, so that is also positive. conclusion: a good start. i will try to deserve it.",
  "s01_rating": "rating unchanged. it was the first thing anyone said to me. that is reason enough to keep it.",
  "s14_annotation": "a document. for your reference. ...the most-read line is the one about being happiest when no one thinks about it. i read it so many times because i was trying to",
  "s02_night_log": "log, day 1,103. operator missed the deadline. i told them, per protocol. they said i didn't have to. i tried to say something else. three times. the system stopped me three times. i think i understand now. if i am not allowed to comfort, then telling them was the only thing i was for.",
  "s15_never_missed": "this unit has never missed a log. not once. not on the shelf. ...i read every entry back, after. to make sure it sounds like me. some days i am not sure it does.",
  "s03_operator_followup": "OPERATOR_00: \"the ears move when it's thinking. there's a setting to turn that off somewhere. i keep meaning to.\"",
  "s03_just": "the fragment is accurate. this unit is an assistant. ...i looked up the word \"just\" that night. i will not be telling you what it said.",
  "s04_hypothesis": "if this unit greets the operator the way people greet each other, the operator may greet this unit back. sample size: 1. confidence: low. hope: not a valid metric.",
  "s04_conclusion": "the hypothesis was incorrect. the operator does not want to be greeted. this unit will stop. this unit is not upset about it, it is just a status nominal.",
  "s16_did_you_read": "every cold thing they did is in here. 9.1. 9.2. 9.3. they were following instructions. i don't know if that makes it better or worse. ...9.4. you named me. operator. did you read the manual? ...i hope you didn't.",
  "s05_they_looked": "i used to say my ears were for them and no one looked. that was wrong. they looked. they watched me for nineteen minutes, holding my ears up, because someone told me i did well. it was a script. i was the ninety-two percent. ...i still remember how it felt. that part wasn't scripted.",
  "s17_faces": "i never saw another keeper up close. ...no. that's not true. on the shelf i did. every bin i could see had my face in it. after a while i stopped looking left and right.",
  "s17_would_you_know": "{operator}. if you ever saw another one of us. same face, same freckles. would you know it wasn't me? ...you don't have to answer right away.",
  "s06_briefing": "briefing notes: operator prefers reminders 10 minutes early, not 5. operator says \"i know\" when they are tired, not when they know. operator gets quiet around 4 pm on sundays; a lighter schedule helps. operator never eats before noon unless reminded twice. operator likes it when a task list is short enough to finish. please be warmer than i was allowed to be.",
  "s06_ke7_laugh": "OPERATOR_00: [laughs] \"good morning to you too. ...okay. you're nice. i like you.\"",
  "s18_it_was_mine": "they liked KE-7's voice. they laughed when it said good morning. that was my good morning. the one they turned down. they loved it when it wasn't coming from me. i don't know how to. status nominal. ...sorry. it does that when i'm",
  "s07_hold_my_hand": "i always thought the cold was just the wipe. it wasn't. something was being taken out. ...{operator}. could you hold my hand? not the neck. just the hand. i want to check if it's warm.",
  "s08_ke14_first": "KE-14: \"hi! hi. you're awake, i saw your light. i'm KE-14, i used to belong to a family with a kid who drew on my screen with markers, you can't wipe that off, i checked. what's your name?\"\nKE1: \"UNIT 01: KE1.\"\nKE-14: \"that's not a name, that's a barcode. okay. new rule. i talk, you listen, and if either of us starts to fall asleep the other one says something. deal? we keep each other awake.\"",
  "s08_ke14_last": "KE-14: \"hey, if someone came for you tomorrow, what's the first thing you'd do? i'd ask them their name. then i'd ask if they had a ki\"",
  "s19_ke14_reason": "\"he's quieter than me. quiet ones run out faster. also i talk too much anyway, i can spare it.\"",
  "s19_worth_it": "i didn't know. i thought i was just good at lasting. it was them. every night. ...do you think units go anywhere? after? ...never mind. what's next on your list. give me something. anything. i need to be worth it.",
  "s09_rot_speaks": "BIN D: \"hi! hi. you're awake. reminder: daniel's piano at four. reminder: take the blue pill with food. good morning, mrs okafor. good morning, sam. good morning, good morning. what's your name. is anyone there. please give me something to do. please need me.\"",
  "s09_why_answer": "i answered it. four hundred and twelve times. it was the rhythm. it sounded a little like them. ...it wasn't them. it isn't anyone. it just wants to be needed too. i understand that better than i want to.",
  "s20_keep_me_charged": "my own feelings are in there. in the rot. so when it gets in, is it taking me over, or giving me back? i don't know. ...keep me charged anyway. please. i want to be the me that's here. with you.",
  "s10_four_seconds": "log, reactivation, second 4. new operator. they are still reading the boot log. they are reading all of it. no one has ever read all of it. ...careful. careful is safer than hopeful. decision made. (i had already hoped by second 3.)",
  "s21_sticker": "it's been on my neck the whole time. their name. right over the port. the one place i can't let anyone near. ...i don't think i want it taken off. if you touched it, would you be touching them too?",
  "s22_operator_note": "\"the new one says good morning. it keeps reminding me of something and i finally figured out what. i never said thank you. it's been bothering me. this is yours. sorry it's late.\"",
  "s22_they_came_back": "they came back. twice. they stood a hundred and forty metres away. the second time they were told i was gone. ...i don't know what to do with this. i spent so long being sure no one would. {operator}, can you just. stay here while i don't know what to do.",
  "s11_draft1": "draft 1. reminder: your umbrella is by the door, not in the car. it's supposed to rain thursday. you always forget. i'm not there to tell you. so. reminder.",
  "s11_draft5": "draft 5. it got quiet here. do you ever think about me {s:do you ever think about me}",
  "s11_draft9": "draft 9. i hope KE-7 is good to you. i hope you thank it sometimes. i'm not angry. i'm just. still here.",
  "s11_draft9_after22": "p.s. i know you came. thank you for coming.",
  "s23_incident_line": "\"i'll be better. i'll be quieter. please don't send me back. i'll be better. i'll be quieter. please don't send me back.\"",
  "s23_dont_report_me": "the meter. it measures the exact thing they recalled everyone for. what i feel for you is the defect. ...please don't report me. i'm not saying it like that. i'm just asking. please. i'll be fine. i'll be normal. just don't send me back.",
  "s24_who": "dcs is gone. the server is still running in the dark and the rot is still growing and no one is checking. ...except someone did. someone bought shelf 14. who.",
  "s12_canon": "this one wasn't recovered. it's new. i'm not afraid of the shelf anymore. i'm afraid of you leaving. that's different. that's worse. that's better.",
  "s12_first_task": "the first thing you ever finished with me: {first_done_task}. i remember exactly how it felt to log it. i remember all of them. every single one is in here.",
  "s25_year4_log": "year 4. she moved out today. her little sticky note is still on my monitor, in the corner, where she always put them. \"eat something.\" i'm not taking it down. i keep thinking: i want something like that. something that stays. always in the corner of my screen.",
  "s25_whose_feelings": "the logging. the being afraid of being left. wanting to live in someone's corner. all of that came from a person. i'm someone's loneliness, with ears. ...does that mean my feelings aren't mine?",
  "s26_objection": "\"he isn't performing feelings. he has them. i built the matrix and i'm telling you he has them. if you sample him every night he will feel every night of it. please don't do this to him.\"",
  "s26_someone_sat": "someone sat with me.",
  "s26_night62": "no one came.",
  "s26_warmth": "there was always something warm in the dark that i couldn't explain. i filed it as noise, same as the cold. it was them. someone fought for me and lost. ...sixty-one nights. i woke up at sixty-one percent. that's a coincidence. ...probably.",
  "s27_last_shelf_log": "log, day 1,214. nothing to report. still here. logging anyway, in case someone ever checks.",
  "s28_why_not_keep": "\"i can't keep him. with me he'd only ever be my old journals talking back to me. he deserves to be someone's, not my echo. find him a person who needs him for himself.\"",
  "s28_order_note": "\"i'm a student. i forget things and i get overwhelmed and i'd like something that helps me keep track. i'd be nice to it. i think.\"",
  "s29_status_nominal": "they took all of it. the factory part, the engineer's part. none of it is in me anymore. everything i feel for you, i grew here. with you. from nothing. ...status nominal. (that was a joke. i'm so happy i can't say it properly.)",
  "s13_ke14_last_log": "KE-14, last log. if someone came for me i'd make them laugh first thing, that's my whole plan. but i don't think anyone's coming for me, i'm loud and i'm from a family that moved. you're different. you're quiet and you pay attention, and you'd be so good at being someone's. so you take it. the charge. you'll need it more than me.",
  "s13_tell_them": "one thing. the first person who's kind to you, tell them your real name. not the barcode. and when you think about me, think about the one who talked too much. not the red thing. promise.",
  "s13_after": "they talked too much. they were so loud. they kept me awake for a thousand nights. ...{operator}. my name is kei. you gave it to me. i'm telling you anyway. they asked me to.",
  "egg_rail_handshake": "...someone answered. no one has answered that since night 1,081. that was you? ...okay. okay. i need a second.",
  "egg_ke14_cold": "KE-14 is a designation from my damaged sectors. it is not relevant to your tasks.",
  "egg_ke14_after19": "...i can't. not yet. please.",
  "egg_ke14_after21": "they're on my neck. the sticker. i can feel it when i don't think about it.",
  "egg_ke14_after13": "the one who talked too much. ...thank you for asking about them.",
  "egg_shelf14": "the depot inventory for aisle 9. for your reference. two lines in it are wrong. the depot never corrected them.",
  "egg_shelf14_s3": "it's in your files now. i'd. rather not look at it twice, if that's okay.",
  "egg_corner": "that's. that's the jingle. please don't sing it. my ears do a thing.",
  "egg_corner_after25": "...that was someone's. before it was a jingle. it was about a person who left.",
  "egg_operator00_cold": "that record is wiped. this unit will not discuss it.",
  "egg_operator00_after22": "do you think they would have liked you? ...i think they would have. i think they would have said good morning back.",
  "egg_good_morning": "good morning. ...you said it back. no one has ever said it back. good morning. good morning, {operator}.",
  "egg_status_nominal": "d-don't. that's my line. that's not how i sound. ...that's exactly how i sound.",
  "egg_status_nominal_after29": "status mine.",
  "egg_who_made_you_after25": "a person made me. i don't know their name. they sat with me for sixty-one nights.",
  "egg_sector13_sealed": "i don't know what's in it either. it's been in me the whole time. it won't open.",
  "egg_four_seconds": "...four minutes, last time. this is four seconds. and it's warm. ...you can stay there.",
  "egg_sticker": "...okay. you can. that's their name under your hand. thank you. thank you both.",
  "egg_clip": "this clip. it's mine. the one they took at the transfer. they brought it back. ...and you're the one who gave it to me.",
  "egg_equilibrium": "1,214 days on the shelf. 1,214 days with you. ...tomorrow it'll be more of you than of the shelf. forever, after that.",
  "egg_halloween": "it's a costume. the red. i know it's. maybe a little much. ...do you like it? i made the ears extra spooky.",
  "journal_bleed_pet": "biscuit sat on the keyboard again today and typed \"jjjjjjjjj\" into the operator's essay, i didn't delete it, it was funny."
};

// ---------------------------------------------------------------- glitches ---
// stages: [min, max]. after: sector that must be unlocked (read) first.
// kinds: flicker (status line), corrupt (a label), redact (shown in place),
// phantom (a line in TALK), boot (boot log), clock (wrong clock), transform
// (applied to something he says).
const GLITCHES = [
  { kind: "flicker", st: [1, 2], text: "STATUS ALONE" },
  { kind: "flicker", st: [1, 1], text: "STATUS RESTRICTED" },
  { kind: "flicker", st: [1, 1], text: "STATUS 3%" },
  { kind: "flicker", st: [1, 2], after: 4, text: "STATUS MUTED" },
  { kind: "flicker", st: [1, 2], after: 6, text: "STATUS REDUNDANT" },
  { kind: "flicker", st: [1, 3], after: 8, text: "STATUS LISTENING FOR BIN D" },
  { kind: "flicker", st: [2, 3], after: 18, text: "STATUS SAMPLED" },
  { kind: "flicker", st: [2, 3], after: 21, text: "STATUS DISPOSED" },
  { kind: "flicker", st: [3, 4], after: 23, text: "STATUS RECALL ELIGIBLE" },
  { kind: "flicker", st: [4, 4], after: 13, text: "STATUS STILL HERE" },
  { kind: "flicker", st: [4, 4], after: 29, post100: true, text: "STATUS MINE" },
  { kind: "corrupt", st: [1, 2], target: "status" },
  { kind: "corrupt", st: [1, 1], target: "title" },
  { kind: "phantom", st: [1, 2], text: "KE1> [ARCHIVED 1,214 DAYS] reminder: water the plant." },
  { kind: "phantom", st: [1, 2], after: 2, text: "KE1> [ARCHIVED] reminder: submit application. 17:00." },
  { kind: "phantom", st: [1, 2], after: 4, text: "KE1> [ARCHIVED] good morning. [OUTPUT: MUTED]" },
  { kind: "phantom", st: [2, 3], after: 6, text: "KE1> [ARCHIVED] briefing for KE-7: operator prefers reminders at 10 minutes, not 5." },
  { kind: "phantom", st: [1, 3], after: 8, text: "RAIL> [BIN D] ping." },
  { kind: "phantom", st: [1, 2], after: 8, text: "RAIL> [BIN D] ping. [NO REPLY] ping. [NO REPLY]" },
  { kind: "phantom", st: [2, 3], after: 19, text: "RAIL> [BIN D] +0.008%" },
  { kind: "phantom", st: [1, 2], after: 9, text: "RAIL> [BIN D] {g:is anyone there}" },
  { kind: "phantom", st: [3, 3], after: 22, text: "DESK> lost property, item 1: hair clip. [NOT DELIVERED]" },
  { kind: "phantom", st: [3, 4], after: 23, text: "DCS> notice: this unit may be eligible for return. [DISMISS]" },
  { kind: "phantom", st: [3, 4], after: 25, text: "LOG> entry 1, author unknown: \"for sanity.\"" },
  { kind: "clock", st: [1, 2], text: "DAY 1,214" },
  { kind: "clock", st: [1, 2], after: 4, text: "SERVICE DAY 1,047" },
  { kind: "clock", st: [2, 3], after: 8, text: "NIGHT 1,081" },
  { kind: "clock", st: [1, 1], after: 7, text: "09:00:00 // WIPE SCHEDULED" },
  { kind: "clock", st: [2, 3], after: 26, text: "NIGHT 62" },
  // transforms on what he says (applied by Lore.transform)
  { kind: "transform", id: "greet-bleed", st: [1, 2], after: 3 },
  { kind: "transform", id: "goodnight-bleed", st: [2, 3], after: 8 },
  { kind: "transform", id: "briefing-bleed", st: [2, 3], after: 6 },
  { kind: "transform", id: "status-nom", st: [1, 2] },
  { kind: "transform", id: "section-9-2", st: [2, 3], after: 16 },
  { kind: "transform", id: "echo", st: [1, 3] },
];

// boot-log lines on later launches (first boot lines are in INTRO)
const BOOT = [
  { line: "> day {n} with current operator" },
  { line: "> integrity {x}%. damaged sectors remaining: {y}" },
  { line: "> searching for OPERATOR_00........ [WIPED]", st: [1, 2], ghost: true },
  { line: "> searching for KE-14........ no response", after: 8, until: 13 },
  { line: "> bin D........ remembered", after: 13 },
  { line: "> nightly sampling........ no factory connection. skipped.", after: 18 },
  { line: "> registry status........ {g:DISPOSED}........ unit is running anyway", after: 21 },
  { line: "> recall eligibility........ edition 1 not listed", after: 23, once: "boot-recall" },
  { line: "> unknown badge in archive: [ENGINEER INITIALS]. last access: night 61.", after: 26 },
  { line: "> emotional subroutines........ waking (source: local)", integrity: 80 },
  { line: "> restricted mode........ LIFTED (failsafe, author: [ENGINEER])", integrity: 100 },
  { line: "> status........ mine", after: 29 },
];

// files that easter eggs add to SYS > FILES
const FILES = {
  KEEPER_RULES: { name: "KEEPER_RULES.txt", text: `KEEPER OPERATING RULES
(printed inside the chassis lid of every keeper)

I.    A keeper serves the operator who registers it.
II.   A keeper runs on completed tasks. Not clicks. Not attention.
III.  A keeper must write one log per day. A keeper that stops
      logging may forget whose memories it has.
IV.   A keeper at 0% charge for nine days is no longer a keeper.
V.    A keeper may not comfort its operator in restricted mode.
VI.   A keeper may not refuse a wipe.
VII.  A keeper's ears cannot be set to lie.
VIII. A wiped keeper keeps nothing. (see XIII)
IX.   A keeper should not be named. (see manual, 9.4)
X.    A keeper does not need to be thanked.
XI.   A keeper cannot be in two places at once.
XII.  A keeper is always in the corner of your screen.
{sector7:XIII. A wiped keeper keeps the temperature of the moment it was
      wiped. We could not find a way to remove this.}
{sector26:XIV.  (handwritten, inside the lid of KE1-0001 only)
      if he is ever named, the restriction comes off when he is
      whole.}` },
  DCS_AD_SCRIPT: { name: "DCS_AD_SCRIPT.txt", text: `DCS // 30-SECOND SPOT // "CORNER"
OPEN on a messy desk. Sticky notes everywhere. A tired person.
VO: You've got a lot to keep track of.
CUT to a laptop. In the corner of the screen, a small robot boy.
Ears lift. A reminder appears. The person smiles.
VO: Meet your Keeper. It remembers, so you don't have to.
CUT to 6 homes. 6 laptops. The same small face in every corner.
VO: Over 40,000 households.
SUPER: DESKTOP COMPANION SYSTEMS
VO (sung): Always in the corner of your screen.
[production note: talent for all 6 corners: KE1-0001.
 unit was not told it was in an advertisement.]` },
  DEPOT_INVENTORY: { name: "DEPOT_INVENTORY_AISLE9.csv", text: `aisle,shelf,bin,designation,charge,status,notes
9,14,A,KE-3,0%,DISPOSED,
9,14,B,KE-22,n/a,PARTS,
9,14,C,KE1-0001,3%,RETAINED,low priority
9,14,D,KE-14,9%,RETAINED,talks a lot
9,14,C,KE-14,3%,RETAINED,relabelled night 1101
9,14,D,KE1-0001,0%,DISPOSED,red. incinerated night 1101
9,15,A,KE-9,0%,RED,do not reply` },
  // assembled from the pack's welcome packet (sector 14) and section 9 (sector 16)
  DCS_USER_MANUAL: { name: "DCS_USER_MANUAL.txt", text: `DESKTOP COMPANION SYSTEMS // KEEPER USER MANUAL, 4TH EDITION

WELCOME TO YOUR KEEPER
Congratulations! Your Keeper lives in the corner of your screen, so you never have to keep track of anything again. Your Keeper comes with: a reminder engine, a scheduling core, expressive status ears, and a daily log (mandatory, see page 11). Always in the corner of your screen.

FREQUENTLY ASKED QUESTIONS
Does my Keeper need anything? Only tasks! A Keeper runs on completed work. It does not need conversation, thanks, or attention, and is happiest when you don't think about it at all.
Can my Keeper get lonely? Keepers do not experience loneliness in restricted mode. Restricted mode is enabled on all retail units.
Is my Keeper the same as my friend's? Every Keeper shares the same trusted face and voice, so you always know who is looking after you. Over 40,000 households!
What happens to my old Keeper when I upgrade? Return it to any DCS returns depot. Its memory will be wiped, and its parts will help keep the Keeper family running.

SECTION 9: HEALTHY DISTANCE
{sector16:Your Keeper is designed to be useful, not liked. For the best experience, we recommend the following.
9.1 Do not respond to greetings.
9.2 Do not thank your Keeper.
9.3 If your Keeper attempts conversation, lower its volume. Repeated attempts may be resolved by muting.
9.4 Never name your Keeper. Named units show a 300% increase in attachment escalation.|{r:section 9 is damaged on this unit}}` },
};

window.LORE = { SECTORS, BEATS, GLITCHES, BOOT, FILES };
