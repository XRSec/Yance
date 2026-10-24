/**
 * Minimal user-defined Yance Connector Adapter.
 *
 * The adapter receives a constrained context instead of importing Yance internals.
 * It can call tools from its own registered MCP and can emit normalized events.
 */
export default {
  async invoke(request, context) {
    context.emit('connector.adapter.invoke', {
      capabilityId: request.capabilityId,
      mappedTool: request.mappedTool,
    })

    return context.callTool(request.mappedTool, request.input)
  },

  async poll({ job }, context) {
    const result = await context.callTool(job.toolName, job.arguments)
    context.emit('connector.adapter.poll', {
      jobId: job.id,
      toolName: job.toolName,
    })
    return result
  },
}
