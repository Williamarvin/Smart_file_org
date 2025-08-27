#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const DIFY_URL = process.env.DIFY_URL || "https://api.dify.ai/v1/chat-messages";
const DIFY_API_KEY = process.env.DIFY_API_KEY || "app-LvXhkmLkvoRmdFnZrkc9X8AO";

class DifyBridgeServer {
  constructor() {
    this.server = new Server(
      {
        name: "dify-bridge",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
  }

  setupTools() {
    this.server.setRequestHandler("tools/list", async () => ({
      tools: [
        {
          name: "dify_chat",
          description: "Send messages to Dify AI and get responses",
          inputSchema: {
            type: "object",
            properties: {
              message: { 
                type: "string",
                description: "The message to send to Dify"
              },
              conversation_id: {
                type: "string",
                description: "Optional conversation ID for context"
              }
            },
            required: ["message"]
          }
        },
        {
          name: "dify_mcp_tools",
          description: "Access Dify's MCP tools (Zapier, Linear, Gmail, etc)",
          inputSchema: {
            type: "object",
            properties: {
              tool_name: { 
                type: "string",
                description: "Name of the MCP tool to use"
              },
              parameters: {
                type: "object",
                description: "Parameters for the tool"
              }
            },
            required: ["tool_name"]
          }
        }
      ]
    }));

    this.server.setRequestHandler("tools/call", async (request) => {
      const { name, arguments: args } = request.params;

      if (name === "dify_chat") {
        return await this.handleDifyChat(args);
      } else if (name === "dify_mcp_tools") {
        return await this.handleMcpTools(args);
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  async handleDifyChat(args) {
    try {
      const response = await fetch(DIFY_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DIFY_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: {},
          query: args.message,
          response_mode: "blocking",
          conversation_id: args.conversation_id || "",
          user: "claude-user"
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Dify request failed");
      }

      return {
        content: [
          {
            type: "text",
            text: data.answer || "No response from Dify"
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error calling Dify: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async handleMcpTools(args) {
    // This would need to be implemented based on Dify's actual MCP API
    // For now, this is a placeholder showing how it would work
    try {
      const response = await fetch(`${DIFY_URL}/tools/${args.tool_name}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DIFY_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(args.parameters || {})
      });

      const data = await response.json();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error calling MCP tool: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Dify Bridge MCP server running");
  }
}

const bridge = new DifyBridgeServer();
bridge.run().catch(console.error);