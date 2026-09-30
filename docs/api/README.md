# API documentation

`openapi.json` describes each route of the API in the OpenAPI 3.1 format: method, path,
parameters, accepted body, response and error codes, the latter in the problem details format
(RFC 7807) the API already returns (#45).

## Where it comes from

It is not written by hand. `apps/api/src/openapi/catalog.ts` lists the routes by designating, for
each one, the zod schemas of `packages/contracts` the route actually applies;
`apps/api/src/openapi/document.ts` renders them as JSON Schema 2020-12, which zod 4 produces
without an additional dependency.

## What keeps it from drifting

`apps/api/src/openapi/openapi.test.ts`, which runs with `npm test` and therefore in continuous
integration:

- the versioned file must be exactly the one the code produces; otherwise the test fails and
  names the command that fixes it, `npm run docs:api`;
- the documented list must be exactly that of the routes the application mounts, method by method,
  read from the application and not copied;
- each operation documents its `500` response, each error reference exists.

## Where to read it

<https://project-legacy-22.github.io/Project-Legacy/api/>, published by the `pages` workflow on
every integration into `dev`. The raw document is next to it, `openapi.json`, for a tool that
consumes it.

The document contains neither a secret nor an internal address: the two authentication schemes
name the session cookie and the header of the relay secret, never their value.
