# iPhone installation in Australia — checked 24 October 2026

The recent Australian ruling does **not** currently provide a permanent,
free-developer installation route for Base's native SwiftUI app.

The Federal Court's **Epic Games Inc v Apple Inc (No 2) [2026] FCA 1552** orders
3–11 commence at noon Melbourne time on **1 March 2027** (order 12), with a
possible court-approved extension to **3 May 2027** under order 13. Definition B
and paragraph 14 expressly refer to developers who remain members of the Apple
Developer Program. Alternative stores therefore do not, by themselves, eliminate
the developer membership requirement or establish that unsigned personal apps
can remain installed indefinitely. Future implementation or appeal changes must
be checked again when Apple publishes Australian distribution requirements.

Apple's current alternative-distribution support page lists Brazil, Japan and
the EU, not Australia. Apple documents that free Xcode Personal Team provisioning
expires after **seven days**; rebuilding/reinstalling is still needed. Automatic
refresh tools can make that less manual, but do not turn a seven-day profile into
a permanent distribution signature.

For an option without developer membership or weekly native provisioning, open
the Base browser client in Safari and use **Share → Add to Home Screen**. That
installs a web app, not the SwiftUI/WidgetKit client; it does not establish parity
with native iPhone features or remove Cloud account requirements. Existing
native development and widgets remain available through Xcode provisioning.

Sources:

- [Federal Court judgment, definitions and orders 12–13](https://www.judgments.fedcourt.gov.au/judgments/Judgments/fca/single/2026/2026fca1552)
- [Apple: developer account / Personal Team limitations](https://developer.apple.com/help/account/basics/about-your-developer-account)
- [Apple: alternative app distribution availability](https://support.apple.com/en-au/118110)
