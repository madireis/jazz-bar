import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const JazzBar = lazy(() => import("@/components/jazzbar/JazzBar"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Jazz Bar — A Cozy Focus Lounge" },
      { name: "description", content: "A browser-based focus app themed as a cozy ASCII jazz lounge. Start a session and watch your bar slowly come to life." },
      { property: "og:title", content: "Jazz Bar — A Cozy Focus Lounge" },
      { property: "og:description", content: "Pomodoro focus timer with a progressive ASCII jazz bar scene, layered ambient atmosphere, and particle effects." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-background font-mono text-sm uppercase tracking-[0.4em] text-amber">
          ~ * jazz bar * ~
        </div>
      }
    >
      <JazzBar />
    </Suspense>
  );
}
