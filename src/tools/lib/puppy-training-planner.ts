// Puppy training: skill tree, session statistics and next-step recommendations
// (the "3 Ds": raise distraction, duration or distance only once a level is reliable).

export interface Skill { id: string; name: string; stage: string; needs: string[]; how: string }

export const SKILLS: Skill[] = [
  { id: 'name', name: 'Name recognition', stage: 'Foundations', needs: [], how: 'Say the name once; mark and reward the moment the puppy looks at you.' },
  { id: 'marker', name: 'Marker word / clicker', stage: 'Foundations', needs: [], how: 'Say “yes!” then treat within a second, 10–15 times, until the word makes ears perk up.' },
  { id: 'crate', name: 'Crate comfort', stage: 'Foundations', needs: [], how: 'Feed meals in the crate, close the door for seconds, build up slowly while you stay near.' },
  { id: 'potty', name: 'Potty on cue', stage: 'Foundations', needs: [], how: 'Take out after sleep, play and meals; say the cue while they go, reward right after.' },
  { id: 'handling', name: 'Handling & grooming', stage: 'Foundations', needs: [], how: 'Touch paws, ears and mouth for a second, then treat. Stop before the puppy wriggles.' },
  { id: 'sit', name: 'Sit', stage: 'Basic cues', needs: ['marker'], how: 'Lure the nose up and back with a treat; the rump drops. Mark and reward. Fade the lure after 5 good reps.' },
  { id: 'down', name: 'Down', stage: 'Basic cues', needs: ['sit'], how: 'From sit, lure the nose straight down between the paws then forward along the floor.' },
  { id: 'come', name: 'Recall (come)', stage: 'Basic cues', needs: ['name'], how: 'Run backwards, say “come!” happily, party when they arrive. Never call for something unpleasant.' },
  { id: 'touch', name: 'Hand target (touch)', stage: 'Basic cues', needs: ['marker'], how: 'Present a flat palm near the nose; mark the boop. Move the hand further over time.' },
  { id: 'leave', name: 'Leave it', stage: 'Manners', needs: ['marker'], how: 'Treat in a closed fist; mark the moment they back off, reward from the other hand.' },
  { id: 'stay', name: 'Stay', stage: 'Manners', needs: ['sit', 'down'], how: 'Ask for sit, wait one second, mark and reward in position. Add time first, then distance.' },
  { id: 'leash', name: 'Loose-leash walking', stage: 'Manners', needs: ['touch', 'name'], how: 'Reward often at your side; stop when the leash tightens and continue when it slackens.' },
  { id: 'settle', name: 'Settle on a mat', stage: 'Manners', needs: ['down'], how: 'Reward calm lying on the mat; drop treats between the paws while the puppy relaxes.' },
  { id: 'drop', name: 'Drop it', stage: 'Manners', needs: ['leave'], how: 'Trade a toy for a tasty treat, say “drop” just before offering the trade, give the toy back.' },
  { id: 'wait', name: 'Wait at doors', stage: 'Advanced', needs: ['stay'], how: 'Open the door an inch; close it if the puppy moves forward, mark and release when they hold.' },
  { id: 'emergency', name: 'Emergency recall', stage: 'Advanced', needs: ['come'], how: 'A special whistle or word paired only with jackpot rewards, practised in easy places first.' },
]
export const skillById = (id: string) => SKILLS.find((s) => s.id === id)

export type Level = 'low' | 'medium' | 'high'
export const LEVELS: Level[] = ['low', 'medium', 'high']

export interface Session {
  id: string
  date: string
  skill: string
  reps: number
  hits: number
  minutes: number
  distraction: Level
  note: string
}

export interface SkillStat {
  sessions: number
  reps: number
  hits: number
  /** Success rate over the last three sessions (most relevant to current ability). */
  recent: number
  overall: number
  /** Highest distraction level with a recent success rate ≥ 80%. */
  proofed: Level | null
  status: 'new' | 'learning' | 'progressing' | 'reliable'
  last: string | null
}

export function skillStat(sessions: Session[], skill: string): SkillStat {
  const ss = sessions.filter((s) => s.skill === skill && s.reps > 0).sort((a, b) => a.date.localeCompare(b.date))
  const reps = ss.reduce((a, s) => a + s.reps, 0)
  const hits = ss.reduce((a, s) => a + Math.min(s.hits, s.reps), 0)
  const last3 = ss.slice(-3)
  const r3 = last3.reduce((a, s) => a + s.reps, 0)
  const recent = r3 ? last3.reduce((a, s) => a + Math.min(s.hits, s.reps), 0) / r3 : 0
  let proofed: Level | null = null
  for (const lv of LEVELS) {
    const at = ss.filter((s) => s.distraction === lv).slice(-3)
    const n = at.reduce((a, s) => a + s.reps, 0)
    if (n >= 5 && at.reduce((a, s) => a + Math.min(s.hits, s.reps), 0) / n >= 0.8) proofed = lv
  }
  const status = !ss.length ? 'new' : proofed === 'high' || (proofed === 'medium' && recent >= 0.9) ? 'reliable' : recent >= 0.6 ? 'progressing' : 'learning'
  return { sessions: ss.length, reps, hits, recent, overall: reps ? hits / reps : 0, proofed, status, last: ss.length ? ss[ss.length - 1].date : null }
}

export interface Advice { skill: string; kind: 'easier' | 'repeat' | 'harder' | 'start' | 'refresh'; text: string; priority: number }

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/** Next steps per skill, most urgent first. */
export function recommend(sessions: Session[], today: string): Advice[] {
  const out: Advice[] = []
  const stats = Object.fromEntries(SKILLS.map((s) => [s.id, skillStat(sessions, s.id)]))
  for (const sk of SKILLS) {
    const st = stats[sk.id]
    if (st.status === 'new') {
      const ready = sk.needs.every((n) => stats[n].status === 'progressing' || stats[n].status === 'reliable')
      if (ready) out.push({ skill: sk.id, kind: 'start', text: `Ready to start ${sk.name}. ${sk.how}`, priority: 2 + sk.needs.length * 0.1 })
      continue
    }
    const lastS = sessions.filter((s) => s.skill === sk.id).sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
    const lv = lastS.distraction
    if (st.status === 'reliable') {
      if (st.last && daysBetween(st.last, today) > 10) out.push({ skill: sk.id, kind: 'refresh', text: `${sk.name} is reliable but hasn't been practised for ${daysBetween(st.last, today)} days: do a quick refresher.`, priority: 3 })
      continue
    }
    if (st.recent < 0.5) out.push({ skill: sk.id, kind: 'easier', text: `${sk.name}: only ${Math.round(st.recent * 100)}% recently. Make it easier: ${lv === 'low' ? 'shorter sessions, a better treat, and help with a lure again' : `go back to ${LEVELS[LEVELS.indexOf(lv) - 1]} distraction`}.`, priority: 0 })
    else if (st.recent < 0.8) out.push({ skill: sk.id, kind: 'repeat', text: `${sk.name}: ${Math.round(st.recent * 100)}% at ${lv} distraction. Keep practising at this level until you hit 80%+.`, priority: 1 })
    else {
      const next = LEVELS[LEVELS.indexOf(lv) + 1]
      out.push({ skill: sk.id, kind: 'harder', text: next ? `${sk.name}: ${Math.round(st.recent * 100)}% at ${lv} distraction. Raise one “D”: try ${next} distraction (but keep duration and distance easy).` : `${sk.name}: strong at high distraction. Add duration or distance, or practise in new places.`, priority: 1.5 })
    }
  }
  return out.sort((a, b) => a.priority - b.priority)
}

/** Age in whole weeks. */
export const ageWeeks = (birth: string, today: string) => Math.floor(daysBetween(birth, today) / 7)
/** Suggested max session length: about 1 minute per week of age up to 15 minutes, minimum 3. */
export const sessionMinutes = (weeks: number) => Math.max(3, Math.min(15, Math.round(weeks / 1.5)))
