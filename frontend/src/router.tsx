import { QueryClient, dehydrate, hydrate, type DehydratedState } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * One router — and one QueryClient — per request on the server, and a single
 * pair in the browser.
 *
 * The `dehydrate`/`hydrate` pair below carries the server's query cache into
 * the client. Route loaders prefetch through `ensureQueryData` (site settings
 * for the header and footer, the home page's CMS sections, products and
 * categories), so on the server those queries resolve before the HTML is
 * rendered. Without this wiring the browser started with an empty cache, so the
 * first client render fell back to the empty defaults — an empty CMS nav, no
 * products — and produced different markup than the server had sent. React
 * reported "Hydration failed" and discarded the whole tree to re-render it.
 *
 * The state is passed as a JSON string. Everything in the cache at this point
 * came from `response.json()` in the API client, so a JSON round trip is
 * lossless by construction, and a string is unambiguously serialisable — React
 * Query's `DehydratedState` is not, because its `queryKey` is typed
 * `readonly unknown[]` and the router's serialisation validator cannot prove
 * `unknown` is safe.
 *
 * Only data actually fetched during SSR is serialised. The authenticated
 * queries (`/auth/me`, cart, wishlist, chat) stay disabled until the client has
 * hydrated, so no customer data is ever written into the HTML.
 */
export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    dehydrate: () => ({ queryClientState: JSON.stringify(dehydrate(queryClient)) }),
    hydrate: ({ queryClientState }) => {
      hydrate(queryClient, JSON.parse(queryClientState) as DehydratedState);
    },
  });

  return router;
};
