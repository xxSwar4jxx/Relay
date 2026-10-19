import { redirect } from "next/navigation";

// Serve the original Relay landing page as a static asset on the same origin
// as the Discord HTTP interactions endpoint at /api/discord/interactions.
export default function HomePage() {
  redirect("/relay-index.html");
}
