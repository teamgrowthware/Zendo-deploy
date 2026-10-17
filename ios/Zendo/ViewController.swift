import UIKit
import WebKit

final class ViewController: UIViewController, WKNavigationDelegate {
    private let web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    private let address = UITextField()
    private let defaultsKey = "zendo.node"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.04, green: 0.04, blue: 0.04, alpha: 1)
        web.navigationDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.translatesAutoresizingMaskIntoConstraints = false

        address.borderStyle = .roundedRect
        address.keyboardType = .URL
        address.autocapitalizationType = .none
        address.autocorrectionType = .no
        address.textColor = .white
        address.backgroundColor = UIColor(white: 0.12, alpha: 1)
        address.attributedPlaceholder = NSAttributedString(
            string: "https://your.domain.example",
            attributes: [.foregroundColor: UIColor(white: 1, alpha: 0.45)]
        )
        address.returnKeyType = .go
        address.addTarget(self, action: #selector(openNode), for: .editingDidEndOnExit)
        address.translatesAutoresizingMaskIntoConstraints = false

        let open = button("Open", filled: true, action: #selector(openNode))
        let privacy = button("Privacy", filled: false, action: #selector(openPrivacy))
        let row = UIStackView(arrangedSubviews: [address, open, privacy])
        row.axis = .horizontal
        row.spacing = 8
        row.translatesAutoresizingMaskIntoConstraints = false
        address.setContentHuggingPriority(.defaultLow, for: .horizontal)

        view.addSubview(row)
        view.addSubview(web)
        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: guide.topAnchor, constant: 8),
            row.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 8),
            row.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -8),
            web.topAnchor.constraint(equalTo: row.bottomAnchor, constant: 8),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let saved = UserDefaults.standard.string(forKey: defaultsKey) ?? bakedNode()
        address.text = saved
        if let url = httpsURL(saved) {
            web.load(URLRequest(url: url))
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url, url.scheme?.lowercased() == "https" else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let url = webView.url, url.scheme?.lowercased() == "https", let host = url.host else { return }
        let origin = "https://\(host)\(url.port.map { ":\($0)" } ?? "")"
        address.text = origin
        UserDefaults.standard.set(origin, forKey: defaultsKey)
    }

    @objc private func openNode() {
        guard let url = httpsURL(address.text ?? "") else {
            presentNotice("Enter the https address of your Zendo node.")
            return
        }
        address.text = url.absoluteString
        UserDefaults.standard.set(url.absoluteString, forKey: defaultsKey)
        web.load(URLRequest(url: url))
    }

    @objc private func openPrivacy() {
        guard let url = httpsURL(address.text ?? "") else {
            presentNotice("Enter the https address of your Zendo node.")
            return
        }
        var parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
        parts?.path = "/privacy"
        parts?.query = nil
        parts?.fragment = nil
        guard let privacy = parts?.url else { return }
        web.load(URLRequest(url: privacy))
    }

    private func bakedNode() -> String {
        (Bundle.main.object(forInfoDictionaryKey: "ZendoNodeURL") as? String) ?? ""
    }

    private func httpsURL(_ raw: String) -> URL? {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty { value = bakedNode().trimmingCharacters(in: .whitespacesAndNewlines) }
        if value.isEmpty { return nil }
        if value.lowercased().hasPrefix("http://") {
            value = "https://" + value.dropFirst("http://".count)
        } else if !value.lowercased().hasPrefix("https://") {
            value = "https://" + value
        }
        guard let url = URL(string: value), url.scheme?.lowercased() == "https", let host = url.host, !host.isEmpty else {
            return nil
        }
        return url
    }

    private func button(_ title: String, filled: Bool, action: Selector) -> UIButton {
        var config = UIButton.Configuration.plain()
        config.title = title
        config.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12)
        config.baseForegroundColor = filled
            ? UIColor(red: 0.04, green: 0.04, blue: 0.04, alpha: 1)
            : UIColor(red: 0.78, green: 1, blue: 0, alpha: 1)
        config.baseBackgroundColor = filled ? UIColor(red: 0.78, green: 1, blue: 0, alpha: 1) : .clear
        config.background.cornerRadius = 8
        let button = UIButton(configuration: config)
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    private func presentNotice(_ message: String) {
        let alert = UIAlertController(title: "Zendo", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}
