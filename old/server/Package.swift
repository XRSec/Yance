// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Yance",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/vapor/vapor.git", from: "4.110.0"),
        .package(url: "https://github.com/stephencelis/SQLite.swift.git", from: "0.15.3"),
    ],
    targets: [
        .executableTarget(
            name: "Yance",
            dependencies: [
                .product(name: "Vapor", package: "vapor"),
                .product(name: "SQLite", package: "SQLite.swift"),
            ]
        ),
        .testTarget(
            name: "YanceTests",
            dependencies: ["Yance"]
        ),
    ]
)
