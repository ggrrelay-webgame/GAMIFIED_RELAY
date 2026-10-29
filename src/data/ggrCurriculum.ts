import { PhaseKey, QuizItem, RelayRole } from '../types';

export interface RelayRoleInfo {
  role: RelayRole;
  icon: string;
  title: string;
  duty: string;
}

export const RELAY_ROLES_INFO: RelayRoleInfo[] = [
  { role: 'READER', icon: '📖', title: 'READER', duty: 'Reads the question or sentence aloud to the group' },
  { role: 'SOLVER', icon: '💡', title: 'SOLVER', duty: "Gives the team's first answer or idea" },
  { role: 'CHECKER', icon: '🔍', title: 'CHECKER', duty: 'Checks if the answer makes sense and verifies evidence' },
  { role: 'EXPLAINER', icon: '🗣️', title: 'EXPLAINER', duty: 'Explains why the answer is correct to the team' },
  { role: 'RUNNER', icon: '🏃', title: 'RUNNER', duty: 'Taps/submits the final answer on the device (baton pass)' },
];

export function getRotatedRoles(members: string[], stepIndex: number): Array<{
  member: string;
  memberIndex: number;
  roleInfo: RelayRoleInfo;
  isCurrentTapRunner: boolean;
}> {
  return members.map((member, mIdx) => {
    const roleIdx = (mIdx - (stepIndex % members.length) + members.length) % members.length;
    const roleInfo = RELAY_ROLES_INFO[roleIdx];
    return {
      member,
      memberIndex: mIdx + 1,
      roleInfo,
      isCurrentTapRunner: roleInfo.role === 'RUNNER',
    };
  });
}

// -------------------------------------------------------------
// EXACT PRETEST & POSTTEST ITEMS (12 Parallel Items Each)
// -------------------------------------------------------------
export const PRETEST_ITEMS: QuizItem[] = [
  {
    p: 'Which one is a complete sentence?',
    o: [
      'Running to the market every morning.',
      'Ana runs to the market every morning.',
      'To the market every morning.',
      'Ana, the market, every morning.',
    ],
    c: 1,
    explanation: '"Ana runs to the market every morning." has a subject (Ana) and action (runs) and expresses a complete thought.',
  },
  {
    p: 'Choose the sentence with correct subject-verb agreement.',
    o: [
      'The dogs barks loudly.',
      'The dog bark loudly.',
      'The dogs bark loudly.',
      'The dog barking loudly.',
    ],
    c: 2,
    explanation: 'Plural subject "The dogs" takes the plural base verb "bark".',
  },
  {
    p: 'Arrange the words into a correct sentence: (mango / bought / Jose / a ripe)',
    o: [
      'Bought Jose a ripe mango.',
      'Jose bought a ripe mango.',
      'A ripe mango Jose bought.',
      'Jose a ripe mango bought.',
    ],
    c: 1,
    explanation: 'Standard order is Subject (Jose) + Verb (bought) + Object (a ripe mango).',
  },
  {
    p: "What part of speech is the underlined word? 'The **BRIGHT** star shone at night.'",
    o: ['Noun', 'Verb', 'Adjective', 'Adverb'],
    c: 2,
    explanation: '"BRIGHT" describes the noun "star", so it is an Adjective.',
  },
  {
    p: "What part of speech is the underlined word? 'Maria **SINGS** every afternoon.'",
    o: ['Noun', 'Verb', 'Adjective', 'Pronoun'],
    c: 1,
    explanation: '"SINGS" expresses the action done by Maria, so it is a Verb.',
  },
  {
    p: "Identify the noun in the sentence: 'The children played in the barangay plaza.'",
    o: ['played', 'in', 'children', 'the'],
    c: 2,
    explanation: '"children" names persons, so it is a Noun.',
  },
  // Additional 6 Items for Pretest:
  {
    p: 'Which one is incomplete?',
    o: [
      'The kite flew over the rice field.',
      'Whenever the wind blows hard.',
      'Grandpa fixed the broken fence.',
      'The children played happily.',
    ],
    c: 1,
    explanation: '"Whenever the wind blows hard" leaves us waiting for what happens when the wind blows.',
  },
  {
    p: "Find the adverb in the sentence: 'The turtle crawled **SLOWLY** across the sand.'",
    o: ['slowly', 'turtle', 'crawled', 'sand'],
    c: 0,
    explanation: '"slowly" describes HOW the turtle crawled, so it is an Adverb.',
  },
  {
    p: "Which word is a proper noun? 'The children visited **Manila** last summer.'",
    o: ['children', 'visited', 'Manila', 'summer'],
    c: 2,
    explanation: '"Manila" is the specific name of a city and starts with a capital letter (Proper Noun).',
  },
  {
    p: 'Which sentence has correct subject-verb agreement?',
    o: [
      'The farmers work in the field.',
      'The farmers works in the field.',
      'The farmer work in the field.',
      'The farmer are working in the field.',
    ],
    c: 0,
    explanation: 'Plural subject "The farmers" takes the plural base verb "work".',
  },
  {
    p: 'Complete the sentence with a finished thought: "When the lights went out, ____."',
    o: [
      'the class stayed calm.',
      'because it was dark.',
      'during the storm.',
      'while the wind blew.',
    ],
    c: 0,
    explanation: '"the class stayed calm." provides the action that tells what happened when the lights went out.',
  },
  {
    p: "Find the adjective that tells how many in the sentence: 'Six goats grazed near the fence.'",
    o: ['goats', 'grazed', 'Six', 'fence'],
    c: 2,
    explanation: '"Six" is a numeral adjective that tells how many goats.',
  },
];

export const POSTTEST_ITEMS: QuizItem[] = [
  {
    p: 'Which one is a complete sentence?',
    o: [
      'Walking home after school.',
      'Pedro walked home after school.',
      'After school, home.',
      'Home after school walking.',
    ],
    c: 1,
    explanation: '"Pedro walked home after school." has a subject (Pedro) and verb (walked) and tells a complete thought.',
  },
  {
    p: 'Choose the sentence with correct subject-verb agreement.',
    o: [
      'The cats chases the rat.',
      'The cats chase the rat.',
      'The cat chasing the rat.',
      'The cat chase the rat.',
    ],
    c: 1,
    explanation: 'Plural subject "The cats" takes the base verb "chase".',
  },
  {
    p: 'Arrange the words into a correct sentence: (a story / the teacher / read / to the class)',
    o: [
      'Read the teacher a story to the class.',
      'The teacher read a story to the class.',
      'A story read the teacher to the class.',
      'To the class a story the teacher read.',
    ],
    c: 1,
    explanation: 'Subject (The teacher) + Verb (read) + Object (a story) + Prepositional phrase (to the class).',
  },
  {
    p: "What part of speech is the underlined word? 'The **SWEET** mangoes are ripe.'",
    o: ['Noun', 'Verb', 'Adjective', 'Adverb'],
    c: 2,
    explanation: '"SWEET" describes the noun "mangoes", so it is an Adjective.',
  },
  {
    p: "What part of speech is the underlined word? 'The pupils **WROTE** a poem.'",
    o: ['Noun', 'Verb', 'Adjective', 'Pronoun'],
    c: 1,
    explanation: '"WROTE" tells the action done by the pupils, so it is a Verb.',
  },
  {
    p: "Identify the noun in the sentence: 'The fisherman sailed across the calm river.'",
    o: ['sailed', 'across', 'calm', 'fisherman'],
    c: 3,
    explanation: '"fisherman" is a person, making it a Noun.',
  },
  // Additional 6 Items for Posttest (parallel to Pretest 7-12):
  {
    p: 'Which group of words is NOT a complete sentence?',
    o: [
      'Nanay cooked sinigang.',
      'Beside the old well.',
      'The boys flew their kites.',
      'We waited for the bus.',
    ],
    c: 1,
    explanation: '"Beside the old well." is a prepositional phrase without a subject or verb doing an action.',
  },
  {
    p: "What part of speech is the underlined word? 'The pupils worked **QUIETLY** on the project.'",
    o: ['Noun', 'Verb', 'Adjective', 'Adverb'],
    c: 3,
    explanation: '"QUIETLY" tells HOW the pupils worked, making it an Adverb.',
  },
  {
    p: "Which word is a proper noun? 'Our class will visit **Baguio** next month.'",
    o: ['class', 'visit', 'Baguio', 'month'],
    c: 2,
    explanation: '"Baguio" is the specific name of a place and begins with a capital letter (Proper Noun).',
  },
  {
    p: 'Which sentence has correct subject-verb agreement?',
    o: [
      'The birds sings at dawn.',
      'The bird sing at dawn.',
      'The birds sing at dawn.',
      'The bird are singing at dawn.',
    ],
    c: 2,
    explanation: 'Plural subject "The birds" matches base verb "sing".',
  },
  {
    p: 'Complete the sentence with a finished thought: "After the program ended, ____."',
    o: [
      'the guests went home.',
      'because the guests were tired.',
      'while the band packed up.',
      'when the lights dimmed.',
    ],
    c: 0,
    explanation: '"the guests went home." gives the finished message.',
  },
  {
    p: "Find the adjective in the sentence: 'She wore a **yellow** dress to the party.'",
    o: ['wore', 'yellow', 'dress', 'party'],
    c: 1,
    explanation: '"yellow" describes the color of the dress (Adjective).',
  },
];

// -------------------------------------------------------------
// MISSION INTERACTIVE CURRICULUM DEFINITIONS WITH BONUS LAPS
// -------------------------------------------------------------
export interface BonusLapInfo {
  lapNumber: 1 | 2;
  unlockedTitle: string;
  unlockedDialogue: string;
  iDo: {
    coachMessage: string;
    displays: Array<{
      type: 'complete' | 'incomplete' | 'mixed' | 'display';
      text: string;
      coachExplanation: string;
      fix?: string;
    }>;
    formula?: string;
  };
  weDo: {
    coachMessage: string;
    challenges: Array<{
      title: string;
      prompt: string;
      options: string[];
      correct: number;
      explanation: string;
    }>;
  };
  youDo: {
    coachMessage: string;
    questions: QuizItem[];
  };
}

export interface MissionCurriculum {
  phaseKey: PhaseKey;
  dayNumber: number;
  missionNumber: number;
  title: string;
  subtitle: string;
  domain: string;
  badgeName: string;
  badgeIcon: string;
  briefing: {
    welcome: string;
    objectives: string[];
    tips?: string[];
  };
  iDo: {
    coachMessage: string;
    rules: string[];
    examples: Array<{
      type: 'complete' | 'incomplete' | 'breakdown' | 'parts';
      text: string;
      analysis: Array<{ label: string; text: string; icon: string }>;
      question?: string;
      explanation: string;
    }>;
    guideSummary: {
      title: string;
      steps: string[];
      formula?: string;
    };
    quickCheck: {
      question: string;
      options: string[];
      correct: number;
      explanation: string;
    };
  };
  weDo: {
    coachMessage: string;
    hints: string[];
    challenges: Array<{
      title: string;
      prompt: string;
      options: string[];
      correct: number;
      explanation: string;
    }>;
  };
  youDo: {
    coachMessage: string;
    questions: QuizItem[];
  };
  bonusLap1?: BonusLapInfo;
  bonusLap2?: BonusLapInfo;
}

export const MISSIONS_CURRICULUM: Record<string, MissionCurriculum> = {
  session1: {
    phaseKey: 'session1',
    dayNumber: 1,
    missionNumber: 1,
    title: 'Sentence Starters',
    subtitle: 'Completeness of Thought',
    domain: 'Basic Sentence Construction',
    badgeName: 'SENTENCE STARTER MEDAL',
    badgeIcon: '🏅',
    briefing: {
      welcome: "Great job finishing the Pretest, Relay Runners! 🏃 Time for your first mission — let's learn to spot a complete sentence!",
      objectives: [
        'Identify a complete thought',
        'Identify an incomplete thought (sentence fragment)',
        'Complete a sentence so its meaning is finished and clear',
      ],
      tips: [
        'A complete thought is a sentence that gives a finished message.',
        'Always ask: WHO or WHAT is it about? WHAT HAPPENED? Is the message finished?',
      ],
    },
    iDo: {
      coachMessage: 'Watch me first! A complete thought is a sentence that gives a finished message.',
      rules: [
        '1️⃣ WHO or WHAT is it about?',
        '2️⃣ WHAT HAPPENED?',
        '3️⃣ Is the message finished?',
      ],
      examples: [
        {
          type: 'complete',
          text: 'The runners lined up at the starting point.',
          analysis: [
            { label: 'WHO?', text: 'The runners', icon: '👤' },
            { label: 'WHAT HAPPENED?', text: 'They lined up', icon: '🏃' },
            { label: 'MORE INFO', text: 'at the starting point (tells us where)', icon: '📍' },
          ],
          explanation: 'This gives us a complete message — we know WHO and WHAT HAPPENED.',
        },
        {
          type: 'incomplete',
          text: 'Because the runner tripped near the finish line.',
          analysis: [
            { label: 'LOOK CLOSELY', text: 'This sentence leaves us hanging!', icon: '⚠️' },
            { label: 'FIX IT', text: 'The team lost the race because the runner tripped near the finish line.', icon: '💡' },
          ],
          question: 'Is this a complete thought?',
          explanation: 'No! It makes us expect more: "What happened because the runner tripped?" It is an incomplete thought.',
        },
      ],
      guideSummary: {
        title: "Coach Dash's 3-Step Check",
        steps: [
          '👉 1. WHO OR WHAT? — Who or what is the sentence about?',
          '👉 2. WHAT HAPPENED? — What did the subject do?',
          '👉 3. IS IT FINISHED? — Does it give a complete message?',
        ],
        formula: 'WHO/WHAT + ACTION + FINISHED MESSAGE = Complete Sentence',
      },
      quickCheck: {
        question: 'Which one is complete?',
        options: [
          'The fastest runner on our team.',
          'The fastest runner on our team won first place.',
          'Because the fastest runner on our team.',
        ],
        correct: 1,
        explanation: '✅ "The fastest runner on our team won first place." gives us a complete message!',
      },
    },
    weDo: {
      coachMessage: "Now it's your turn to practice with me! Discuss with your group before the Runner taps.",
      hints: [
        '💡 Hint 1: Look for a sentence that gives a finished message.',
        '💡 Hint 2: Ask — can this sentence stand by itself?',
        '💡 Hint 3: A sentence starting with "because" or "when" may need another part.',
      ],
      challenges: [
        {
          title: 'WE DO Challenge 1',
          prompt: 'Which sentence expresses a complete thought?',
          options: [
            'Because Ana was tired from the relay.',
            'Ana rested because she was tired from the relay.',
            'After Ana finished the relay.',
          ],
          correct: 1,
          explanation: '🎉 Excellent teamwork! "Ana rested because she was tired from the relay." gives a finished message.',
        },
        {
          title: 'WE DO Challenge 2',
          prompt: 'Which one is incomplete?',
          options: [
            'The team practiced every afternoon.',
            'The coach was proud.',
            'When the team practiced every afternoon.',
          ],
          correct: 2,
          explanation: '🎯 "When the team practiced every afternoon" makes us expect another part, like: "When the team practiced every afternoon, they improved their time."',
        },
        {
          title: 'WE DO Challenge 3 — Fix the Thought',
          prompt: '🔧 "Maria before joining the relay team." — Something is missing. Can your group fix it?',
          options: [
            'Maria before joining the relay team.',
            'Maria trained hard before joining the relay team.',
            'Because Maria before joining the relay team.',
          ],
          correct: 1,
          explanation: 'The original sentence tells us WHO, but not WHAT HAPPENED. The fixed sentence gives a complete message!',
        },
      ],
    },
    youDo: {
      coachMessage: "You've practiced with me — now show what you've learned! Everyone thinks first; the Runner taps the group's final answer. No hints this time.",
      questions: [
        {
          p: 'Which sentence expresses a complete thought?',
          o: [
            'Because Kian runs every relay.',
            'Kian runs fast but is still tired.',
            'After Kian finished the race.',
            'While Kian was running.',
          ],
          c: 1,
          explanation: '"Kian runs fast but is still tired." tells who and what happened completely.',
        },
        {
          p: 'Which sentence expresses a complete thought?',
          o: [
            'Because the baton was dropped.',
            'After the baton fell.',
            'The baton fell into the mud.',
            'While the baton was rolling.',
          ],
          c: 2,
          explanation: '"The baton fell into the mud." is a finished thought.',
        },
        {
          p: 'Which sentence expresses a complete thought?',
          o: [
            'Because the coach is busy.',
            'After coaching the team.',
            'The coach is training the team.',
            'While the coach explains.',
          ],
          c: 2,
          explanation: '"The coach is training the team." expresses a full statement.',
        },
        {
          p: 'Which sentence is complete?',
          o: [
            'Because the girl loves running.',
            'The girl is running the relay.',
            'After running the relay.',
            'While the crowd was cheering.',
          ],
          c: 1,
          explanation: '"The girl is running the relay." has subject and verb and stands alone.',
        },
        {
          p: 'Which sentence expresses a complete thought?',
          o: [
            'Because Santino wakes up early.',
            'After waking up early.',
            "Santino wakes up early so he won't be late for practice.",
            'While getting ready for practice.',
          ],
          c: 2,
          explanation: '"Santino wakes up early so he won\'t be late for practice." gives a full explanation and finished message.',
        },
      ],
    },
    // BONUS LAP 1 (From PDF Page 1-2)
    bonusLap1: {
      lapNumber: 1,
      unlockedTitle: 'BONUS LAP UNLOCKED!',
      unlockedDialogue: "Great run, Relay Runners! Ready for an extra lap? New sentences, same skills — let's keep those legs warm!",
      iDo: {
        coachMessage: "Watch Coach Dash's Extra Turn!",
        displays: [
          {
            type: 'complete',
            text: 'Lola sells fresh bananas at the palengke.',
            coachExplanation: 'Tap "Lola" ➔ 👥 WHO? Lola. Tap "sells" ➔ 🏃 WHAT HAPPENED? She sells. Tap "fresh bananas at the palengke" ➔ 📍 MORE INFO: tells what she sells and where.',
          },
          {
            type: 'incomplete',
            text: 'Unless the rain stops before noon.',
            coachExplanation: 'Is this finished? Not yet! It makes us ask: "Then what will happen?"',
            fix: 'Unless the rain stops before noon, the program will be moved indoors.',
          },
        ],
      },
      weDo: {
        coachMessage: "Practice with your group on Bonus Lap 1!",
        challenges: [
          {
            title: 'BONUS WE DO Challenge 1',
            prompt: 'Which one is incomplete?',
            options: [
              'The kite flew over the rice field.',
              'Whenever the wind blows hard.',
              'Grandpa fixed the broken fence.',
            ],
            correct: 1,
            explanation: '"Whenever the wind blows hard" makes us expect another part, like: "Whenever the wind blows hard, the kites fly higher."',
          },
          {
            title: 'BONUS WE DO Challenge 2 — TRUE OR FALSE',
            prompt: '"Since our class won the contest." is a complete sentence.',
            options: ['TRUE', 'FALSE'],
            correct: 1,
            explanation: 'It starts with "since," so we expect more: "Since our class won the contest, we got a trophy."',
          },
          {
            title: 'BONUS WE DO Challenge 3 — FIX THE THOUGHT',
            prompt: '❌ "The scouts after the flag ceremony." — Something is missing. Can your group fix it?',
            options: [
              'The scouts after the flag ceremony.',
              'The scouts cleaned the school ground after the flag ceremony.',
              'Although the scouts after the flag ceremony.',
            ],
            correct: 1,
            explanation: 'The original sentence tells us WHO, but not WHAT HAPPENED. "Cleaned" completes the message!',
          },
        ],
      },
      youDo: {
        coachMessage: "Last lap! Think first, then the Runner taps the group's final answer. No hints this time.",
        questions: [
          {
            p: 'Which sentence expresses a complete thought?',
            o: [
              'Although the farmer planted rice.',
              'The farmer planted rice in the wet field.',
              'Before the rainy season starts.',
              'When the farmer woke up early.',
            ],
            c: 1,
            explanation: '"The farmer planted rice in the wet field." is a complete thought.',
          },
          {
            p: 'Which sentence expresses a complete thought?',
            o: [
              'If our class wins the quiz bee.',
              'Since the typhoon was strong.',
              'The students walked calmly during the earthquake drill.',
              'While the teacher was counting.',
            ],
            c: 2,
            explanation: '"The students walked calmly during the earthquake drill." has subject and verb and expresses a finished message.',
          },
          {
            p: 'Which one is incomplete?',
            o: [
              'My cousin sells dried fish.',
              'Whenever Lola visits us.',
              'The sari-sari store opens at six.',
              'Our class planted a garden.',
            ],
            c: 1,
            explanation: '"Whenever Lola visits us." is incomplete (dependent clause).',
          },
          {
            p: 'Which sentence is complete?',
            o: [
              'Until the bell rings.',
              'After the long recess.',
              'Because Rico was hungry.',
              'Rico shared his lunch with a classmate.',
            ],
            c: 3,
            explanation: '"Rico shared his lunch with a classmate." gives a finished thought.',
          },
          {
            p: 'Which sentence expresses a complete thought?',
            o: [
              'The librarian arranged the old books on the shelf.',
              'Unless the library is closed.',
              'As soon as the librarian arrived.',
              'Although the books were old.',
            ],
            c: 0,
            explanation: '"The librarian arranged the old books on the shelf." is complete.',
          },
        ],
      },
    },
    // BONUS LAP 2 (From PDF Page 3-5)
    bonusLap2: {
      lapNumber: 2,
      unlockedTitle: 'BONUS LAP 2 UNLOCKED!',
      unlockedDialogue: "Two laps down, Relay Runners — and you're still running strong! Here's one more with brand-new sentences.",
      iDo: {
        coachMessage: "Bonus Lap 2 — Coach Dash's Turn",
        displays: [
          {
            type: 'complete',
            text: 'Mang Isko repaired the old boat.',
            coachExplanation: 'WHO? Mang Isko. WHAT HAPPENED? He repaired the old boat. The message is finished!',
          },
          {
            type: 'incomplete',
            text: 'While the engine was still running.',
            coachExplanation: 'This one leaves us waiting. We ask: "What happened while the engine was running?"',
            fix: 'While the engine was still running, Mang Isko repaired the boat.',
          },
        ],
      },
      weDo: {
        coachMessage: "Bonus Lap 2 — Practice together!",
        challenges: [
          {
            title: 'BONUS LAP 2 — Challenge 1 — COMPLETE THE THOUGHT',
            prompt: 'When the lights went out, ____.',
            options: [
              'the class stayed calm.',
              'because it was dark.',
              'during the storm.',
            ],
            correct: 0,
            explanation: 'The missing part must tell us WHAT HAPPENED. "The class stayed calm" finishes the message!',
          },
          {
            title: 'BONUS LAP 2 — Challenge 2 — WHAT IS MISSING?',
            prompt: 'Which group of words needs more to become a sentence?',
            options: [
              'Our school won the cleanest-school award.',
              'The new library near the gym.',
              'The pupils planted trees.',
            ],
            correct: 1,
            explanation: '"The new library near the gym" names WHO or WHAT, but it never tells WHAT HAPPENED.',
          },
        ],
      },
      youDo: {
        coachMessage: "No hints this time. Think first, then the Runner taps the final answer!",
        questions: [
          {
            p: 'After the program ended, ____.',
            o: [
              'the guests went home.',
              'because the guests were tired.',
              'while the band packed up.',
              'when the lights dimmed.',
            ],
            c: 0,
            explanation: '"the guests went home." gives the finished message.',
          },
          {
            p: 'Which one is a complete sentence?',
            o: [
              'The old lighthouse on the hill.',
              'Standing near the shore.',
              'The old lighthouse guided the ships.',
              'Because the old lighthouse.',
            ],
            c: 2,
            explanation: '"The old lighthouse guided the ships." is complete.',
          },
          {
            p: 'Which group of words is NOT a complete sentence?',
            o: [
              'Nanay cooked sinigang.',
              'Beside the old well.',
              'The boys flew their kites.',
              'We waited for the bus.',
            ],
            c: 1,
            explanation: '"Beside the old well." is a prepositional phrase without a subject or action.',
          },
          {
            p: 'I forgot my umbrella, so ____.',
            o: [
              'although it was sunny.',
              'unless it rained.',
              'when I left.',
              'I got wet in the rain.',
            ],
            c: 3,
            explanation: '"I got wet in the rain." provides the outcome and complete message.',
          },
          {
            p: 'Which sentence expresses a complete thought?',
            o: [
              'Since the road was flooded.',
              'The road was closed after the heavy rains.',
              'Until the water goes down.',
              'Whenever it rains heavily.',
            ],
            c: 1,
            explanation: '"The road was closed after the heavy rains." is a finished statement.',
          },
        ],
      },
    },
  },
  session2: {
    phaseKey: 'session2',
    dayNumber: 2,
    missionNumber: 2,
    title: 'Word Order Relay',
    subtitle: 'Word Arrangement & Sentence Building',
    domain: 'Basic Sentence Construction',
    badgeName: 'WORD ORDER RUNNER',
    badgeIcon: '🥈',
    briefing: {
      welcome: "Welcome back, Relay Runners! Today we'll learn how to put words in the right order to build a clear sentence.",
      objectives: [
        '👉 Arrange — put words in the correct order',
        '👉 Read — check if the sentence sounds natural and right',
        '👉 Think — ask what the sentence is trying to say',
        '👉 Check — make sure the whole sentence makes sense',
      ],
      tips: [
        'Words need to be in the right places so a sentence makes sense.',
        'Remember: WHO/WHAT? + WHAT DID THEY DO? + MORE INFORMATION',
      ],
    },
    iDo: {
      coachMessage: 'Watch me arrange words into a clear order step-by-step!',
      rules: [
        'Step 1: Find WHO or WHAT (Subject)',
        'Step 2: Find the ACTION (Verb)',
        'Step 3: Add MORE INFORMATION (Where? When? How?)',
      ],
      examples: [
        {
          type: 'breakdown',
          text: 'track the running relay are quickly students the',
          analysis: [
            { label: 'STEP 1: WHO/WHAT?', text: 'the students (Subject)', icon: '👥' },
            { label: 'STEP 2: ACTION', text: 'are running (Verb)', icon: '🏃' },
            { label: 'STEP 3: MORE INFO', text: 'quickly on the track (How & Where)', icon: '📍' },
          ],
          explanation: 'Complete sentence: "The students are running on the track."',
        },
      ],
      guideSummary: {
        title: "Coach Dash's Word-Order Guide",
        steps: [
          '👉 WHO/WHAT? (Subject) — The students',
          '👉 WHAT DID THEY DO? (Verb/Action) — are running',
          '👉 MORE INFORMATION (Where? When? How?) — on the track',
        ],
        formula: 'WHO + ACTION + MORE INFORMATION',
      },
      quickCheck: {
        question: 'Which sentence is correct?',
        options: [
          'Quickly the students are running on the track.',
          'The track are running quickly in the students.',
          'The students are running quickly on the track.',
        ],
        correct: 2,
        explanation: '✅ "The students are running quickly on the track." follows natural Subject + Verb + Adverb + Preposition order!',
      },
    },
    weDo: {
      coachMessage: "Now we'll arrange sentences together! Remember: READ — THINK — ARRANGE — CHECK.",
      hints: [
        '💡 Hint 1: Who is doing the action?',
        '💡 Hint 2: Find the subject first.',
        '💡 Hint 3: After the subject, look for the action.',
        '💡 Hint 4: Read the sentence from beginning to end to hear if it sounds right.',
      ],
      challenges: [
        {
          title: 'WE DO Challenge 1 — Arrange the Words',
          prompt: 'Words: "school | to | goes | Jose | every relay day"',
          options: [
            'Jose goes to school every relay day.',
            'Every relay day Jose to school goes.',
            'Goes Jose to school every relay day.',
          ],
          correct: 0,
          explanation: '🎉 Correct: "Jose goes to school every relay day."',
        },
        {
          title: 'WE DO Challenge 2 — Arrange the Words',
          prompt: 'Words: "on the track | are practicing | the runners"',
          options: [
            'On the track the runners are practicing.',
            'The runners are practicing on the track.',
            'Are practicing the runners on the track.',
          ],
          correct: 1,
          explanation: '"The runners" tells us who. "are practicing" tells us what. "on the track" gives more information.',
        },
        {
          title: 'WE DO Challenge 3 — Fix the Sentence',
          prompt: '⚠️ "Baton he passes never."',
          options: [
            'He never passes the baton.',
            'He passes never the baton.',
            'Baton never he passes.',
          ],
          correct: 0,
          explanation: 'Excellent! "He never passes the baton." is arranged in a natural, clear order.',
        },
      ],
    },
    youDo: {
      coachMessage: "Everyone thinks first — the Runner arranges or taps the group's answer. No hints this time!",
      questions: [
        {
          p: 'Which sentence has the correct word order?',
          o: [
            'The finish line I ran toward.',
            'I ran toward the finish line.',
            'Toward I ran the finish line.',
          ],
          c: 1,
          explanation: 'Subject "I" + Verb "ran" + Prepositional phrase "toward the finish line".',
        },
        {
          p: 'Which sentence has the correct word order?',
          o: [
            'The dog barks outside.',
            'Outside the dog barks.',
            'Barks the dog outside.',
          ],
          c: 0,
          explanation: 'Subject (The dog) + Verb (barks) + Location (outside).',
        },
        {
          p: 'Arrange: pizza | I ate | the | leftover',
          o: [
            'I ate the leftover pizza.',
            'The leftover I ate pizza.',
            'Pizza I the leftover ate.',
          ],
          c: 0,
          explanation: '"I ate the leftover pizza." is the standard subject-verb-object arrangement.',
        },
        {
          p: 'Arrange: over | her | She cried | grades',
          o: [
            'She cried over her grades.',
            'Over grades she cried her.',
            'Her grades over she cried.',
          ],
          c: 0,
          explanation: '"She cried over her grades." is grammatically sound.',
        },
        {
          p: 'Which sentence has the correct word order?',
          o: [
            'In the track running the runners are.',
            'The runners are running in the track.',
            'Running the track are runners in.',
          ],
          c: 1,
          explanation: '"The runners are running in the track." has the correct syntax.',
        },
      ],
    },
    // BONUS LAP 1 (From PDF Page 5-7)
    bonusLap1: {
      lapNumber: 1,
      unlockedTitle: 'BONUS LAP UNLOCKED!',
      unlockedDialogue: "Nice work, Relay Runners! Let's stretch your word-order skills with one more lap!",
      iDo: {
        coachMessage: "Coach Dash's Extra Turn",
        displays: [
          {
            type: 'mixed',
            text: 'harvested farmers the yesterday rice',
            coachExplanation: 'Who is the sentence about? The farmers. What did they do? Harvested. Harvested what? The rice. When? Yesterday.',
            fix: 'The farmers harvested the rice yesterday.',
          },
        ],
        formula: 'WHO + ACTION + WHAT / WHEN / WHERE / HOW',
      },
      weDo: {
        coachMessage: "Practice word order together!",
        challenges: [
          {
            title: 'BONUS WE DO Challenge 1 — ARRANGE THE WORDS',
            prompt: 'Words: "her lola | Mia | helped | in the kitchen"',
            options: [
              'Mia helped her lola in the kitchen.',
              'In the kitchen Mia her lola helped.',
              'Helped Mia her lola in the kitchen.',
            ],
            correct: 0,
            explanation: 'Correct: Mia helped her lola in the kitchen.',
          },
          {
            title: 'BONUS WE DO Challenge 2 — FIX THE SENTENCE',
            prompt: '❌ "Fish the cat eats every night."',
            options: [
              'Every night eats the cat fish.',
              'The cat eats fish every night.',
              'Fish eats the cat every night.',
            ],
            correct: 1,
            explanation: 'Careful! Word order changes the meaning. "The cat eats fish every night" is correct.',
          },
          {
            title: 'BONUS WE DO Challenge 3',
            prompt: 'Which sentence has the correct word order?',
            options: [
              'The class made a poster about recycling.',
              'Made the class about a poster recycling.',
              'A poster the class recycling about made.',
            ],
            correct: 0,
            explanation: 'Excellent! WHO (the class) + ACTION (made) + WHAT (a poster about recycling).',
          },
        ],
      },
      youDo: {
        coachMessage: "One more lap! Everyone thinks first — the Runner taps the group's answer. No hints this time!",
        questions: [
          {
            p: 'Which sentence has the correct word order?',
            o: [
              'Sold my aunt rice cakes at the plaza.',
              'My aunt sold rice cakes at the plaza.',
              'Rice cakes at the plaza sold my aunt.',
              'At the plaza my aunt rice cakes sold.',
            ],
            c: 1,
            explanation: '"My aunt sold rice cakes at the plaza." follows standard Subject + Verb + Object + Place.',
          },
          {
            p: 'Which sentence has the correct word order?',
            o: [
              'The students sang the national anthem proudly.',
              'Sang the students proudly the national anthem.',
              'Proudly anthem the national the students sang.',
              'The national anthem sang the students proudly.',
            ],
            c: 0,
            explanation: '"The students sang the national anthem proudly." is correct.',
          },
          {
            p: 'Arrange: fed | the chickens | every morning | Tomas',
            o: [
              'Fed Tomas the chickens every morning.',
              'Tomas the chickens fed every morning.',
              'Every morning the chickens Tomas fed.',
              'Tomas fed the chickens every morning.',
            ],
            c: 3,
            explanation: '"Tomas fed the chickens every morning." is the correct arrangement.',
          },
          {
            p: 'Arrange: the bridge | crossed | the carabao | slowly',
            o: [
              'Slowly the bridge crossed the carabao.',
              'Crossed the carabao the bridge slowly.',
              'The carabao slowly crossed the bridge.',
              'The bridge crossed slowly the carabao.',
            ],
            c: 2,
            explanation: '"The carabao slowly crossed the bridge." has proper word order.',
          },
          {
            p: 'Which sentence has the correct word order?',
            o: [
              'Heavily fell the rain last night.',
              'The rain fell heavily last night.',
              'Last night fell the rain heavily.',
              'The fell rain heavily last night.',
            ],
            c: 1,
            explanation: '"The rain fell heavily last night." is correct.',
          },
        ],
      },
    },
    // BONUS LAP 2 (From PDF Page 7-9)
    bonusLap2: {
      lapNumber: 2,
      unlockedTitle: 'BONUS LAP 2 UNLOCKED!',
      unlockedDialogue: "Two laps done, Relay Runners! Time for one more word-order challenge with new sentences and a new kind of question.",
      iDo: {
        coachMessage: "Bonus Lap 2 — Coach Dash's Turn",
        displays: [
          {
            type: 'mixed',
            text: 'in the garden | planted | my father | tomatoes | last Saturday',
            coachExplanation: 'Who? My father. Action? Planted. What? Tomatoes. Then WHERE comes first, and WHEN comes last.',
            fix: 'My father planted tomatoes in the garden last Saturday.',
          },
        ],
        formula: 'WHO + ACTION + WHAT + WHERE + WHEN',
      },
      weDo: {
        coachMessage: "Bonus Lap 2 — Practice together!",
        challenges: [
          {
            title: 'BONUS LAP 2 — Challenge 1 — ARRANGE THE WORDS',
            prompt: 'Words: "the lost puppy | found | Carla | near the gate"',
            options: [
              'Carla found the lost puppy near the gate.',
              'Near the gate Carla the lost puppy found.',
              'Found Carla the lost puppy near the gate.',
            ],
            correct: 0,
            explanation: 'Correct: Carla found the lost puppy near the gate.',
          },
          {
            title: 'BONUS LAP 2 — Challenge 2',
            prompt: 'Which sentence has the correct word order?',
            options: [
              'Our neighbor waters the plants every evening.',
              'Waters our neighbor every evening the plants.',
              'Every our neighbor plants evening waters the.',
            ],
            correct: 0,
            explanation: 'Great! WHO (our neighbor) + ACTION (waters) + WHAT (the plants) + WHEN (every evening).',
          },
        ],
      },
      youDo: {
        coachMessage: "No hints this time. Read it aloud in your head before you tap!",
        questions: [
          {
            p: 'Arrange: bought | a new bicycle | my cousin | yesterday',
            o: [
              'Bought my cousin a new bicycle yesterday.',
              'My cousin yesterday a new bicycle bought.',
              'My cousin bought a new bicycle yesterday.',
              'A new bicycle my cousin yesterday bought.',
            ],
            c: 2,
            explanation: '"My cousin bought a new bicycle yesterday." is correct.',
          },
          {
            p: 'Which sentence has the correct word order?',
            o: [
              'The nurse gently cleaned the wound.',
              'Gently the wound cleaned the nurse.',
              'Cleaned gently nurse the the wound.',
              'The wound the nurse gently cleaned.',
            ],
            c: 0,
            explanation: '"The nurse gently cleaned the wound." is correct.',
          },
          {
            p: 'Arrange: the baby | smiled | at her mother | happily',
            o: [
              'Smiled the baby at happily her mother.',
              'Happily smiled at her mother the baby.',
              'The happily baby smiled her mother at.',
              'The baby smiled happily at her mother.',
            ],
            c: 3,
            explanation: '"The baby smiled happily at her mother." is the proper order.',
          },
          {
            p: 'Which sentence is NOT in the correct word order?',
            o: [
              'The twins sang a lullaby softly.',
              'Plays the band loudly the music.',
              'Our neighbor waters the plants every evening.',
              'The market opens early on Sundays.',
            ],
            c: 1,
            explanation: '"Plays the band loudly the music." is incorrect (verb placed before subject and object separated).',
          },
          {
            p: 'Which sentence has the correct word order?',
            o: [
              'Repaired the mechanic carefully the engine.',
              'The engine repaired carefully the mechanic.',
              'The mechanic repaired the engine carefully.',
              'Carefully the engine the mechanic repaired.',
            ],
            c: 2,
            explanation: '"The mechanic repaired the engine carefully." is grammatically sound.',
          },
        ],
      },
    },
  },
  session3: {
    phaseKey: 'session3',
    dayNumber: 3,
    missionNumber: 3,
    title: 'Noun & Verb Hunt',
    subtitle: 'Parts of Speech: Nouns & Verbs',
    domain: 'Parts of Speech Recognition',
    badgeName: 'NOUN & VERB HUNTER',
    badgeIcon: '🥉',
    briefing: {
      welcome: "Great progress, Relay Runners! Now let's switch events — today we hunt for nouns and verbs!",
      objectives: [
        '👉 NOUN — identify a person, place, animal, or thing',
        '👉 VERB — identify an action or state of being',
        "Every sentence needs at least one noun and one verb. Let's go hunting!",
      ],
      tips: [
        'Ask "who or what?" to find the NOUN.',
        'Ask "what is happening?" to find the VERB.',
      ],
    },
    iDo: {
      coachMessage: "Every sentence has building blocks. Let's inspect nouns and verbs!",
      rules: [
        'Ask "who or what?" to find the NOUN',
        'Ask "what is happening?" to find the VERB',
        'A sentence can have more than one noun — the doer and the receiver of the action',
      ],
      examples: [
        {
          type: 'parts',
          text: 'The fisherman caught three fish near the river.',
          analysis: [
            { label: 'NOUN (Person)', text: 'fisherman', icon: '👤' },
            { label: 'NOUN (Place)', text: 'river', icon: '🏞️' },
            { label: 'VERB (Action)', text: 'caught', icon: '🎣' },
          ],
          explanation: 'Fisherman and river name people/places. Caught tells the physical action.',
        },
        {
          type: 'parts',
          text: 'Our barangay celebrates its fiesta every May.',
          analysis: [
            { label: 'NOUN', text: 'barangay, fiesta', icon: '🏘️' },
            { label: 'VERB', text: 'celebrates', icon: '🎉' },
          ],
          explanation: 'Barangay and fiesta are nouns; celebrates is the verb action.',
        },
      ],
      guideSummary: {
        title: "Coach Dash's Noun & Verb Guide",
        steps: [
          '👉 Ask "who or what?" to find the NOUN.',
          '👉 Ask "what is happening?" to find the VERB.',
          '👉 A sentence can have more than one noun — the doer and the receiver.',
        ],
      },
      quickCheck: {
        question: "Find the noun: 'The teacher explained the lesson clearly.'",
        options: ['explained', 'clearly', 'lesson', 'the'],
        correct: 2,
        explanation: '"lesson" is a thing/concept, making it a Noun!',
      },
    },
    weDo: {
      coachMessage: "READ — THINK — DISCUSS — RUN. Let's find those nouns and verbs!",
      hints: [
        '💡 Hint 1: Ask "who or what" for nouns.',
        '💡 Hint 2: Ask "what is happening" for verbs.',
        '💡 Hint 3: Look for the word that shows action.',
      ],
      challenges: [
        {
          title: 'WE DO Challenge 1',
          prompt: "Find the verb: 'The fisherman caught three fish today.'",
          options: ['fisherman', 'caught', 'three', 'today'],
          correct: 1,
          explanation: '🎉 Correct! "Caught" tells us the action.',
        },
        {
          title: 'WE DO Challenge 2',
          prompt: "Find the noun: 'Our barangay celebrates its fiesta every May.'",
          options: ['celebrates', 'fiesta', 'every', 'its'],
          correct: 1,
          explanation: '🎉 Right! "Fiesta" names an event/thing, so it is a noun.',
        },
        {
          title: 'WE DO Challenge 3 — Fix It',
          prompt: '⚠️ "The relay quickly finished but forgot equipment." — A noun is missing! Who forgot the equipment?',
          options: [
            'The relay team quickly finished but forgot the equipment.',
            'Quickly finished but forgot the equipment.',
            'The relay quickly but forgot equipment.',
          ],
          correct: 0,
          explanation: 'Adding the noun "team" makes the sentence clear and complete!',
        },
      ],
    },
    youDo: {
      coachMessage: "No hints this time — show me what you've learned!",
      questions: [
        {
          p: "Identify the noun in the sentence: 'The children played in the barangay plaza.'",
          o: ['played', 'in', 'children', 'the'],
          c: 2,
          explanation: '"children" is a person (noun).',
        },
        {
          p: "Identify the noun in the sentence: 'The fisherman sailed across the calm river.'",
          o: ['sailed', 'across', 'calm', 'fisherman'],
          c: 3,
          explanation: '"fisherman" is a noun.',
        },
        {
          p: "Find the verb: 'Maria sings every afternoon.'",
          o: ['Maria', 'sings', 'every', 'afternoon'],
          c: 1,
          explanation: '"sings" is the action verb.',
        },
        {
          p: "Find the verb: 'The pupils wrote a poem.'",
          o: ['pupils', 'wrote', 'a', 'poem'],
          c: 1,
          explanation: '"wrote" is the action verb.',
        },
        {
          p: "Find the noun: 'The jeepney driver drove carefully through the flood.'",
          o: ['drove', 'carefully', 'driver', 'through'],
          c: 2,
          explanation: '"driver" is a noun.',
        },
      ],
    },
    // BONUS LAP 1 (From PDF Page 9-11)
    bonusLap1: {
      lapNumber: 1,
      unlockedTitle: 'BONUS LAP UNLOCKED!',
      unlockedDialogue: "Great hunting, Relay Runners! The trail has a few more nouns and verbs hiding. Ready for an extra lap?",
      iDo: {
        coachMessage: "Bonus Lap 1 — Coach Dash's Extra Turn",
        displays: [
          {
            type: 'display',
            text: 'A farmer feeds the carabao in the field.',
            coachExplanation: 'Tap "farmer" ➔ 🏷 NOUN (person). Tap "carabao" ➔ 🏷 NOUN (animal). Tap "field" ➔ 🏷 NOUN (place). Tap "feeds" ➔ ⚡ VERB (action).',
          },
          {
            type: 'display',
            text: 'The classroom is clean.',
            coachExplanation: 'Not all verbs show action! Some tell what someone or something IS. Tap "classroom" ➔ 🏷 NOUN. Tap "is" ➔ ⚡ VERB (state of being). Other state-of-being verbs: am, is, are, was, were.',
          },
        ],
      },
      weDo: {
        coachMessage: "Bonus We Do — Find those parts of speech!",
        challenges: [
          {
            title: 'BONUS WE DO Challenge 1',
            prompt: 'Find the noun: "My grandmother cooked soup for dinner."',
            options: ['cooked', 'for', 'grandmother', 'My'],
            correct: 2,
            explanation: '⭐ Correct! A grandmother is a person, so it is a noun.',
          },
          {
            title: 'BONUS WE DO Challenge 2',
            prompt: 'Find the verb: "The tricycle stopped near the church."',
            options: ['tricycle', 'stopped', 'near', 'church'],
            correct: 1,
            explanation: '⭐ Great! "Stopped" tells what the tricycle did.',
          },
          {
            title: 'BONUS WE DO Challenge 3 — FIX IT',
            prompt: '❌ "The bird on the branch of the acacia tree." — A verb is missing! What did the bird do?',
            options: [
              'The bird rested on the branch of the acacia tree.',
              'The bird on the branch of the acacia tree.',
              'Rested on the branch of the acacia tree.',
            ],
            correct: 0,
            explanation: '"rested" supplies the missing verb action!',
          },
        ],
      },
      youDo: {
        coachMessage: "No hints this time — one last hunt!",
        questions: [
          {
            p: 'Find the noun: "The vendor arranged vegetables on the table."',
            o: ['arranged', 'vendor', 'on', 'the'],
            c: 1,
            explanation: '"vendor" names a person (noun).',
          },
          {
            p: 'Find the verb: "Our class visited the museum last week."',
            o: ['class', 'museum', 'visited', 'last'],
            c: 2,
            explanation: '"visited" is the action verb.',
          },
          {
            p: 'Find the noun: "A butterfly landed on the flower."',
            o: ['landed', 'on', 'a', 'flower'],
            c: 3,
            explanation: '"flower" is a noun naming a thing.',
          },
          {
            p: 'Find the verb: "My brother is a lifeguard."',
            o: ['brother', 'is', 'a', 'lifeguard'],
            c: 1,
            explanation: '"is" is a state-of-being verb.',
          },
          {
            p: 'Find the noun: "The bakery near our school opens early."',
            o: ['bakery', 'near', 'opens', 'early'],
            c: 0,
            explanation: '"bakery" names a place (noun).',
          },
        ],
      },
    },
    // BONUS LAP 2 (From PDF Page 11-13)
    bonusLap2: {
      lapNumber: 2,
      unlockedTitle: 'BONUS LAP 2 UNLOCKED!',
      unlockedDialogue: "Two hunts done, Relay Runners! This lap has proper nouns and verbs that come in pairs.",
      iDo: {
        coachMessage: "Bonus Lap 2 — Proper Nouns & Helping Verbs",
        displays: [
          {
            type: 'display',
            text: 'Dr. Reyes visited Cebu in December.',
            coachExplanation: 'Tap "Dr. Reyes" ➔ 🏷 NOUN (specific person). Tap "Cebu" ➔ 🏷 NOUN (specific place). Tap "December" ➔ 🏷 NOUN (specific month). Names of specific people, places, and months are PROPER NOUNS — they start with a capital letter!',
          },
          {
            type: 'display',
            text: 'The pupils are reading a story.',
            coachExplanation: 'Sometimes the verb has two words! Tap "are reading" ➔ ⚡ VERB (helper word "are" + action word "reading").',
          },
        ],
      },
      weDo: {
        coachMessage: "Practice proper nouns and verb pairs!",
        challenges: [
          {
            title: 'BONUS LAP 2 — WE DO Challenge 1',
            prompt: 'Which word is a proper noun? "The children visited Manila last summer."',
            options: ['children', 'visited', 'Manila', 'summer'],
            correct: 2,
            explanation: '⭐ Correct! Manila is the specific name of a place, and it starts with a capital letter.',
          },
          {
            title: 'BONUS LAP 2 — WE DO Challenge 2',
            prompt: 'Find the verb: "The farmers are planting seedlings."',
            options: ['farmers', 'are planting', 'seedlings', 'The'],
            correct: 1,
            explanation: '⭐ Great! "Are planting" is the verb (helper + action).',
          },
        ],
      },
      youDo: {
        coachMessage: "No hints this time. Look for the capital letters and the action words!",
        questions: [
          {
            p: 'Which word is a proper noun? "Our class will visit Baguio next month."',
            o: ['class', 'visit', 'Baguio', 'month'],
            c: 2,
            explanation: '"Baguio" is a proper noun.',
          },
          {
            p: 'Find the verb: "The wind blew the leaves across the yard."',
            o: ['wind', 'blew', 'leaves', 'yard'],
            c: 1,
            explanation: '"blew" is the action verb.',
          },
          {
            p: 'Find the noun that names a place: "The students had lunch in the cafeteria."',
            o: ['students', 'lunch', 'had', 'cafeteria'],
            c: 3,
            explanation: '"cafeteria" is a noun that names a place.',
          },
          {
            p: 'Find the verb: "The baby is sleeping peacefully."',
            o: ['The baby', 'is sleeping', 'peacefully', 'baby'],
            c: 1,
            explanation: '"is sleeping" is the verb phrase.',
          },
          {
            p: 'Find the noun: "Rain fell on the roof."',
            o: ['roof', 'fell', 'on', 'the'],
            c: 0,
            explanation: '"roof" is a noun.',
          },
        ],
      },
    },
  },
  session4: {
    phaseKey: 'session4',
    dayNumber: 4,
    missionNumber: 4,
    title: 'Descriptor Dash & Grammar Champion',
    subtitle: 'Adjectives, Adverbs & Final Mixed Relay',
    domain: 'Parts of Speech Recognition + Combined Review',
    badgeName: 'GRAMMAR RELAY CHAMPION',
    badgeIcon: '🏆',
    briefing: {
      welcome: "This is it, Relay Runners! Today we learn adjectives and adverbs, then finish with the Grammar Champion Final Challenge!",
      objectives: [
        '👉 ADJECTIVE — describes a noun (what kind? how many?)',
        '👉 ADVERB — describes a verb (how, when, or where an action happens)',
        'Descriptor words make our sentences more colorful, precise, and clear!',
      ],
      tips: [
        'Adjectives describe nouns.',
        'Adverbs describe verbs (often ending in -ly).',
      ],
    },
    iDo: {
      coachMessage: "Watch how adjectives and adverbs enhance sentences!",
      rules: [
        '👉 ADJECTIVE describes a noun (tall tree, sweet mango)',
        '👉 ADVERB describes a verb (swayed gently, finished quickly)',
      ],
      examples: [
        {
          type: 'parts',
          text: 'The tall coconut tree swayed gently.',
          analysis: [
            { label: 'ADJECTIVE', text: 'tall (describes coconut tree)', icon: '🌴' },
            { label: 'ADVERB', text: 'gently (describes how it swayed)', icon: '🍃' },
          ],
          explanation: '"tall" tells what kind of tree; "gently" tells how it swayed.',
        },
        {
          type: 'parts',
          text: 'They quickly finished the relay game.',
          analysis: [
            { label: 'ADVERB', text: 'quickly (tells HOW they finished)', icon: '⚡' },
          ],
          explanation: '"quickly" describes the verb "finished".',
        },
      ],
      guideSummary: {
        title: "Coach Dash's Descriptor Guide",
        steps: [
          '👉 Adjectives describe nouns — what kind or how many?',
          '👉 Adverbs describe verbs — how, when, or where?',
          '👉 Adverbs often end in -ly (carefully, quickly, happily).',
        ],
      },
      quickCheck: {
        question: "Find the adverb: 'The jeepney driver drove carefully through the flood.'",
        options: ['carefully', 'driver', 'drove', 'flood'],
        correct: 0,
        explanation: '"carefully" describes HOW the driver drove, so it is an Adverb!',
      },
    },
    weDo: {
      coachMessage: "Let's tackle these descriptor challenges together before the championship!",
      hints: [
        '💡 Hint 1: Adjectives describe nouns — what kind or how many?',
        '💡 Hint 2: Adverbs describe verbs — how, when, or where?',
        '💡 Hint 3: Adverbs often end in -ly.',
      ],
      challenges: [
        {
          title: 'WE DO Challenge 1',
          prompt: "Find the adjective: 'The sweet mangoes are ripe.'",
          options: ['mangoes', 'sweet', 'are', 'ripe'],
          correct: 1,
          explanation: '"sweet" tells what kind of mangoes!',
        },
        {
          title: 'WE DO Challenge 2',
          prompt: "Identify the part of speech: 'They QUICKLY finished the relay game.'",
          options: ['Noun', 'Verb', 'Adjective', 'Adverb'],
          correct: 3,
          explanation: '"QUICKLY" describes how they finished, so it is an Adverb.',
        },
        {
          title: 'WE DO Challenge 3 — Fix It',
          prompt: '⚠️ "The pupils is excited for the relay." — Something\'s off with the verb! Can your group fix it?',
          options: [
            'The pupils is excited for the relay.',
            'The pupils are excited for the relay.',
            'Pupils excited relay for the.',
          ],
          correct: 1,
          explanation: 'Plural subject "The pupils" requires plural verb "are"!',
        },
      ],
    },
    youDo: {
      coachMessage: "This is the final stretch! These questions mix everything you've learned — sentence completeness, word order, nouns, verbs, adjectives, and adverbs.",
      questions: [
        {
          p: 'Which is a complete, correct sentence?',
          o: [
            'The pupils is excited for the relay.',
            'The pupils are excited for the relay.',
            'Pupils excited relay for the.',
            'Excited the pupils are for relay.',
          ],
          c: 1,
          explanation: '"The pupils are excited for the relay." is grammatically complete and accurate.',
        },
        {
          p: 'Arrange the words: (the whole family / cooked / adobo / for)',
          o: [
            'Cooked adobo for the whole family.',
            'The whole family cooked adobo for.',
            'Adobo cooked for the whole family.',
            'She cooked adobo for the whole family.',
          ],
          c: 3,
          explanation: '"She cooked adobo for the whole family." has subject, verb, and prepositional phrase in order.',
        },
        {
          p: "What part of speech is the underlined word? 'The **BRIGHT** star shone at night.'",
          o: ['Noun', 'Verb', 'Adjective', 'Adverb'],
          c: 2,
          explanation: '"BRIGHT" describes the star (Adjective).',
        },
        {
          p: "Identify the part of speech: 'They **QUICKLY** finished the relay game.'",
          o: ['Noun', 'Verb', 'Adjective', 'Adverb'],
          c: 3,
          explanation: '"QUICKLY" is an Adverb describing how they finished.',
        },
        {
          p: 'Which sentence expresses a complete thought and correct word order?',
          o: [
            'Because the runners crossed the finish line.',
            'The runners crossed the finish line first.',
            'Finish line the runners crossed.',
            'Crossed the runners finish line the.',
          ],
          c: 1,
          explanation: '"The runners crossed the finish line first." is a finished, properly arranged sentence.',
        },
      ],
    },
    // BONUS LAP 1 (From PDF Page 13-16)
    bonusLap1: {
      lapNumber: 1,
      unlockedTitle: 'BONUS LAP UNLOCKED!',
      unlockedDialogue: "Champions never stop! One more lap — with new descriptor words and a brand-new skill: subject-verb agreement.",
      iDo: {
        coachMessage: "Bonus Lap 1 — Descriptors & Subject-Verb Agreement",
        displays: [
          {
            type: 'display',
            text: 'The tiny kitten slept soundly.',
            coachExplanation: 'Tap "tiny" ➔ 🎨 ADJECTIVE (describes the kitten). Tap "soundly" ➔ 🏃 ADVERB (describes how it slept).',
          },
          {
            type: 'display',
            text: 'Our teacher arrived early.',
            coachExplanation: 'Adverbs do not always end in -ly! "Early" is an 🏃 ADVERB — it tells us WHEN the teacher arrived.',
          },
        ],
        formula: '1️⃣ ONE doer ➔ verb with -s (The runner trains daily) | 2️⃣ MANY doers ➔ verb without -s (The runners train daily)',
      },
      weDo: {
        coachMessage: "Practice subject-verb agreement & descriptors!",
        challenges: [
          {
            title: 'BONUS WE DO Challenge 1',
            prompt: 'Find the adjective: "The students carried heavy bags."',
            options: ['students', 'carried', 'heavy', 'bags'],
            correct: 2,
            explanation: '"heavy" describes the bags (Adjective).',
          },
          {
            title: 'BONUS WE DO Challenge 2',
            prompt: 'Find the adverb: "The turtle crawled slowly across the sand."',
            options: ['slowly', 'turtle', 'crawled', 'sand'],
            correct: 0,
            explanation: '"slowly" tells HOW the turtle crawled (Adverb).',
          },
          {
            title: 'BONUS WE DO Challenge 3 — SUBJECT-VERB AGREEMENT',
            prompt: 'Which sentence has correct subject-verb agreement?',
            options: [
              'My sister play the guitar.',
              'My sisters plays the guitar.',
              'My sister plays the guitar.',
            ],
            correct: 2,
            explanation: '"My sister" is ONE doer, so the verb takes -s: plays.',
          },
          {
            title: 'BONUS WE DO Challenge 4',
            prompt: 'Identify the part of speech: "We waited PATIENTLY in line."',
            options: ['Noun', 'Verb', 'Adjective', 'Adverb'],
            correct: 3,
            explanation: '⭐ Correct! "Patiently" tells HOW we waited (Adverb).',
          },
        ],
      },
      youDo: {
        coachMessage: "Everything you learned, one more time. No hints — go, Champions!",
        questions: [
          {
            p: 'Which sentence has correct subject-verb agreement?',
            o: [
              'The farmers work in the field.',
              'The farmers works in the field.',
              'The farmer work in the field.',
              'The farmer are working in the field.',
            ],
            c: 0,
            explanation: '"The farmers work in the field." is correct.',
          },
          {
            p: 'Find the adjective: "Lola baked fresh bread this morning."',
            o: ['baked', 'fresh', 'bread', 'morning'],
            c: 1,
            explanation: '"fresh" describes the bread (Adjective).',
          },
          {
            p: 'Find the adverb: "The audience clapped loudly after the song."',
            o: ['audience', 'clapped', 'loudly', 'song'],
            c: 2,
            explanation: '"loudly" is an Adverb describing how they clapped.',
          },
          {
            p: "What part of speech is the underlined word? 'The **HUNGRY** puppy waited at the gate.'",
            o: ['Noun', 'Verb', 'Adjective', 'Adverb'],
            c: 2,
            explanation: '"HUNGRY" describes the puppy (Adjective).',
          },
          {
            p: 'Which is a complete, correct sentence?',
            o: [
              'The children sings happily in the choir.',
              'Happily the choir children in sing.',
              'Because the children sing happily.',
              'The children sing happily in the choir.',
            ],
            c: 3,
            explanation: '"The children sing happily in the choir." has correct grammar and expresses a complete thought.',
          },
        ],
      },
    },
    // BONUS LAP 2 (From PDF Page 16-18)
    bonusLap2: {
      lapNumber: 2,
      unlockedTitle: 'BONUS LAP 2 UNLOCKED!',
      unlockedDialogue: "Final extra lap, Champions! More descriptor words, plus a review of subject-verb agreement.",
      iDo: {
        coachMessage: "Bonus Lap 2 — Adverbs of Place & How Many Adjectives",
        displays: [
          {
            type: 'display',
            text: 'The children played outside.',
            coachExplanation: '"Outside" is an 🏃 ADVERB — it tells us WHERE the children played.',
          },
          {
            type: 'display',
            text: 'Ten lanterns hung from the ceiling.',
            coachExplanation: '"Ten" is a 🎨 ADJECTIVE — it tells HOW MANY lanterns there are. Remember: adjectives answer WHAT KIND? or HOW MANY?',
          },
        ],
      },
      weDo: {
        coachMessage: "Final stretch practice!",
        challenges: [
          {
            title: 'BONUS LAP 2 — Challenge 1 — SUBJECT-VERB AGREEMENT',
            prompt: 'Which sentence has correct subject-verb agreement?',
            options: [
              'The lanterns is bright.',
              'The lanterns are bright.',
              'The lantern are bright.',
            ],
            correct: 1,
            explanation: '"Lanterns" means MANY, so we use "are."',
          },
          {
            title: 'BONUS LAP 2 — Challenge 2',
            prompt: 'Find the adjective that tells how many: "Six goats grazed near the fence."',
            options: ['goats', 'grazed', 'Six', 'fence'],
            correct: 2,
            explanation: '"Six" tells how many goats (Adjective).',
          },
        ],
      },
      youDo: {
        coachMessage: "Last stretch! No hints — show what a Grammar Champion can do.",
        questions: [
          {
            p: 'Which sentence has correct subject-verb agreement?',
            o: [
              'The birds sings at dawn.',
              'The bird sing at dawn.',
              'The birds sing at dawn.',
              'The bird are singing at dawn.',
            ],
            c: 2,
            explanation: '"The birds sing at dawn." has correct subject-verb agreement.',
          },
          {
            p: 'Find the adverb: "The children played outside after lunch."',
            o: ['outside', 'children', 'played', 'lunch'],
            c: 0,
            explanation: '"outside" tells where the children played (Adverb).',
          },
          {
            p: 'Find the adjective: "She wore a yellow dress to the party."',
            o: ['wore', 'yellow', 'dress', 'party'],
            c: 1,
            explanation: '"yellow" describes the color of the dress (Adjective).',
          },
          {
            p: "What part of speech is the underlined word? 'The pupils worked **QUIETLY** on the project.'",
            o: ['Noun', 'Verb', 'Adjective', 'Adverb'],
            c: 3,
            explanation: '"QUIETLY" describes how they worked (Adverb).',
          },
          {
            p: 'Which is a complete, correct sentence?',
            o: [
              'Because the lanterns glow brightly.',
              'The lanterns glow brightly at night.',
              'Brightly the lanterns night at glow.',
              'The lanterns glows brightly at night.',
            ],
            c: 1,
            explanation: '"The lanterns glow brightly at night." is a complete, correct sentence.',
          },
        ],
      },
    },
  },
};

// DepEd Grading Scale Helper
export function getDepEdRating(percentage: number): { label: string; color: string; bg: string } {
  if (percentage >= 90) {
    return { label: 'Outstanding (90% – 100%)', color: '#0F5132', bg: '#D1E7DD' };
  } else if (percentage >= 85) {
    return { label: 'Very Satisfactory (85% – 89%)', color: '#167A51', bg: '#E4F7EC' };
  } else if (percentage >= 80) {
    return { label: 'Satisfactory (80% – 84%)', color: '#2D82B7', bg: '#EAF2FA' };
  } else if (percentage >= 75) {
    return { label: 'Fairly Satisfactory (75% – 79%)', color: '#8A5200', bg: '#FFF1BF' };
  } else {
    return { label: 'Did Not Meet Expectations (<75%)', color: '#842029', bg: '#FCE7E4' };
  }
}
