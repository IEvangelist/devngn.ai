import type { SkillSummary } from "@devngn/skills";

export interface PromptfooEvalPlan {
  description: string;
  providers: string[];
  prompts: string[];
  tests: Array<{
    vars: {
      skillName: string;
      skillPath: string;
    };
  }>;
}

export function createPromptfooEvalPlan(
  skills: readonly SkillSummary[],
): PromptfooEvalPlan {
  return {
    description: "devngn generated skill eval plan",
    providers: [],
    prompts: [
      "Validate that the skill named {{skillName}} is actionable and unambiguous.",
    ],
    tests: skills.map((skill) => ({
      vars: {
        skillName: skill.name,
        skillPath: skill.sourcePath,
      },
    })),
  };
}
