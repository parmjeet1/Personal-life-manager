// Rotating journal prompts — one per day, same prompt all day.
export const PROMPTS = [
  'What took most of my energy today, and was it worth it?',
  'What did I avoid today, and why?',
  'One thing I learned today.',
  'Who did I help today? Who helped me?',
  'What would make tomorrow a good day?',
  'Where did I feel Krishna’s mercy today?',
  'What am I worried about? What is one small step on it?',
  'What did I do today that my future self will thank me for?',
  'What drained me today? What restored me?',
  'One decision I am delaying. What is stopping me?',
  'What went better than expected?',
  'What did I spend money on today, and was it aligned with my goals?',
  'Which relationship needs attention this week?',
  'If today repeated for a year, where would I end up?',
];

export function promptOfTheDay(d = new Date()) {
  const dayIndex = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return PROMPTS[dayIndex % PROMPTS.length];
}
