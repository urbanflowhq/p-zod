---
"@urbanflow/p-zod": minor
---

Add `quantile(distribution, u)`, an inverse CDF for the uniform, triangular, normal (including truncated), bernoulli, binomial, poisson, exponential, discrete uniform, geometric, and categorical distributions. Gamma and beta throw the new `UnsupportedQuantileError`. Sampling accepts a `uniform: (id, draw) => number` option that maps one caller-supplied uniform per RV ID through that RV's quantile, so models with different RV sets give equal values for shared IDs. Sampling without the option is unchanged.
