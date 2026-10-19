export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: "12vh auto", padding: "24px" }}>
      <p style={{ color: "#a1a1aa", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12 }}>Discord ticket system</p>
      <h1 style={{ fontSize: 48, margin: "12px 0" }}>Relay</h1>
      <p style={{ color: "#c4c4cc", lineHeight: 1.7 }}>
        Relay is running on its HTTP interaction runtime. Discord interactions are handled at
        <code style={{ marginLeft: 6 }}>/api/discord/interactions</code>.
      </p>
    </main>
  );
}
