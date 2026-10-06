export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        background: "#0a0a0a",
        color: "#f5f5f5",
      }}
    >
      <section style={{ maxWidth: 760, width: "100%" }}>
        <p style={{ color: "#22c55e", fontWeight: 700 }}>● ONLINE</p>
        <h1 style={{ fontSize: "clamp(2rem, 8vw, 4.5rem)", margin: "0 0 1rem" }}>
          YesWeHack MCP Server
        </h1>
        <p style={{ lineHeight: 1.7, color: "#bdbdbd" }}>
          ChatGPT-compatible Streamable HTTP MCP transport:
        </p>
        <pre
          style={{
            overflowX: "auto",
            padding: "1rem",
            border: "1px solid #2b2b2b",
            borderRadius: 12,
            background: "#111",
          }}
        >
          /api/mcp
        </pre>
        <p style={{ lineHeight: 1.7, color: "#bdbdbd" }}>
          Account linking now brokers ChatGPT OAuth to YesWeHack&apos;s official
          OAuth authorization-code flow. The browser is redirected to the real
          YesWeHack authorization page, so YesWeHack handles passkeys, 2FA, and
          account authentication directly. This server never asks for or stores
          your YesWeHack password or passkey.
        </p>
        <p style={{ lineHeight: 1.7, color: "#777" }}>
          <a href="/.well-known/oauth-protected-resource" style={{ color: "#60a5fa" }}>
            protected resource
          </a>
          {" · "}
          <a href="/.well-known/oauth-authorization-server" style={{ color: "#60a5fa" }}>
            authorization server
          </a>
          {" · "}
          <a href="/api/health" style={{ color: "#60a5fa" }}>
            health
          </a>
        </p>
      </section>
    </main>
  );
}
