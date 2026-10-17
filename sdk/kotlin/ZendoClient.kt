package network.zendo.sdk

import java.net.HttpURLConnection
import java.net.URI

/** HTTP client for the Zendo chain. Supply and fees: docs/whitepaper-body.html */
class ZendoClient(private val baseUrl: String = "http://127.0.0.1:38471") {
    fun connectNode(): String = get("/api/chain?view=status")

    fun getBalance(address: String, token: String = "ZCOIN"): String {
        val body = """{"jsonrpc":"2.0","id":1,"method":"zendo_getBalance","params":["$address","$token"]}"""
        return post("/api/rpc", body)
    }

    fun estimateGas(): String = get("/api/chain?view=fees")

    fun sendTransaction(to: String, amount: String, token: String = "ZCOIN"): String =
        post("/api/wallet/send", """{"to":"$to","amount":"$amount","token":"$token"}""")

    fun deployContract(name: String, symbol: String, description: String, emoji: String, hue: Int): String =
        post("/api/coins", """{"name":"$name","symbol":"$symbol","description":"$description","emoji":"$emoji","hue":$hue}""")

    fun callContract(mint: String, side: String, amount: String): String =
        post("/api/coins/$mint/trade", """{"side":"$side","amount":"$amount"}""")

    fun stakeTokens(validatorId: String, amount: String): String =
        post("/api/stake/delegate", """{"validatorId":"$validatorId","amount":"$amount"}""")

    fun voteProposal(proposalId: String, choice: String): String =
        post("/api/governance/$proposalId", """{"choice":"$choice"}""")

    fun propose(title: String, body: String, key: String, value: String): String =
        post("/api/governance", """{"title":"$title","body":"$body","key":"$key","value":"$value"}""")

    fun fileGrant(title: String, body: String, milestone: String, amount: String): String =
        post("/api/grants", """{"title":"$title","body":"$body","milestone":"$milestone","amount":"$amount"}""")

    fun voteGrant(grantId: String, choice: String): String =
        post("/api/grants/$grantId", """{"choice":"$choice"}""")

    fun publishListing(name: String, summary: String, kind: String): String =
        post("/api/market", """{"name":"$name","summary":"$summary","kind":"$kind"}""")

    fun nodeStaking(): String = post("/api/node", """{"method":"zendo_staking","params":[]}""")

    fun nodeValidators(): String = post("/api/node", """{"method":"zendo_validators","params":[]}""")

    fun nodeGovernance(contract: String): String =
        post("/api/node", """{"method":"zendo_governance","params":["$contract"]}""")

    fun nodeCall(from: String, to: String, data: String): String =
        post("/api/node", """{"method":"zendo_call","params":[{"from":"$from","to":"$to","data":"$data"}]}""")

    private fun get(path: String): String = request("GET", path, null)

    private fun post(path: String, body: String): String = request("POST", path, body)

    private fun request(method: String, path: String, body: String?): String {
        val connection = URI(baseUrl + path).toURL().openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.setRequestProperty("content-type", "application/json")
        if (body != null) {
            connection.doOutput = true
            connection.outputStream.use { it.write(body.toByteArray()) }
        }
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        return stream.bufferedReader().readText()
    }
}
