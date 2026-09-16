// Static multilingual survey templates for the "New survey" flow.
// English and Nigerian Pidgin are hand-written in full. Hausa, Yoruba, and
// Igbo currently translate only the title/intro — the question wording
// stays in English with a review note, rather than risk shipping
// inaccurate machine-translated survey questions in a language we can't
// verify. Extend these as native-speaker-reviewed translations become
// available.

window.SurveyTemplates = {
  categories: [
    { key: 'customer_satisfaction', label: 'Customer satisfaction' },
    { key: 'employee_engagement', label: 'Employee engagement' },
    { key: 'event_feedback', label: 'Event feedback' },
  ],
  languages: [
    { key: 'en', label: 'English' },
    { key: 'pcm', label: 'Nigerian Pidgin' },
    { key: 'ha', label: 'Hausa (title only — review before use)' },
    { key: 'yo', label: 'Yoruba (title only — review before use)' },
    { key: 'ig', label: 'Igbo (title only — review before use)' },
  ],

  get(categoryKey, langKey) {
    const base = TEMPLATES[categoryKey];
    if (!base) return null;
    const full = base.en_pcm[langKey === 'pcm' ? 'pcm' : 'en'];
    const titleOverride = base.titles[langKey];
    return {
      title: titleOverride || full.title,
      description: full.description,
      questions: full.questions.map(q => ({ ...q, id: 'q_' + Math.random().toString(36).slice(2, 10) })),
      needsReview: !['en', 'pcm'].includes(langKey),
    };
  },
};

const TEMPLATES = {
  customer_satisfaction: {
    titles: {
      ha: 'Binciken Gamsuwar Abokin Ciniki',
      yo: 'Ìwádìí Ìtẹ́lọ́rùn Oníbàárà',
      ig: 'Nyocha Afọ Ojuju nke Ndị Ahịa',
    },
    en_pcm: {
      en: {
        title: 'Customer Satisfaction Survey',
        description: 'Tell us how we did — it takes less than 2 minutes.',
        questions: [
          { type: 'nps', label: 'How likely are you to recommend us to a friend or colleague?', required: true },
          { type: 'multiple_choice', label: 'Overall, how satisfied are you with your experience?', required: true, options: ['Very satisfied', 'Satisfied', 'Neutral', 'Dissatisfied', 'Very dissatisfied'] },
          { type: 'likert', label: 'The product/service met my expectations.', required: false },
          { type: 'textarea', label: 'What could we do better?', required: false },
          { type: 'text', label: 'Anything else you\'d like to share?', required: false },
        ],
      },
      pcm: {
        title: 'Survey For Customer Wey Dey Satisfied',
        description: 'Tell us how we perform — e no go pass 2 minutes.',
        questions: [
          { type: 'nps', label: 'How likely you go take recommend us to your friend or colleague?', required: true },
          { type: 'multiple_choice', label: 'For everything, how you take rate your experience?', required: true, options: ['I like am well well', 'I satisfied', 'E dey normal', 'I no too satisfied', 'I no satisfied at all'] },
          { type: 'likert', label: 'The product/service match wetin I expect.', required: false },
          { type: 'textarea', label: 'Wetin we fit do better?', required: false },
          { type: 'text', label: 'Anything else wey you wan tell us?', required: false },
        ],
      },
    },
  },
  employee_engagement: {
    titles: {
      ha: 'Binciken Hannun Ma\'aikata',
      yo: 'Ìwádìí Ìfarabalẹ̀ Òṣìṣẹ́',
      ig: 'Nyocha Mmetụta Ndị Ọrụ',
    },
    en_pcm: {
      en: {
        title: 'Employee Engagement Survey',
        description: 'Your honest feedback helps us build a better workplace. Responses can be anonymous.',
        questions: [
          { type: 'likert', label: 'I feel valued at work.', required: true },
          { type: 'likert', label: 'I have the tools and resources I need to do my job well.', required: true },
          { type: 'nps', label: 'How likely are you to recommend this company as a place to work?', required: true },
          { type: 'multiple_choice', label: 'How would you rate communication from management?', required: false, options: ['Excellent', 'Good', 'Fair', 'Poor'] },
          { type: 'textarea', label: 'What would make your work experience better?', required: false },
        ],
      },
      pcm: {
        title: 'Survey For Workers Engagement',
        description: 'Your correct feedback go help us build better workplace. You fit answer am anonymous.',
        questions: [
          { type: 'likert', label: 'I dey feel valued for work.', required: true },
          { type: 'likert', label: 'I get the tools and resources wey I need to do my work well well.', required: true },
          { type: 'nps', label: 'How likely you go take recommend this company as good place to work?', required: true },
          { type: 'multiple_choice', label: 'How you go rate the way management dey communicate?', required: false, options: ['E dey excellent', 'E good', 'E dey fair', 'E no good'] },
          { type: 'textarea', label: 'Wetin go make your work experience better?', required: false },
        ],
      },
    },
  },
  event_feedback: {
    titles: {
      ha: 'Ra\'ayin Bayan Taro',
      yo: 'Èsì Lẹ́yìn Ìṣẹ̀lẹ̀',
      ig: 'Nzaghachi Mgbe Emechara Mmemme',
    },
    en_pcm: {
      en: {
        title: 'Event Feedback Survey',
        description: 'Thanks for attending! A few quick questions about your experience.',
        questions: [
          { type: 'rating', label: 'How would you rate the event overall?', required: true },
          { type: 'multiple_choice', label: 'How did you hear about this event?', required: false, options: ['Social media', 'WhatsApp', 'A friend', 'Email', 'Other'] },
          { type: 'checkbox', label: 'What did you enjoy most?', required: false, options: ['Content/speakers', 'Networking', 'Venue', 'Food and drinks', 'Organization'] },
          { type: 'textarea', label: 'What could we improve for next time?', required: false },
          { type: 'nps', label: 'How likely are you to attend a future event by us?', required: false },
        ],
      },
      pcm: {
        title: 'Survey For Event Feedback',
        description: 'Thank you say you come! Small small questions about your experience.',
        questions: [
          { type: 'rating', label: 'How you go rate the event for everything?', required: true },
          { type: 'multiple_choice', label: 'How you take hear about this event?', required: false, options: ['Social media', 'WhatsApp', 'Person tell me', 'Email', 'Another way'] },
          { type: 'checkbox', label: 'Wetin you enjoy pass?', required: false, options: ['Content/speakers', 'Networking', 'The venue', 'Food and drinks', 'How dem organize am'] },
          { type: 'textarea', label: 'Wetin we go fit improve next time?', required: false },
          { type: 'nps', label: 'How likely you go take attend another event wey we organize?', required: false },
        ],
      },
    },
  },
};
