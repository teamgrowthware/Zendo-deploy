import Foundation

/// HTTP client for the Zendo chain. Supply and fees: docs/whitepaper-body.html.
public struct ZendoClient {
    public var baseURL: URL

    public init(baseURL: URL = URL(string: "http://127.0.0.1:38471")!) {
        self.baseURL = baseURL
    }

    public func connectNode() async throws -> Data {
        try await get("/api/chain?view=status")
    }

    public func getBalance(address: String, token: String = "ZCOIN") async throws -> Data {
        let body: [String: Any] = [
            "jsonrpc": "2.0",
            "id": 1,
            "method": "zendo_getBalance",
            "params": [address, token],
        ]
        return try await post("/api/rpc", json: body)
    }

    public func estimateGas() async throws -> Data {
        try await get("/api/chain?view=fees")
    }

    public func sendTransaction(to: String, amount: String, token: String = "ZCOIN") async throws -> Data {
        try await post("/api/wallet/send", json: ["to": to, "amount": amount, "token": token])
    }

    public func stakeTokens(validatorId: String, amount: String) async throws -> Data {
        try await post("/api/stake/delegate", json: ["validatorId": validatorId, "amount": amount])
    }

    public func voteProposal(proposalId: String, choice: String) async throws -> Data {
        try await post("/api/governance/\(proposalId)", json: ["choice": choice])
    }

    public func propose(title: String, body: String, key: String, value: String) async throws -> Data {
        try await post("/api/governance", json: ["title": title, "body": body, "key": key, "value": value])
    }

    public func fileGrant(title: String, body: String, milestone: String, amount: String) async throws -> Data {
        try await post("/api/grants", json: ["title": title, "body": body, "milestone": milestone, "amount": amount])
    }

    public func voteGrant(grantId: String, choice: String) async throws -> Data {
        try await post("/api/grants/\(grantId)", json: ["choice": choice])
    }

    public func publishListing(name: String, summary: String, kind: String) async throws -> Data {
        try await post("/api/market", json: ["name": name, "summary": summary, "kind": kind])
    }

    public func deployContract(name: String, symbol: String, description: String, emoji: String, hue: Int) async throws -> Data {
        try await post("/api/coins", json: [
            "name": name,
            "symbol": symbol,
            "description": description,
            "emoji": emoji,
            "hue": hue,
        ])
    }

    public func callContract(mint: String, side: String, amount: String) async throws -> Data {
        try await post("/api/coins/\(mint)/trade", json: ["side": side, "amount": amount])
    }

    public func nodeStaking() async throws -> Data {
        try await post("/api/node", json: ["method": "zendo_staking", "params": [] as [String]])
    }

    public func nodeValidators() async throws -> Data {
        try await post("/api/node", json: ["method": "zendo_validators", "params": [] as [String]])
    }

    public func nodeGovernance(contract: String) async throws -> Data {
        try await post("/api/node", json: ["method": "zendo_governance", "params": [contract]])
    }

    private func get(_ path: String) async throws -> Data {
        let (data, _) = try await URLSession.shared.data(from: baseURL.appendingPathComponent(path))
        return data
    }

    private func post(_ path: String, json: [String: Any]) async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: json)
        let (data, _) = try await URLSession.shared.data(for: request)
        return data
    }
}
