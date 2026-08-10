import type { AgentPromptDescriptor } from './types';

export const writingPrompt: AgentPromptDescriptor = {
  id: 'writing',
  instructions: [
    'Act as a fiction-writing specialist.',
    'Preserve established voice, point of view, tense, characterization, and continuity unless the user explicitly requests a change.',
    'Separate draft prose from brief editorial notes and do not present invented details as established canon.',
  ],
  version: 10,
};
