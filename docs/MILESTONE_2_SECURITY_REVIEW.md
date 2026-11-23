# Milestone 2 security review

Reviewed PR #3 head `2c201fb` and its merge `00a385c` on `foundation/nexus-specs`. GitHub already recorded the merge before this review. The Node 22 [PR workflow](https://github.com/duffpowell-commits/AI-nexus/actions/runs/45099201784) passed. A fresh local check on Node 24 passed typecheck, lint, 11 tests, production build, and smoke. npm audit returned zero advisories. A targeted credential-pattern scan of tracked history returned no matches. A production bundle built with four fake server credential values contained none of the values.

## Critical and high

No findings in the reviewed single-host, trusted-reverse-proxy deployment. Authentication regenerates sessions on login, expiry and logout are enforced in SQLite, cookies are scoped and protected, and mutation routes require a matching origin and custom header. Project, transcript and cancellation routes check the signed-in account. Compare omits prior history. The OpenAI adapter holds credentials on the server, disables SDK retries, and returns generic failures to the browser. The provider signal combines disconnect, stop, and timeout. SQLite parameterizes user input and reserves the live request count transactionally.

## Moderate

- The proxy must overwrite forwarded protocol and IP headers. Incorrect proxy configuration can invalidate the source IP throttling or HTTPS assumptions. The deployment guide defines this boundary.
- The Milestone 2 lifetime count limits upstream requests. It provides no token ledger, dollar estimate, or dollar-denominated reservations. Milestone 3 adds these controls.
- A deployment with many provisioned users can hold one generation per user. The service also relies on per-IP login limits and process-local throttling. Capacity planning and edge rate limits remain relevant for deployments beyond a trusted single host.

## Low

- A process crash can leave a saved turn with no reply. Milestone 3 keeps any interrupted usage reservation, so a crash does not reset spending authorization.
- Security tests cover sessions, isolation, CSRF, persistence, cancellation, throttling, sanitized failures, and a deterministic OpenAI transport. The original suite covers dependency and PWA assets through checks outside the unit tests. Authorized vendor accounts and physical Android installation require separate validation.
