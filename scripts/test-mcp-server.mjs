import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new McpServer({ name: 'yance-test-mcp', version: '0.1.0' })

server.registerTool(
  'list_recent_messages',
  { description: 'Return a deterministic synthetic recent-message list for Yance integration tests.' },
  async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify([
          {
            id: 'msg-001',
            conversationId: 'conversation-001',
            sender: 'synthetic-contact',
            text: '测试消息',
            timestamp: '2026-08-28T04:00:00.000Z',
          },
        ]),
      },
    ],
  }),
)

server.registerTool(
  'get_chat_history',
  { description: 'Return synthetic chat history for connector capability mapping tests.' },
  async () => ({
    content: [{ type: 'text', text: 'synthetic history' }],
  }),
)

await server.connect(new StdioServerTransport())
