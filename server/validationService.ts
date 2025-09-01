interface SessionParameters {
  courseTitle?: string;
  targetAudience?: string;
  teachingStyle?: string;
  expertiseSubject?: string;
  actionTypes?: string[];
  durations?: number[];
  difficultyLevels?: string[];
  additionalContext?: string;
}

interface Deviation {
  field: string;
  original: any;
  actual: any;
  severity: "high" | "medium" | "low";
}

export class ValidationService {
  /**
   * Compare two sets of parameters and identify deviations
   */
  static compareParameters(
    original: SessionParameters,
    actual: SessionParameters,
  ): {
    deviations: Deviation[];
    complianceScore: number;
  } {
    const deviations: Deviation[] = [];
    const weights = {
      courseTitle: 20,
      targetAudience: 15,
      teachingStyle: 15,
      expertiseSubject: 15,
      actionTypes: 10,
      durations: 10,
      difficultyLevels: 10,
      additionalContext: 5,
    };

    let totalWeight = 0;
    let matchedWeight = 0;

    // Compare string fields
    const stringFields: (keyof SessionParameters)[] = [
      "courseTitle",
      "targetAudience",
      "teachingStyle",
      "expertiseSubject",
    ];

    for (const field of stringFields) {
      if (original[field] !== undefined) {
        totalWeight += weights[field];

        if (original[field] !== actual[field]) {
          const severity = this.determineSeverity(
            field,
            original[field],
            actual[field],
          );
          deviations.push({
            field: this.formatFieldName(field),
            original: original[field] || "Not specified",
            actual: actual[field] || "Not specified",
            severity,
          });
        } else {
          matchedWeight += weights[field];
        }
      }
    }

    // Compare array fields
    const arrayFields: (keyof SessionParameters)[] = [
      "actionTypes",
      "durations",
      "difficultyLevels",
    ];

    for (const field of arrayFields) {
      if (original[field] !== undefined && Array.isArray(original[field])) {
        totalWeight += weights[field];
        const originalArray = original[field] as any[];
        const actualArray = (actual[field] || []) as any[];

        if (!this.arraysEqual(originalArray, actualArray)) {
          const severity = this.determineSeverity(
            field,
            originalArray,
            actualArray,
          );
          deviations.push({
            field: this.formatFieldName(field),
            original: originalArray,
            actual: actualArray.length > 0 ? actualArray : ["None specified"],
            severity,
          });
        } else {
          matchedWeight += weights[field];
        }
      }
    }

    // Handle additional context separately (less strict comparison)
    if (original.additionalContext !== undefined) {
      totalWeight += weights.additionalContext;

      if (original.additionalContext && actual.additionalContext) {
        // Check if key concepts from original are present in actual
        const similarity = this.textSimilarity(
          original.additionalContext,
          actual.additionalContext,
        );
        if (similarity < 0.5) {
          deviations.push({
            field: "Additional Context",
            original: original.additionalContext,
            actual: actual.additionalContext || "Not specified",
            severity: "low",
          });
        } else {
          matchedWeight += weights.additionalContext * similarity;
        }
      } else if (original.additionalContext !== actual.additionalContext) {
        deviations.push({
          field: "Additional Context",
          original: original.additionalContext || "Not specified",
          actual: actual.additionalContext || "Not specified",
          severity: "low",
        });
      } else {
        matchedWeight += weights.additionalContext;
      }
    }

    // Calculate compliance score
    const complianceScore =
      totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 100;

    return {
      deviations,
      complianceScore: Math.round(complianceScore * 10) / 10,
    };
  }

  /**
   * Extract parameters from a chat session
   */
  static extractParametersFromChatSession(
    chatHistory: any[],
  ): SessionParameters {
    const extracted: SessionParameters = {};

    // Analyze chat history to extract mentioned parameters
    // This is a simplified version - you might want to enhance with NLP
    for (const message of chatHistory) {
      if (message.role === "assistant" || message.role === "teacher") {
        const content = message.content.toLowerCase();

        // Try to extract teaching style mentions
        if (content.includes("visual") && !extracted.teachingStyle) {
          extracted.teachingStyle = "visual";
        } else if (
          content.includes("storytelling") &&
          !extracted.teachingStyle
        ) {
          extracted.teachingStyle = "storytelling";
        } else if (content.includes("hands-on") && !extracted.teachingStyle) {
          extracted.teachingStyle = "hands-on";
        } else if (content.includes("discussion") && !extracted.teachingStyle) {
          extracted.teachingStyle = "discussion";
        } else if (content.includes("analytical") && !extracted.teachingStyle) {
          extracted.teachingStyle = "analytical";
        }

        // Extract difficulty levels mentioned
        if (!extracted.difficultyLevels) {
          const difficulties: string[] = [];
          if (content.includes("beginner")) difficulties.push("beginner");
          if (content.includes("intermediate"))
            difficulties.push("intermediate");
          if (content.includes("advanced")) difficulties.push("advanced");
          if (difficulties.length > 0) {
            extracted.difficultyLevels = difficulties;
          }
        }

        // Extract action types
        if (!extracted.actionTypes) {
          const actions: string[] = [];
          if (content.includes("lecture")) actions.push("lecture");
          if (content.includes("discussion")) actions.push("discussion");
          if (content.includes("activity") || content.includes("exercise"))
            actions.push("activity");
          if (content.includes("assessment") || content.includes("quiz"))
            actions.push("assessment");
          if (content.includes("project")) actions.push("project");
          if (actions.length > 0) {
            extracted.actionTypes = actions;
          }
        }
      }
    }

    return extracted;
  }

  private static formatFieldName(field: string): string {
    return field
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  }

  private static determineSeverity(
    field: string,
    original: any,
    actual: any,
  ): "high" | "medium" | "low" {
    // Critical fields
    if (["courseTitle", "targetAudience"].includes(field)) {
      return "high";
    }

    // Important fields
    if (["teachingStyle", "expertiseSubject", "actionTypes"].includes(field)) {
      return "medium";
    }

    // Less critical fields
    return "low";
  }

  private static arraysEqual(a: any[], b: any[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, index) => val === sortedB[index]);
  }

  private static textSimilarity(text1: string, text2: string): number {
    // Simple word-based similarity
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const set1 = new Set(words1);
    const set2 = new Set(words2);

    const intersection = new Set(Array.from(set1).filter((x) => set2.has(x)));
    const union = new Set([...Array.from(set1), ...Array.from(set2)]);

    return intersection.size / union.size;
  }
}
