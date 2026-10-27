import { redirect } from "next/navigation";

// Serve the original Windy landing page as a static asset on the same origin
// as the Discord HTTP interactions endpoint at /api/discord/interactions.
export default function HomePage() {
  redirect("/windy-index.html" );
}
