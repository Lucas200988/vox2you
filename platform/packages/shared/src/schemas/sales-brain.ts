import { z } from 'zod'

export const ObjectionSchema = z.object({
  key: z.string(), // price | time | think | spouse | later | distance | trust | ...
  triggers: z.array(z.string()).default([]), // example phrases
  strategy: z.string(), // how to handle
  responseHints: z.array(z.string()).default([]),
  nextStep: z.string().optional(),
})

export const PersonaSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  typicalPains: z.array(z.string()).default([]),
  recommendedProducts: z.array(z.string()).default([]), // product slugs
  discoveryQuestions: z.array(z.string()).default([]),
})

export const SignalSchema = z.object({
  key: z.string(), // shame | camera_block | team_sales | presentation | leadership | ...
  examples: z.array(z.string()).default([]),
  meaning: z.string(),
  factKey: z.string().optional(),
  factValue: z.string().optional(),
  recommendedProducts: z.array(z.string()).default([]),
})

export const HandoffRuleSchema = z.object({
  key: z.string(),
  description: z.string(),
  enabled: z.boolean().default(true),
})

export const SalesBrainSchema = z.object({
  methodology: z.string().default(''),
  toneGuidelines: z.array(z.string()).default([]),
  discoveryQuestions: z.array(z.string()).default([]),
  buyingTriggers: z.array(z.string()).default([]),
  personas: z.array(PersonaSchema).default([]),
  signals: z.array(SignalSchema).default([]),
  objections: z.array(ObjectionSchema).default([]),
  proofPoints: z.array(z.string()).default([]),
  stories: z.array(z.string()).default([]),
  competitors: z.array(z.object({ name: z.string(), positioning: z.string() })).default([]),
  commercialRules: z.array(z.string()).default([]),
  discountRules: z.array(z.string()).default([]),
  nextBestStepRules: z.array(z.string()).default([]),
  qualificationCriteria: z.array(z.string()).default([]),
  handoffRules: z.array(HandoffRuleSchema).default([]),
  forbidden: z.array(z.string()).default([]),
})

export type SalesBrain = z.infer<typeof SalesBrainSchema>
export type SalesBrainInput = z.input<typeof SalesBrainSchema>
export type SalesBrainObjection = z.infer<typeof ObjectionSchema>
export type SalesBrainPersona = z.infer<typeof PersonaSchema>
export type SalesBrainSignal = z.infer<typeof SignalSchema>
