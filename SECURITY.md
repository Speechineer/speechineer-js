# Security policy

## Reporting a vulnerability

Please report security issues in the Speechineer SDK **privately** — do not open a public
issue.

- Email: **security@speechineer.com**
- Include: the package and version, a description of the issue, steps to reproduce, and
  the impact you see. Encrypting your report is welcome; ask for our key in a first,
  content-free email.

You will receive an acknowledgement within **3 business days** and a status update at least
every **10 business days** until the issue is resolved. We coordinate disclosure with you and
credit reporters who wish to be named.

## Scope

This policy covers the published packages `@speechineer/js`, `@speechineer/react` and
`@speechineer/angular`, and the code in this repository. Issues in the Speechineer service
itself may be reported to the same address.

## Supported versions

| Version | Supported |
|---|---|
| the latest minor (0.7.x) | yes |
| earlier | no — please upgrade |

The SDK ships no third-party runtime code (its runtime has no dependencies), so advisories
against bundled libraries do not apply; the dev toolchain is kept current via Dependabot.
