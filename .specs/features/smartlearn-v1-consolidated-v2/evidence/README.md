# Historical pure-module audit evidence

Source: DevulskyA/SmartLearn at fbfb7208169da1f66bf80ca38eaee881fbd5833e.

The original module/test are copied only to make the audit reproducible. They are not proposed production source. Their Git blob hashes were verified:
- learning-core.js: f00bf098f7f18dc91da152b9edbadd402020edde
- learning-core.test.js: 6d11f71ac2fc9fe8f35f8a727aec9423b5a11b7f

Commands executed in this directory:

```text
node --test learning-core.test.js
node adversarial-probes.mjs
```

Observed environment: Linux / Node v22.16.0, not the target Node24/Windows runtime. Original tests: 9/9 pass. Ten probes: characterized outputs reproduced. Probes assert the historical outputs, including undesirable outputs; they must never be reported as acceptance of those outputs. Preserve original source untouched; reconstruct improved behavior outside this evidence directory.
