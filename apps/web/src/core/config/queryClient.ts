import { MutationCache, QueryClient } from "@tanstack/react-query";

const tabId = crypto.randomUUID();
const syncChannel = typeof BroadcastChannel === "undefined"
  ? null
  : new BroadcastChannel("madaar-query-sync");

export const createQueryClient = () => new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => syncChannel?.postMessage({ type: "invalidate", tabId }),
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
      staleTime: 30_000,
      refetchOnMount: true,
    },
    mutations: { retry: 0 },
  },
});

export const queryClient = createQueryClient();

syncChannel?.addEventListener("message", (event: MessageEvent<{ type?: string; tabId?: string }>) => {
  if (event.data?.type === "invalidate" && event.data.tabId !== tabId) {
    void queryClient.invalidateQueries();
  }
});
