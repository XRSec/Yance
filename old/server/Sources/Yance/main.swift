import Vapor

// Entry point. macOS backend of Yance.
//
// Note: this file is named `main.swift`, so Swift treats it as an executable
// with top-level code — an `@main` attribute must NOT be present here.

// Build the app (async-aware initializer in newer Vapor).
let app = try await Application.make(.detect())

// Configuration
app.http.server.configuration.hostname = "0.0.0.0"
app.http.server.configuration.port = 8080

// CORS
let corsConfiguration = CORSMiddleware.Configuration(
    allowedOrigin: .all,
    allowedMethods: [.GET, .POST, .PUT, .OPTIONS, .DELETE, .PATCH],
    allowedHeaders: [.accept, .authorization, .contentType, .origin,
                     .xRequestedWith, .userAgent, .accessControlAllowOrigin]
)
let cors = CORSMiddleware(configuration: corsConfiguration)
app.middleware.use(cors)

// Dependencies
let store = try MessageStore()
let llm = LLMGateway()

// Register Routes
try routes(app, store: store, llm: llm)

// Run until shutdown is signalled.
try await app.execute()
try await app.asyncShutdown()
