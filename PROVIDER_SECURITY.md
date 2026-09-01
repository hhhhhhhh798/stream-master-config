# Provider signature security

StreamMaster executes provider JavaScript inside V8, so provider authenticity is enforced with detached ECDSA signatures.

## Files

- `github/provider-signatures.json` — SHA-256 + ECDSA signature for every `github/providers/**/*.js`.
- `tools/provider-signing-public.pem` — public verification key; safe to commit.
- `tools/sign-providers.js` — signs provider sources in GitHub Actions.
- `tools/verify-provider-signatures.js` — verifies the checked-in manifest.
- `.github/workflows/sign-providers.yml` — manual/automatic signing workflow.

## GitHub Secret

Create the repository secret:

`PROVIDER_SIGNING_PRIVATE_KEY`

Paste the complete contents of the private PEM generated for this repository. Never commit that private key.

After changing a provider, push to `main` and the signing workflow will regenerate the manifest and commit it.

## Important

The app verifies the provider's exact downloaded bytes against both SHA-256 and the embedded public key before executing them. An unsigned or modified provider is rejected.

The public provider source is intentionally not hidden. The signature provides authenticity, not secrecy.
