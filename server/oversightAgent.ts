import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ConversationContext {
  topic: string;
  relevanceScore: number;
  messageCount: number;
  offTopicStreak: number;
}

interface OversightAnalysis {
  isOffTopic: boolean;
  relevanceScore: number;
  suggestedRedirect?: string;
  shouldIntervene: boolean;
}

/**
 * Analyzes conversation history to establish the main topic
 */
export async function establishConversationTopic(
  chatHistory: Array<{ role: string; content: string }>,
  currentMessage: string
): Promise<string> {
  try {
    // Look at first few messages to identify main topic
    const relevantMessages = chatHistory.slice(0, 6).concat([{ role: 'user', content: currentMessage }]);
    const conversationText = relevantMessages.map(m => m.content).join(' ');

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Analyze this conversation and identify the main topic in 2-4 words. 
          
Examples:
- "Mandarin learning"
- "File management" 
- "Python programming"
- "Project planning"
- "Document analysis"

Return only the topic, nothing else.`
        },
        {
          role: "user",
          content: `Conversation: ${conversationText.slice(0, 1000)}`
        }
      ],
      temperature: 0.3,
      max_tokens: 50
    });

    return response.choices[0].message.content?.trim() || "General conversation";
  } catch (error) {
    console.error("Error establishing topic:", error);
    return "General conversation";
  }
}

/**
 * Analyzes if current message is off-topic and needs redirection
 */
export async function analyzeMessageRelevance(
  message: string,
  topic: string,
  recentMessages: Array<{ role: string; content: string }>
): Promise<OversightAnalysis> {
  try {
    const recentContext = recentMessages.slice(-4).map(m => m.content).join(' ');

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a conversation oversight agent. Analyze if the user's message is relevant to the established topic.

Main topic: "${topic}"
Recent context: ${recentContext}

Score the relevance from 0-100:
- 80-100: Highly relevant 
- 50-79: Somewhat relevant
- 20-49: Loosely related
- 0-19: Off-topic

Response format (JSON):
{
  "relevanceScore": number,
  "isOffTopic": boolean,
  "reasoning": "brief explanation",
  "suggestedRedirect": "if off-topic, suggest how to bridge back to main topic"
}`
        },
        {
          role: "user",
          content: `User message: "${message}"`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 200
    });

    const analysis = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
      isOffTopic: analysis.relevanceScore < 30,
      relevanceScore: analysis.relevanceScore || 50,
      suggestedRedirect: analysis.suggestedRedirect,
      shouldIntervene: analysis.relevanceScore < 30
    };
  } catch (error) {
    console.error("Error analyzing relevance:", error);
    return {
      isOffTopic: false,
      relevanceScore: 50,
      shouldIntervene: false
    };
  }
}

/**
 * Generates oversight instructions for the main agent
 */
export function generateOversightInstructions(
  analysis: OversightAnalysis,
  topic: string,
  offTopicStreak: number
): string {
  if (!analysis.shouldIntervene) {
    return `Main conversation topic: "${topic}". Continue the conversation naturally while staying focused on this topic.`;
  }

  const interventionLevel = offTopicStreak > 2 ? "strong" : "gentle";
  
  return `OVERSIGHT INSTRUCTION: The user has asked something off-topic from "${topic}". 
  
  Your response should:
  1. Briefly acknowledge their off-topic question (1-2 sentences max)
  2. ${interventionLevel === "strong" ? "Clearly but politely" : "Gently"} redirect back to "${topic}"
  3. ${analysis.suggestedRedirect ? `Use this transition: "${analysis.suggestedRedirect}"` : `Find a creative way to connect their question back to ${topic}`}
  4. Continue the conversation about "${topic}"
  
  Example pattern: "Bitcoin is currently around $43k. Speaking of values - did you know that Mandarin tones actually change the meaning and 'value' of words? Let's continue working on your tone practice..."`;
}

/**
 * Main oversight function that coordinates topic tracking and intervention
 */
export async function processWithOversight(
  message: string,
  chatHistory: Array<{ role: string; content: string }>,
  conversationContext?: ConversationContext
): Promise<{
  oversightInstructions: string;
  updatedContext: ConversationContext;
}> {
  try {
    // Establish or use existing topic
    let topic = conversationContext?.topic;
    if (!topic || chatHistory.length < 3) {
      topic = await establishConversationTopic(chatHistory, message);
    }

    // Analyze current message relevance
    const analysis = await analyzeMessageRelevance(message, topic, chatHistory);

    // Update context
    const offTopicStreak = analysis.isOffTopic 
      ? (conversationContext?.offTopicStreak || 0) + 1 
      : 0;

    const updatedContext: ConversationContext = {
      topic,
      relevanceScore: analysis.relevanceScore,
      messageCount: (conversationContext?.messageCount || 0) + 1,
      offTopicStreak
    };

    // Generate instructions for main agent
    const oversightInstructions = generateOversightInstructions(
      analysis, 
      topic, 
      offTopicStreak
    );

    return {
      oversightInstructions,
      updatedContext
    };
  } catch (error) {
    console.error("Error in oversight processing:", error);
    return {
      oversightInstructions: "Continue the conversation naturally.",
      updatedContext: conversationContext || {
        topic: "General conversation",
        relevanceScore: 50,
        messageCount: 1,
        offTopicStreak: 0
      }
    };
  }
}