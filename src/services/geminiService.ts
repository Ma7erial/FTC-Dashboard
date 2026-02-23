import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ 
  apiKey: (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "" 
});

export async function fetchFTCNews() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Search for the latest FIRST Tech Challenge (FTC) news, REV Robotics updates, and interesting engineering tips for robotics teams. Summarize the top 5 most relevant items for a high school robotics club. Include links if possible.",
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    return response.text || "No news found at the moment.";
  } catch (error) {
    console.error("Error fetching AI news:", error);
    return "Failed to fetch latest news. Please check your connection.";
  }
}

export async function getAttendanceInsights(records: any[], members: any[]) {
  try {
    const data = JSON.stringify({ records, members });
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `Analyze this attendance data for a robotics club and provide 3 key insights or suggestions for the leadership team. Keep it concise.\n\nData: ${data}`,
    });

    return response.text || "No insights available.";
  } catch (error) {
    console.error("Error getting insights:", error);
    return "Insights unavailable.";
  }
}

export async function checkExcuse(reason: string, criteria: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `Based on these criteria: "${criteria}", is the following reason for absence excused? Respond with "EXCUSED" or "UNEXCUSED" followed by a very brief explanation.\n\nReason: "${reason}"`,
    });
    return response.text || "UNEXCUSED - AI failed to analyze.";
  } catch (error) {
    return "UNEXCUSED - AI error.";
  }
}

export async function getActivitySummary(data: any) {
  try {
    const { tasks, messages, budget, userScope } = data;
    const payload = JSON.stringify({ tasks, messages, budget });
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `Provide a concise executive summary of the recent club activity based on the following data. 
      The user viewing this has the following role/scope: ${JSON.stringify(userScope)}. 
      Only include information that would be relevant or accessible to someone with this scope. 
      Highlight progress, concerns, and upcoming deadlines. Keep it professional and scannable.
      
      Data: ${payload}`,
    });

    return response.text || "No summary available.";
  } catch (error) {
    console.error("Error getting activity summary:", error);
    return "Summary unavailable.";
  }
}
